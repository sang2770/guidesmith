import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, paths, CONFIG_FILE } from '../config.mjs';
import { listFlowFiles, loadFlowFile } from '../flow/load.mjs';
import { exists } from '../util/fs.mjs';
import { isAvailable, PROVIDERS } from '../ai/index.mjs';
import { log, pc } from '../util/log.mjs';

const mark = (ok) => (ok ? pc.green('✓') : pc.red('✗'));

export async function doctorCommand() {
  log.title('guidesmith doctor');
  const { root, config, exists: hasConfig } = loadConfig({ required: false });
  const p = paths(root, config);

  console.log(`${mark(hasConfig)} ${CONFIG_FILE} ${hasConfig ? pc.dim(root) : pc.dim('(run `guidesmith init`)')}`);

  // Playwright
  let browsersOk = false;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const version = browser.version();
    await browser.close();
    browsersOk = true;
    console.log(`${mark(true)} Playwright chromium ${pc.dim(version)}`);
  } catch (err) {
    console.log(`${mark(false)} Playwright chromium — ${err.message.split('\n')[0]}`);
    console.log(`  ${pc.dim('fix: npx playwright install chromium')}`);
  }

  // AI providers
  for (const name of Object.keys(PROVIDERS)) {
    const ok = await isAvailable(name);
    const active = config.ai.provider === name;
    console.log(
      `${mark(ok)} ${name} CLI${active ? pc.cyan('  ← configured provider') : ''}` +
        (ok ? '' : pc.dim(`  (${PROVIDERS[name].docs})`)),
    );
  }
  if (config.ai.provider === 'none') console.log(`${pc.yellow('!')} AI disabled in config (provider: "none")`);

  // Project content
  if (hasConfig) {
    const flows = listFlowFiles(p.flows);
    console.log(`${mark(flows.length > 0)} ${flows.length} flow spec(s) in ${path.relative(root, p.flows) || '.'}/`);
    let invalid = 0;
    let captured = 0;
    for (const f of flows) {
      try {
        const flow = loadFlowFile(f);
        if (exists(path.join(p.captures, flow.id, 'capture.json'))) captured += 1;
      } catch (err) {
        invalid += 1;
        log.error(`  ${path.basename(f)}: ${err.message.split('\n').slice(1).join(' ')}`);
      }
    }
    if (flows.length) console.log(`${mark(invalid === 0)} ${flows.length - invalid} valid, ${captured} captured`);
    const siteOk = exists(path.join(p.site, 'docusaurus.config.js'));
    console.log(`${mark(siteOk)} Docusaurus site in ${config.siteDir}/`);
    const depsOk = exists(path.join(p.site, 'node_modules'));
    console.log(`${mark(depsOk)} site dependencies${depsOk ? '' : pc.dim(`  (npm --prefix ${config.siteDir} install)`)}`);
  }

  // Node
  const node = process.versions.node;
  console.log(`${mark(Number(node.split('.')[0]) >= 18)} Node ${node}`);
  try {
    console.log(`${mark(true)} npm ${execSync('npm --version').toString().trim()}`);
  } catch {
    console.log(`${mark(false)} npm not found`);
  }

  if (!browsersOk) process.exitCode = 1;
}
