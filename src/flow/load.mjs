import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { validateFlow } from './schema.mjs';
import { log } from '../util/log.mjs';

const FLOW_EXT = /\.flow\.(ya?ml|json)$/i;

export function parseFlow(source, file) {
  if (/\.json$/i.test(file)) return JSON.parse(source);
  return YAML.parse(source);
}

export function loadFlowFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  let flow;
  try {
    flow = parseFlow(source, file);
  } catch (err) {
    throw new Error(`Failed to parse ${file}: ${err.message}`);
  }
  const { ok, errors, warnings } = validateFlow(flow, { file: path.basename(file) });
  warnings.forEach((w) => log.warn(w));
  if (!ok) throw new Error(`Invalid flow spec:\n  ${errors.join('\n  ')}`);
  flow.__file = file;
  return flow;
}

/** Find every *.flow.yaml / *.flow.json under a directory. */
export function listFlowFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFlowFiles(p));
    else if (FLOW_EXT.test(entry.name)) out.push(p);
  }
  return out.sort();
}

/**
 * Resolve the flows a command should operate on.
 * @param {string} flowsDir
 * @param {string|string[]|undefined} selector explicit file path(s) or flow id(s)
 */
export function resolveFlows(flowsDir, selector) {
  const all = listFlowFiles(flowsDir);
  if (!selector || (Array.isArray(selector) && selector.length === 0)) {
    return all.map(loadFlowFile);
  }
  const wanted = Array.isArray(selector) ? selector : [selector];
  return wanted.map((item) => {
    if (fs.existsSync(item) && fs.statSync(item).isFile()) return loadFlowFile(item);
    // Bare filenames are resolved against the flows directory too.
    for (const candidate of [item, `${item}.flow.yaml`, `${item}.flow.yml`, `${item}.flow.json`]) {
      const inFlowsDir = path.join(flowsDir, candidate);
      if (fs.existsSync(inFlowsDir) && fs.statSync(inFlowsDir).isFile()) return loadFlowFile(inFlowsDir);
    }
    const byId = all.find((f) => {
      try {
        return loadFlowFile(f).id === item;
      } catch {
        return false;
      }
    });
    if (!byId) {
      throw new Error(
        `No flow matched "${item}". Looked for a file at that path and for id "${item}" in ${flowsDir}.`,
      );
    }
    return loadFlowFile(byId);
  });
}
