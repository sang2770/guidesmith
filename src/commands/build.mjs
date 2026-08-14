import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, paths } from '../config.mjs';
import { listFlowFiles, loadFlowFile } from '../flow/load.mjs';
import { syncImages } from './generate.mjs';
import { exists } from '../util/fs.mjs';
import { log, pc } from '../util/log.mjs';

export async function buildCommand(opts) {
  const { root, config } = loadConfig();
  const p = paths(root, config);

  log.title('Syncing screenshots into the site');
  let total = 0;
  for (const file of listFlowFiles(p.flows)) {
    const flow = loadFlowFile(file);
    const n = syncImages(p, flow.id);
    if (n) log.ok(`${flow.id}: ${n} screenshots → ${path.relative(root, path.join(p.images, flow.id))}`);
    total += n;
  }
  log.info(`${total} screenshots synced`);

  if (opts.syncOnly) return { synced: total };

  if (!exists(path.join(p.site, 'node_modules'))) {
    log.step('installing site dependencies…');
    execSync('npm install --no-audit --no-fund', { cwd: p.site, stdio: 'inherit' });
  }

  const script = opts.serve ? 'start' : 'build';
  log.title(`Running Docusaurus ${script}`);
  execSync(`npm run ${script}`, { cwd: p.site, stdio: 'inherit' });

  if (!opts.serve) {
    log.ok(`site built into ${pc.bold(path.relative(root, path.join(p.site, 'build')))}`);
    log.info(`preview it with: npm --prefix ${config.siteDir} run serve`);
  }
  return { synced: total };
}
