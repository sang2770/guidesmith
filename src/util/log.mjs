import pc from 'picocolors';

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
let level = LEVELS[process.env.GUIDESMITH_LOG || 'info'] ?? LEVELS.info;

export function setLevel(name) {
  level = LEVELS[name] ?? level;
}

export const log = {
  step: (msg) => level >= LEVELS.info && console.log(`${pc.cyan('›')} ${msg}`),
  info: (msg) => level >= LEVELS.info && console.log(`  ${msg}`),
  ok: (msg) => level >= LEVELS.info && console.log(`${pc.green('✓')} ${msg}`),
  warn: (msg) => level >= LEVELS.warn && console.warn(`${pc.yellow('!')} ${msg}`),
  error: (msg) => level >= LEVELS.error && console.error(`${pc.red('✗')} ${msg}`),
  debug: (msg) => level >= LEVELS.debug && console.log(pc.dim(`  ${msg}`)),
  title: (msg) => level >= LEVELS.info && console.log(`\n${pc.bold(msg)}`),
};

export { pc };
