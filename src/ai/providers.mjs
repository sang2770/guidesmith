import { spawn } from 'node:child_process';
import { log } from '../util/log.mjs';

/**
 * Each provider is a headless CLI invocation: prompt in on stdin, text out on stdout.
 * Nothing here depends on a particular vendor SDK or API key handling — if the CLI
 * is authenticated for the user, guidesmith can use it.
 */
export const PROVIDERS = {
  claude: {
    bin: 'claude',
    docs: 'https://docs.claude.com/en/docs/claude-code',
    build: ({ model, args }) => [
      '-p',
      '--output-format',
      'text',
      ...(model ? ['--model', model] : []),
      ...args,
    ],
    stdin: true,
  },
  gemini: {
    bin: 'gemini',
    docs: 'https://github.com/google-gemini/gemini-cli',
    build: ({ model, args }) => [...(model ? ['-m', model] : []), ...args],
    stdin: true,
  },
  codex: {
    bin: 'codex',
    docs: 'https://github.com/openai/codex',
    build: ({ model, args }) => [
      'exec',
      '--skip-git-repo-check',
      ...(model ? ['-m', model] : []),
      ...args,
      '-',
    ],
    stdin: true,
  },
};

export function providerBin(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown AI provider "${name}". Use one of: ${Object.keys(PROVIDERS).join(', ')}, none`);
  return process.env[`GUIDESMITH_${name.toUpperCase()}_BIN`] || p.bin;
}

export async function isAvailable(name) {
  if (name === 'none') return false;
  const bin = providerBin(name);
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'where' : 'command',
      process.platform === 'win32' ? [bin] : ['-v', bin],
      { stdio: 'ignore', shell: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

/**
 * Run a prompt through a provider CLI.
 * @returns {Promise<string>} raw stdout text
 */
export function callProvider(name, prompt, { model = null, args = [], timeout = 300000, cwd = process.cwd() } = {}) {
  const spec = PROVIDERS[name];
  if (!spec) throw new Error(`Unknown AI provider "${name}"`);
  const bin = providerBin(name);
  const argv = spec.build({ model, args });

  log.debug(`ai: ${bin} ${argv.join(' ')} (${prompt.length} chars of prompt)`);

  return new Promise((resolve, reject) => {
    const child = spawn(bin, argv, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} timed out after ${timeout}ms`));
    }, timeout);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(
        e.code === 'ENOENT'
          ? new Error(`AI provider CLI "${bin}" not found on PATH. Install it (${spec.docs}) or run with --no-ai.`)
          : e,
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${bin} exited with code ${code}${err ? `:\n${err.trim().slice(0, 2000)}` : ''}`));
        return;
      }
      resolve(out);
    });

    if (spec.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}

/** Pull the first fenced block of a given language, or the whole text. */
export function extractBlock(text, lang) {
  const fence = new RegExp('```(?:' + lang + ')?\\s*\\n([\\s\\S]*?)```', 'i');
  const m = text.match(fence);
  return (m ? m[1] : text).trim();
}

export function extractJson(text) {
  const block = extractBlock(text, 'json');
  try {
    return JSON.parse(block);
  } catch {
    const start = block.search(/[[{]/);
    const end = Math.max(block.lastIndexOf('}'), block.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(block.slice(start, end + 1));
    throw new Error(`Could not parse JSON from model output:\n${text.slice(0, 800)}`);
  }
}
