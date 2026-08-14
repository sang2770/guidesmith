import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, paths, deepMerge } from '../config.mjs';
import { resolveFlows } from '../flow/load.mjs';
import { readJson, writeFile, ensureDir, exists } from '../util/fs.mjs';
import { renderGuide, validateGuide } from '../mdx/render.mjs';
import { createAI } from '../ai/index.mjs';
import { log, pc } from '../util/log.mjs';

/** static/img/guides -> /img/guides (the URL Docusaurus serves it at) */
export function imageUrlBase(config, flowId) {
  const sub = config.imageSubdir.replace(/^static\/?/, '');
  return `/${sub.replace(/^\/|\/$/g, '')}/${flowId}`;
}

export function syncImages(p, flowId) {
  const from = path.join(p.captures, flowId);
  const to = path.join(p.images, flowId);
  if (!exists(from)) return 0;
  ensureDir(to);
  let n = 0;
  for (const file of fs.readdirSync(from)) {
    if (!file.endsWith('.png') || file.startsWith('failure-')) continue;
    fs.copyFileSync(path.join(from, file), path.join(to, file));
    n += 1;
  }
  return n;
}

export async function generateCommand(opts) {
  const { root, config: base } = loadConfig();
  const config = deepMerge(base, {
    ai: {
      ...(opts.ai === false ? { provider: 'none' } : {}),
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.model ? { model: opts.model } : {}),
    },
  });
  const p = paths(root, config);
  const ai = createAI(config.ai, { cwd: root });
  const flows = resolveFlows(p.flows, opts.flow);

  if (ai.enabled) log.info(pc.dim(`AI provider: ${ai.provider}${config.ai.model ? ` (${config.ai.model})` : ''}`));
  else log.info(pc.dim('AI disabled — using the deterministic renderer'));

  const written = [];
  for (const flow of flows) {
    const manifestPath = path.join(p.captures, flow.id, 'capture.json');
    if (!exists(manifestPath)) {
      log.warn(`${flow.id}: no capture found. Run \`guidesmith capture --flow ${flow.id}\` first.`);
      continue;
    }
    const manifest = readJson(manifestPath);
    if (manifest.status !== 'ok') {
      log.warn(`${flow.id}: last capture failed at step ${manifest.error?.step}; skipping.`);
      continue;
    }

    const imageBase = imageUrlBase(config, flow.id);
    const docFile = path.join(p.docs, `${flow.id}.mdx`);

    if (exists(docFile) && opts.skipExisting) {
      log.info(`${flow.id}: exists, skipping (--skip-existing)`);
      continue;
    }

    let mdx = null;
    let source = 'renderer';
    if (ai.enabled) {
      try {
        log.step(`${flow.id}: asking ${ai.provider} to write the guide…`);
        const candidate = await ai.guide({
          manifest,
          imageBase,
          style: config.style,
          extraContext: opts.context || flow.context || '',
        });
        const check = validateGuide(candidate, manifest, { imageBase });
        if (check.ok) {
          mdx = candidate;
          source = ai.provider;
        } else {
          log.warn(`${flow.id}: model output rejected — ${check.problems.join('; ')}`);
          if (opts.strict) throw new Error(`AI output failed validation for ${flow.id}`);
        }
      } catch (err) {
        log.warn(`${flow.id}: ${err.message}`);
        if (opts.strict) throw err;
      }
    }
    if (!mdx) mdx = renderGuide(manifest, { imageBase });

    ensureDir(p.docs);
    writeFile(docFile, mdx);
    const copied = opts.sync === false ? 0 : syncImages(p, flow.id);
    log.ok(
      `${flow.id}: wrote ${path.relative(root, docFile)} via ${pc.bold(source)}` +
        (copied ? ` (+${copied} screenshots synced)` : ''),
    );
    written.push({ flowId: flow.id, file: docFile, source });
  }

  if (!written.length) log.warn('Nothing generated.');
  return { written };
}
