import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { CONFIG_FILE, DEFAULT_CONFIG, deepMerge, paths } from '../config.mjs';
import { ensureDir, writeFile, writeJson, exists, copyDirSafe, readJson } from '../util/fs.mjs';
import { log, pc } from '../util/log.mjs';
import { AGENT_SKILL, AGENTS_MD } from '../agent/skill.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(HERE, '../../templates');

const EXAMPLE_FLOW = `# Guidesmith flow spec — the input an AI agent writes and Playwright executes.
# Run it with:  guidesmith capture --flow flows/example.flow.yaml
id: example-guide
title: Sign in to your account
description: Create your first session so you can reach the dashboard.
audience: first-time users
sidebarPosition: 1
tags: [getting-started]
prerequisites:
  - An account invitation email
# baseUrl: http://localhost:3000   # falls back to guidesmith.config.json

steps:
  - name: Open the sign-in page
    action: goto
    url: /login
    note: Go to the sign-in page. Bookmark it — this is where you start every time.

  - name: Enter your email address
    action: fill
    label: Email
    value: you@example.com
    note: Type the address your invitation was sent to.

  - name: Enter your password
    action: fill
    label: Password
    value: correct-horse-battery
    secret: true            # the value is masked in the published guide
    note: Passwords are case sensitive.
    callout:
      type: tip
      text: Forgot it? Use "Reset password" below the form.

  - name: Select Sign in
    action: click
    role: { role: button, name: Sign in }
    result: The dashboard opens.

  - name: Confirm you are signed in
    action: expect
    text: Dashboard
    note: Your name appears in the top-right corner once the session starts.
`;

const GITIGNORE = `# guidesmith
node_modules/
captures/**/failure-*.png
site/.docusaurus/
site/build/
site/node_modules/
.guidesmith-cache/
`;

function substitute(file, vars) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`__${key}__`, value);
  }
  fs.writeFileSync(file, text);
}

export async function initCommand(opts) {
  const root = path.resolve(opts.dir || process.cwd());
  ensureDir(root);
  log.title(`Setting up guidesmith in ${pc.bold(root)}`);

  const title = opts.title || path.basename(root).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const tagline = opts.tagline || 'Step-by-step guides, screenshot by screenshot.';

  // 1. Config
  const configPath = path.join(root, CONFIG_FILE);
  if (exists(configPath) && !opts.force) {
    log.warn(`${CONFIG_FILE} already exists — keeping it (use --force to overwrite).`);
  } else {
    const config = deepMerge(DEFAULT_CONFIG, {
      baseUrl: opts.baseUrl || DEFAULT_CONFIG.baseUrl,
      ai: { provider: opts.provider || DEFAULT_CONFIG.ai.provider, model: opts.model || null },
    });
    writeJson(configPath, config);
    log.ok(`wrote ${CONFIG_FILE}`);
  }
  const config = deepMerge(DEFAULT_CONFIG, readJson(configPath, {}));
  const p = paths(root, config);

  // 2. Folders
  for (const dir of [p.flows, p.captures]) ensureDir(dir);

  // 3. Docusaurus site
  if (exists(path.join(p.site, 'docusaurus.config.js')) && !opts.force) {
    log.warn(`${config.siteDir}/ already has a Docusaurus config — leaving it alone.`);
  } else {
    ensureDir(p.site);
    const { written } = copyDirSafe(path.join(TEMPLATES, 'site'), p.site, { overwrite: !!opts.force });
    substitute(path.join(p.site, 'docusaurus.config.js'), {
      PROJECT_TITLE: title,
      PROJECT_TAGLINE: tagline,
      SITE_URL: opts.siteUrl || 'https://example.com',
    });
    ensureDir(p.docs);
    ensureDir(p.images);
    log.ok(`scaffolded Docusaurus site in ${config.siteDir}/ (${written.length} files)`);
  }

  // 4. Example flow
  const example = path.join(p.flows, 'example.flow.yaml');
  if (!exists(example)) {
    writeFile(example, EXAMPLE_FLOW);
    log.ok(`wrote ${path.relative(root, example)}`);
  }

  // 5. Agent instructions
  if (opts.agent !== false) {
    const skillPath = path.join(root, '.claude', 'skills', 'user-guide-docs', 'SKILL.md');
    if (!exists(skillPath) || opts.force) {
      writeFile(skillPath, AGENT_SKILL);
      log.ok('wrote .claude/skills/user-guide-docs/SKILL.md');
    }
    const agentsMd = path.join(root, 'AGENTS.md');
    if (!exists(agentsMd) || opts.force) {
      writeFile(agentsMd, AGENTS_MD);
      log.ok('wrote AGENTS.md (read by Codex / Gemini CLI / Claude Code)');
    }
  }

  // 6. .gitignore
  const gi = path.join(root, '.gitignore');
  if (!exists(gi)) writeFile(gi, GITIGNORE);

  // 7. Optional dependency install
  if (opts.install) {
    log.step('installing Docusaurus dependencies (this takes a minute)…');
    execSync('npm install --no-audit --no-fund', { cwd: p.site, stdio: 'inherit' });
    log.ok('site dependencies installed');
  }

  log.title('Next steps');
  console.log(`  1. ${pc.cyan('guidesmith doctor')}                   check Playwright + AI CLI availability
  2. edit ${pc.cyan(path.relative(root, path.join(p.flows, 'example.flow.yaml')))} (or let an agent author flows)
  3. ${pc.cyan('guidesmith capture')}                  drive the app, take annotated screenshots
  4. ${pc.cyan('guidesmith generate')}                 turn captures into MDX guides
  5. ${pc.cyan(`npm --prefix ${config.siteDir} install && npm --prefix ${config.siteDir} run start`)}
`);
}
