import { callProvider, extractBlock, extractJson, isAvailable, PROVIDERS } from './providers.mjs';
import { flowSpecPrompt, guidePrompt, outlinePrompt } from './prompts.mjs';
import { log } from '../util/log.mjs';

export { PROVIDERS, isAvailable };

/**
 * A thin façade over the provider CLIs so commands don't care which model is behind it.
 * `provider: 'none'` (or --no-ai) makes every call throw, and callers fall back to
 * the deterministic renderer — the toolkit stays usable with no model at all.
 */
export function createAI(aiConfig, { cwd } = {}) {
  const provider = aiConfig.provider || 'none';
  const enabled = provider !== 'none';

  const ask = async (prompt) => {
    if (!enabled) throw new Error('AI is disabled (provider "none"). Use --provider or --ai to enable.');
    const t0 = Date.now();
    const out = await callProvider(provider, prompt, {
      model: aiConfig.model,
      args: aiConfig.args || [],
      timeout: aiConfig.timeout,
      cwd,
    });
    log.debug(`ai: ${provider} responded in ${Date.now() - t0}ms (${out.length} chars)`);
    return out;
  };

  return {
    provider,
    enabled,
    ask,
    async flowSpec(args) {
      return extractBlock(await ask(flowSpecPrompt(args)), 'yaml');
    },
    async guide(args) {
      return extractBlock(await ask(guidePrompt(args)), 'mdx|markdown|md');
    },
    async outline(args) {
      return extractJson(await ask(outlinePrompt(args)));
    },
  };
}
