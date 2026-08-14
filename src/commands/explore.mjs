import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { loadConfig, paths, deepMerge } from '../config.mjs';
import { listFlowFiles, loadFlowFile } from '../flow/load.mjs';
import { validateFlow } from '../flow/schema.mjs';
import { writeFile, exists, ensureDir } from '../util/fs.mjs';
import { createAI } from '../ai/index.mjs';
import { log, pc } from '../util/log.mjs';
import YAML from 'yaml';
import { OUTLINE_FN, formatOutline } from '../capture/outline.mjs';

const ENGINES = { chromium, firefox, webkit };

async function crawl({ startUrl, depth, maxPages, engineName, config }) {
  const engine = ENGINES[engineName] || chromium;
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({
    viewport: config.viewport,
    locale: config.locale,
    ...(config.storageState && exists(config.storageState) ? { storageState: config.storageState } : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.timeout);

  const seen = new Set();
  const queue = [{ url: startUrl, d: 0 }];
  const pages = [];

  try {
    while (queue.length && pages.length < maxPages) {
      const { url, d } = queue.shift();
      const key = url.split('#')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(300);
      } catch (err) {
        log.warn(`could not load ${url}: ${err.message.split('\n')[0]}`);
        continue;
      }
      const outline = await page.evaluate(OUTLINE_FN, 25);
      pages.push({ ...outline, outline: formatOutline(outline) });
      log.ok(`explored ${outline.url}`);

      if (d < depth) {
        const origin = new URL(startUrl).origin;
        for (const link of outline.links) {
          if (!link.href || link.href.startsWith('#') || /^(mailto|tel|javascript):/i.test(link.href)) continue;
          let abs;
          try {
            abs = new URL(link.href, outline.url).toString();
          } catch {
            continue;
          }
          if (new URL(abs).origin !== origin) continue;
          if (!seen.has(abs.split('#')[0])) queue.push({ url: abs, d: d + 1 });
        }
      }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  return pages;
}

export async function exploreCommand(opts) {
  const { root, config: base } = loadConfig({ required: false });
  const config = deepMerge(base, {
    ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    ai: {
      ...(opts.ai === false ? { provider: 'none' } : {}),
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.model ? { model: opts.model } : {}),
    },
  });
  const p = paths(root, config);
  const startUrl = opts.url || config.baseUrl;
  const depth = Number(opts.depth ?? 0);
  const maxPages = Number(opts.maxPages ?? 8);

  log.title(`Exploring ${startUrl} (depth ${depth}, max ${maxPages} pages)`);
  const pages = await crawl({
    startUrl,
    depth,
    maxPages,
    engineName: opts.browser || config.browser,
    config,
  });

  if (!pages.length) throw new Error(`Could not load anything at ${startUrl}. Is the app running?`);

  if (!opts.plan && !opts.write) {
    log.title('Page outlines');
    console.log(pages.map((pg) => pg.outline).join('\n\n'));
    log.info(pc.dim('\nPass --plan to have the model propose guides, --write to scaffold flow specs.'));
    return { pages };
  }

  const ai = createAI(config.ai, { cwd: root });
  if (!ai.enabled) throw new Error('--plan/--write need an AI provider. Use --provider claude|gemini|codex.');

  log.step(`asking ${ai.provider} to plan the guide set…`);
  const plan = await ai.outline({ pages, style: config.style, goal: opts.goal });
  const guides = plan.guides || [];
  log.ok(`${guides.length} guides proposed`);
  for (const g of guides) console.log(`  ${pc.bold(g.id)} — ${g.title}\n    ${pc.dim(g.description || '')}`);

  if (!opts.write) return { pages, plan };

  ensureDir(p.flows);
  const existingIds = listFlowFiles(p.flows).map((f) => {
    try {
      return loadFlowFile(f).id;
    } catch {
      return null;
    }
  }).filter(Boolean);

  const written = [];
  for (const guide of guides) {
    const target = path.join(p.flows, `${guide.id}.flow.yaml`);
    if (exists(target) && !opts.force) {
      log.warn(`${guide.id}: flow already exists, skipping (use --force)`);
      continue;
    }
    const startPage = pages.find((pg) => pg.url === guide.startUrl) || pages[0];
    log.step(`${guide.id}: drafting flow spec…`);
    const yaml = await ai.flowSpec({
      goal: `${guide.title} — ${guide.description}. Rough steps: ${(guide.steps || []).join(' / ')}`,
      url: guide.startUrl || startPage.url,
      outline: startPage.outline,
      style: config.style,
      existingIds: [...existingIds, ...written.map((w) => w.id)],
    });

    let parsed;
    try {
      parsed = YAML.parse(yaml);
    } catch (err) {
      log.error(`${guide.id}: model produced invalid YAML — ${err.message}`);
      continue;
    }
    const check = validateFlow(parsed, { file: `${guide.id}.flow.yaml` });
    if (!check.ok) {
      log.error(`${guide.id}: draft failed validation:\n  ${check.errors.join('\n  ')}`);
      const rejected = path.join(p.flows, `${guide.id}.flow.yaml.rejected`);
      writeFile(rejected, yaml);
      log.info(`saved the rejected draft to ${path.relative(root, rejected)} for inspection`);
      continue;
    }
    writeFile(target, `${yaml.trim()}\n`);
    written.push({ id: parsed.id, file: target });
    log.ok(`wrote ${path.relative(root, target)}`);
  }

  if (written.length) {
    log.title('Next');
    log.info(`Review the drafts, then: ${pc.cyan('guidesmith capture')}`);
  }
  return { pages, plan, written };
}
