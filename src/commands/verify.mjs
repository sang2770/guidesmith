import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { loadConfig, paths } from '../config.mjs';
import { resolveFlows } from '../flow/load.mjs';
import { captureFlow } from '../capture/runner.mjs';
import { applyOverrides } from './capture.mjs';
import { ensureDir, exists, writeJson } from '../util/fs.mjs';
import { log, pc } from '../util/log.mjs';

/** @returns {{changedRatio:number, diffPath?:string, reason?:string}} */
function comparePng(baselineFile, currentFile, diffFile, threshold) {
  const a = PNG.sync.read(fs.readFileSync(baselineFile));
  const b = PNG.sync.read(fs.readFileSync(currentFile));
  if (a.width !== b.width || a.height !== b.height) {
    return { changedRatio: 1, reason: `size changed ${a.width}x${a.height} → ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold,
    includeAA: false,
  });
  const ratio = changed / (a.width * a.height);
  if (changed > 0) {
    ensureDir(path.dirname(diffFile));
    fs.writeFileSync(diffFile, PNG.sync.write(diff));
    return { changedRatio: ratio, diffPath: diffFile };
  }
  return { changedRatio: 0 };
}

/**
 * Re-drive every flow against the live app and diff the result against the
 * committed screenshots. Drifted pixels mean the UI moved on without the docs.
 */
export async function verifyCommand(opts) {
  const { root, config: base } = loadConfig();
  const config = applyOverrides(base, opts);
  const p = paths(root, config);
  const flows = resolveFlows(p.flows, opts.flow);
  const threshold = Number(opts.threshold ?? 0.1);
  const tolerance = Number(opts.tolerance ?? 0.005); // fraction of pixels allowed to differ
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guidesmith-verify-'));

  const report = { checkedAt: new Date().toISOString(), tolerance, flows: [] };
  let drifted = 0;
  let broke = 0;

  for (const flow of flows) {
    const entry = { flowId: flow.id, status: 'ok', steps: [] };
    log.title(`${pc.bold(flow.id)} — ${flow.title}`);

    let manifest;
    try {
      manifest = await captureFlow(flow, { config, outDir: tmp });
    } catch (err) {
      entry.status = 'broken';
      entry.error = err.message;
      broke += 1;
      log.error(`${flow.id}: flow no longer runs — ${err.message.split('\n')[0]}`);
      report.flows.push(entry);
      continue;
    }

    const baselineDir = path.join(p.captures, flow.id);
    if (!exists(path.join(baselineDir, 'capture.json'))) {
      entry.status = 'no-baseline';
      log.warn(`${flow.id}: no committed capture to compare against`);
      report.flows.push(entry);
      continue;
    }

    for (const step of manifest.steps) {
      if (!step.screenshotFile) continue;
      const baseline = path.join(baselineDir, step.screenshotFile);
      const current = path.join(tmp, flow.id, step.screenshotFile);
      if (!exists(baseline)) {
        entry.steps.push({ step: step.index, name: step.name, status: 'new' });
        entry.status = entry.status === 'ok' ? 'drifted' : entry.status;
        log.warn(`  step ${step.index} "${step.name}": new screenshot with no baseline`);
        continue;
      }
      const diffFile = path.join(p.captures, flow.id, '__diff__', step.screenshotFile);
      const { changedRatio, diffPath, reason } = comparePng(baseline, current, diffFile, threshold);
      const pct = (changedRatio * 100).toFixed(2);
      if (changedRatio > tolerance) {
        entry.status = entry.status === 'broken' ? entry.status : 'drifted';
        entry.steps.push({ step: step.index, name: step.name, status: 'drifted', changedRatio, diff: diffPath, reason });
        log.warn(`  step ${step.index} "${step.name}": ${pct}% of pixels changed${reason ? ` (${reason})` : ''}`);
      } else {
        entry.steps.push({ step: step.index, name: step.name, status: 'ok', changedRatio });
        log.info(`  ${pc.green('·')} step ${step.index} "${step.name}" (${pct}%)`);
      }
    }

    if (entry.status === 'drifted') drifted += 1;
    else if (entry.status === 'ok') log.ok(`${flow.id}: screenshots still match`);
    report.flows.push(entry);

    if (opts.update && entry.status !== 'broken') {
      for (const file of fs.readdirSync(path.join(tmp, flow.id))) {
        fs.copyFileSync(path.join(tmp, flow.id, file), path.join(baselineDir, file));
      }
      log.ok(`${flow.id}: baseline updated (--update)`);
    }
  }

  const out = path.join(p.captures, 'verify-report.json');
  writeJson(out, report);
  log.title('Summary');
  log.info(`${report.flows.length} flows checked · ${drifted} drifted · ${broke} broken`);
  log.info(`report: ${path.relative(root, out)}`);

  if ((drifted || broke) && opts.failOnDrift !== false) {
    process.exitCode = 1;
  }
  return report;
}
