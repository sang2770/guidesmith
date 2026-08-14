import path from 'node:path';
import { loadConfig, paths, deepMerge } from '../config.mjs';
import { resolveFlows } from '../flow/load.mjs';
import { captureFlow } from '../capture/runner.mjs';
import { log, pc } from '../util/log.mjs';

export async function captureCommand(opts) {
  const { root, config: base } = loadConfig();
  const config = applyOverrides(base, opts);
  const p = paths(root, config);
  const flows = resolveFlows(p.flows, opts.flow);

  if (!flows.length) {
    log.warn(`No flow specs found in ${path.relative(root, p.flows)}/. Write one, or run \`guidesmith explore\`.`);
    return { results: [] };
  }

  const results = [];
  for (const flow of flows) {
    log.title(`${pc.bold(flow.id)} — ${flow.title}`);
    try {
      const manifest = await captureFlow(flow, { config, outDir: p.captures });
      const shots = manifest.steps.filter((s) => s.screenshotFile).length;
      log.ok(`${flow.id}: ${manifest.steps.length} steps, ${shots} screenshots (${manifest.durationMs}ms)`);
      results.push({ flow, manifest, ok: true });
    } catch (err) {
      log.error(`${flow.id}: ${err.message}`);
      results.push({ flow, ok: false, error: err.message });
      if (!opts.keepGoing) throw err;
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) log.warn(`${failed.length} of ${results.length} flows failed`);
  return { results };
}

export function applyOverrides(config, opts) {
  const override = {};
  if (opts.baseUrl) override.baseUrl = opts.baseUrl;
  if (opts.browser) override.browser = opts.browser;
  if (opts.headed) override.headless = false;
  if (opts.timeout) override.timeout = Number(opts.timeout);
  if (opts.fullPage) override.fullPage = true;
  if (opts.viewport) {
    const [w, h] = String(opts.viewport).split('x').map(Number);
    if (!w || !h) throw new Error(`--viewport must look like 1280x800, got "${opts.viewport}"`);
    override.viewport = { width: w, height: h };
  }
  return deepMerge(config, override);
}
