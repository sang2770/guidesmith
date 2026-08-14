import path from 'node:path';
import { Command } from 'commander';
import { loadConfig, paths } from './config.mjs';
import { listFlowFiles, loadFlowFile } from './flow/load.mjs';
import { initCommand } from './commands/init.mjs';
import { captureCommand } from './commands/capture.mjs';
import { generateCommand } from './commands/generate.mjs';
import { verifyCommand } from './commands/verify.mjs';
import { exploreCommand } from './commands/explore.mjs';
import { authorCommand } from './commands/author.mjs';
import { buildCommand } from './commands/build.mjs';
import { doctorCommand } from './commands/doctor.mjs';
import { log, setLevel, pc } from './util/log.mjs';

const AI_OPTS = (cmd) =>
  cmd
    .option('--provider <name>', 'AI provider: claude | gemini | codex | none')
    .option('--model <name>', 'model id passed through to the provider CLI')
    .option('--no-ai', 'skip the model entirely');

export async function run(argv) {
  const program = new Command();

  program
    .name('guidesmith')
    .description(
      'Build step-by-step user guides: Playwright captures the app, an AI model writes the prose, Docusaurus publishes it.',
    )
    .version('0.1.0')
    .option('-v, --verbose', 'verbose logging')
    .option('-q, --quiet', 'errors only')
    .hook('preAction', (thisCommand) => {
      const o = thisCommand.opts();
      if (o.verbose) setLevel('debug');
      if (o.quiet) setLevel('error');
    });

  program
    .command('init')
    .description('scaffold a docs project: config, flows/, Docusaurus site, agent instructions')
    .option('-d, --dir <path>', 'target directory', process.cwd())
    .option('--base-url <url>', 'URL of the app being documented')
    .option('--title <title>', 'site title')
    .option('--tagline <text>', 'site tagline')
    .option('--site-url <url>', 'where the docs site will be published')
    .option('--provider <name>', 'default AI provider (claude | gemini | codex | none)', 'claude')
    .option('--model <name>', 'default model id')
    .option('--install', 'npm install the Docusaurus site right away')
    .option('--no-agent', 'do not write AGENTS.md / .claude skill files')
    .option('-f, --force', 'overwrite existing files')
    .action(initCommand);

  program
    .command('doctor')
    .description('check Playwright, AI CLIs and project health')
    .action(doctorCommand);

  program
    .command('lint')
    .description('validate every flow spec')
    .option('--flow <idOrPath...>', 'limit to specific flows')
    .action(lintCommand);

  AI_OPTS(
    program
      .command('explore')
      .description('crawl the running app and print a page outline (optionally plan or scaffold guides)')
      .option('--url <url>', 'start URL (defaults to config baseUrl)')
      .option('--base-url <url>', 'override the configured baseUrl')
      .option('--depth <n>', 'how many link hops to follow', '0')
      .option('--max-pages <n>', 'page cap for the crawl', '8')
      .option('--browser <name>', 'chromium | firefox | webkit')
      .option('--plan', 'ask the model which guides the site needs')
      .option('--write', 'draft a flow spec for every planned guide')
      .option('--goal <text>', 'what the documentation set should cover')
      .option('-f, --force', 'overwrite existing flow specs'),
  ).action(exploreCommand);

  AI_OPTS(
    program
      .command('author <goal>')
      .description('draft one flow spec for a goal, grounded in the live page')
      .option('--url <url>', 'page to start from')
      .option('--base-url <url>', 'override the configured baseUrl')
      .option('--browser <name>', 'chromium | firefox | webkit')
      .option('-f, --force', 'overwrite an existing flow spec'),
  ).action(authorCommand);

  program
    .command('capture')
    .description('run flow specs in a real browser and write annotated screenshots')
    .option('--flow <idOrPath...>', 'limit to specific flows')
    .option('--base-url <url>', 'override the app URL')
    .option('--browser <name>', 'chromium | firefox | webkit')
    .option('--viewport <WxH>', 'viewport size, e.g. 1440x900')
    .option('--headed', 'show the browser while it runs')
    .option('--full-page', 'capture full-page screenshots')
    .option('--timeout <ms>', 'per-action timeout')
    .option('-k, --keep-going', 'continue after a failing flow')
    .action(captureCommand);

  AI_OPTS(
    program
      .command('generate')
      .description('turn capture manifests into Docusaurus MDX guides')
      .option('--flow <idOrPath...>', 'limit to specific flows')
      .option('--context <text>', 'extra product context for the model')
      .option('--skip-existing', 'do not regenerate guides that already exist')
      .option('--strict', 'fail instead of falling back to the deterministic renderer')
      .option('--no-sync', 'do not copy screenshots into the site'),
  ).action(generateCommand);

  program
    .command('verify')
    .description('re-run flows against the live app and pixel-diff against committed screenshots')
    .option('--flow <idOrPath...>', 'limit to specific flows')
    .option('--base-url <url>', 'override the app URL')
    .option('--browser <name>', 'chromium | firefox | webkit')
    .option('--threshold <n>', 'pixelmatch per-pixel threshold (0-1)', '0.1')
    .option('--tolerance <n>', 'fraction of pixels allowed to differ', '0.005')
    .option('--update', 'accept the new screenshots as the baseline')
    .option('--no-fail-on-drift', 'always exit 0')
    .action(verifyCommand);

  program
    .command('build')
    .description('sync screenshots into the site and run the Docusaurus build')
    .option('--serve', 'run the dev server instead of building')
    .option('--sync-only', 'copy screenshots and stop')
    .action(buildCommand);

  program
    .command('run')
    .description('capture → generate → build, in one go')
    .option('--flow <idOrPath...>', 'limit to specific flows')
    .option('--base-url <url>', 'override the app URL')
    .option('--provider <name>', 'AI provider')
    .option('--model <name>', 'model id')
    .option('--no-ai', 'skip the model')
    .option('--skip-build', 'stop after generating MDX')
    .action(async (opts) => {
      await captureCommand({ ...opts, keepGoing: true });
      await generateCommand(opts);
      if (!opts.skipBuild) await buildCommand({});
    });

  await program.parseAsync(argv);
}

async function lintCommand(opts) {
  const { root, config } = loadConfig();
  const p = paths(root, config);
  const files = opts.flow?.length
    ? opts.flow.map((f) => (f.includes(path.sep) || f.endsWith('.yaml') || f.endsWith('.json') ? f : null)).filter(Boolean)
    : listFlowFiles(p.flows);

  if (!files.length) {
    log.warn(`No flow specs found in ${path.relative(root, p.flows)}/`);
    return;
  }

  let bad = 0;
  const ids = new Map();
  for (const file of files) {
    const rel = path.relative(root, file);
    try {
      const flow = loadFlowFile(file);
      if (ids.has(flow.id)) {
        bad += 1;
        log.error(`${rel}: duplicate id "${flow.id}" (also in ${path.relative(root, ids.get(flow.id))})`);
        continue;
      }
      ids.set(flow.id, file);
      log.ok(`${rel} ${pc.dim(`— ${flow.steps.length} steps`)}`);
    } catch (err) {
      bad += 1;
      log.error(`${rel}\n  ${err.message.replace(/\n/g, '\n  ')}`);
    }
  }

  log.info(`\n${files.length - bad}/${files.length} flow specs valid`);
  if (bad) process.exitCode = 1;
}
