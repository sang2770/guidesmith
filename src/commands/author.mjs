import path from 'node:path';
import YAML from 'yaml';
import { chromium, firefox, webkit } from 'playwright';
import { loadConfig, paths, deepMerge } from '../config.mjs';
import { listFlowFiles, loadFlowFile } from '../flow/load.mjs';
import { validateFlow } from '../flow/schema.mjs';
import { writeFile, exists, ensureDir } from '../util/fs.mjs';
import { createAI } from '../ai/index.mjs';
import { OUTLINE_FN, formatOutline } from '../capture/outline.mjs';
import { log, pc } from '../util/log.mjs';

const ENGINES = { chromium, firefox, webkit };

/** Draft one flow spec for one goal, grounded in the live page. */
export async function authorCommand(goal, opts) {
  if (!goal) throw new Error('Describe the guide, e.g. guidesmith author "invite a teammate"');
  const { root, config: base } = loadConfig();
  const config = deepMerge(base, {
    ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    ai: {
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.model ? { model: opts.model } : {}),
    },
  });
  const p = paths(root, config);
  const ai = createAI(config.ai, { cwd: root });
  if (!ai.enabled) throw new Error('`author` needs an AI provider. Use --provider claude|gemini|codex.');

  const url = opts.url || config.baseUrl;
  const engine = ENGINES[opts.browser || config.browser] || chromium;

  log.step(`reading ${url}…`);
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({
    viewport: config.viewport,
    ...(config.storageState && exists(config.storageState) ? { storageState: config.storageState } : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.timeout);
  let outline;
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    outline = formatOutline(await page.evaluate(OUTLINE_FN, 25));
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const existingIds = listFlowFiles(p.flows)
    .map((f) => {
      try {
        return loadFlowFile(f).id;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  log.step(`asking ${ai.provider} to draft the flow…`);
  const yaml = await ai.flowSpec({ goal, url, outline, style: config.style, existingIds });

  let parsed;
  try {
    parsed = YAML.parse(yaml);
  } catch (err) {
    throw new Error(`Model produced invalid YAML: ${err.message}\n\n${yaml.slice(0, 1000)}`);
  }
  const check = validateFlow(parsed, { file: 'draft' });
  if (!check.ok) throw new Error(`Draft failed validation:\n  ${check.errors.join('\n  ')}\n\n${yaml}`);
  check.warnings.forEach((w) => log.warn(w));

  ensureDir(p.flows);
  const target = path.join(p.flows, `${parsed.id}.flow.yaml`);
  if (exists(target) && !opts.force) throw new Error(`${path.relative(root, target)} already exists (use --force)`);
  writeFile(target, `${yaml.trim()}\n`);
  log.ok(`wrote ${path.relative(root, target)}`);
  log.info(`review it, then: ${pc.cyan(`guidesmith capture --flow ${parsed.id}`)}`);
  return { file: target, flow: parsed };
}
