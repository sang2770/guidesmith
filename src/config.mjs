import path from 'node:path';
import fs from 'node:fs';
import { readJson } from './util/fs.mjs';

export const CONFIG_FILE = 'guidesmith.config.json';

export const DEFAULT_CONFIG = {
  // Where the app under documentation lives. Flow-level `baseUrl` overrides this.
  baseUrl: 'http://localhost:3000',
  // Folders, all relative to the project root (where guidesmith.config.json lives).
  flowsDir: 'flows',
  capturesDir: 'captures',
  siteDir: 'site',
  // Inside siteDir:
  docsSubdir: 'docs/guides',
  imageSubdir: 'static/img/guides',
  // Playwright defaults; any flow can override.
  browser: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  locale: 'en-US',
  timeout: 15000,
  fullPage: false,
  // Screenshot annotation defaults.
  annotate: {
    highlight: true,
    highlightColor: '#ff3b30',
    highlightWidth: 3,
    badge: true,
    badgeColor: '#ff3b30',
    dimBackdrop: false,
  },
  // AI code/prose generation.
  ai: {
    // 'claude' | 'gemini' | 'codex' | 'none'
    provider: 'claude',
    model: null,
    timeout: 300000,
    // Extra CLI args appended to the provider invocation.
    args: [],
  },
  // Voice/style handed to the AI when it writes the guide.
  style: {
    audience: 'first-time end users, non-technical',
    tone: 'friendly, direct, second person ("you")',
    language: 'en',
    maxWordsPerStep: 60,
  },
  // Redact these selectors in every screenshot (blurred out).
  redact: [],
};

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (typeof base !== 'object' || base === null) return override ?? base;
  if (typeof override !== 'object' || override === null) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base[k], v);
  return out;
}

export { deepMerge };

/** Walk up from `cwd` looking for guidesmith.config.json. */
export function findProjectRoot(cwd = process.cwd()) {
  let dir = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(dir, CONFIG_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig({ cwd = process.cwd(), required = true } = {}) {
  const root = findProjectRoot(cwd);
  if (!root) {
    if (required) {
      throw new Error(
        `No ${CONFIG_FILE} found in ${cwd} or any parent. Run \`guidesmith init\` first.`,
      );
    }
    return { root: path.resolve(cwd), config: { ...DEFAULT_CONFIG }, exists: false };
  }
  const user = readJson(path.join(root, CONFIG_FILE), {});
  return { root, config: deepMerge(DEFAULT_CONFIG, user), exists: true };
}

/** Resolve the well-known paths for a project. */
export function paths(root, config) {
  const site = path.join(root, config.siteDir);
  return {
    root,
    flows: path.join(root, config.flowsDir),
    captures: path.join(root, config.capturesDir),
    site,
    docs: path.join(site, config.docsSubdir),
    images: path.join(site, config.imageSubdir),
  };
}
