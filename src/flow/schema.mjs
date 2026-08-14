/**
 * The flow spec is the contract between the AI agent and the toolkit.
 * An agent writes YAML/JSON matching this shape; `guidesmith capture` executes it.
 */

export const ACTIONS = {
  goto: { required: ['url'], desc: 'Navigate to a URL (absolute, or relative to baseUrl).' },
  click: { required: [], target: true, desc: 'Click an element.' },
  dblclick: { required: [], target: true, desc: 'Double-click an element.' },
  fill: { required: ['value'], target: true, desc: 'Clear and type into an input.' },
  type: { required: ['value'], target: true, desc: 'Type into an input without clearing.' },
  select: { required: ['value'], target: true, desc: 'Pick an option in a <select>.' },
  check: { required: [], target: true, desc: 'Check a checkbox/radio.' },
  uncheck: { required: [], target: true, desc: 'Uncheck a checkbox.' },
  hover: { required: [], target: true, desc: 'Hover an element (reveals menus/tooltips).' },
  press: { required: ['key'], desc: 'Press a keyboard key, e.g. "Enter" or "Control+S".' },
  scroll: { required: [], target: true, desc: 'Scroll an element into view.' },
  upload: { required: ['files'], target: true, desc: 'Set files on a file input.' },
  wait: { required: [], desc: 'Wait for `ms`, or for a target to reach `state`.' },
  expect: { required: [], target: true, desc: 'Assert a target is visible/hidden/has text.' },
  screenshot: { required: [], desc: 'Take a screenshot without interacting.' },
  viewport: { required: ['viewport'], desc: 'Change the viewport mid-flow.' },
  eval: { required: ['script'], desc: 'Run JS in the page (setup/teardown escape hatch).' },
};

/** A step targets an element by exactly one of these. */
export const TARGET_KEYS = ['selector', 'text', 'label', 'placeholder', 'testId', 'role'];

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validateFlow(flow, { file = 'flow' } = {}) {
  const errors = [];
  const warnings = [];
  const at = (i, msg) => errors.push(`${file}: steps[${i}] ${msg}`);

  if (!isObj(flow)) return { ok: false, errors: [`${file}: flow must be an object`], warnings };
  if (!flow.id || !/^[a-z0-9][a-z0-9-]*$/.test(String(flow.id))) {
    errors.push(`${file}: "id" is required and must be kebab-case (a-z, 0-9, "-")`);
  }
  if (!flow.title) errors.push(`${file}: "title" is required`);
  if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
    errors.push(`${file}: "steps" must be a non-empty array`);
    return { ok: errors.length === 0, errors, warnings };
  }

  flow.steps.forEach((step, i) => {
    if (!isObj(step)) return at(i, 'must be an object');
    const action = step.action || 'screenshot';
    const spec = ACTIONS[action];
    if (!spec) {
      return at(i, `has unknown action "${action}". Known: ${Object.keys(ACTIONS).join(', ')}`);
    }
    for (const key of spec.required) {
      if (step[key] === undefined) at(i, `action "${action}" requires "${key}"`);
    }
    const targets = TARGET_KEYS.filter((k) => step[k] !== undefined);
    if (spec.target && targets.length === 0 && action !== 'expect') {
      at(i, `action "${action}" needs a target (${TARGET_KEYS.join(' | ')})`);
    }
    if (targets.length > 1) {
      at(i, `has multiple targets (${targets.join(', ')}); use exactly one`);
    }
    if (action === 'wait' && step.ms === undefined && targets.length === 0) {
      at(i, 'action "wait" needs either "ms" or a target');
    }
    if (!step.name && !step.title) {
      warnings.push(`${file}: steps[${i}] has no "name" — the guide will use a generated label`);
    }
    if (step.role !== undefined && !isObj(step.role) && typeof step.role !== 'string') {
      at(i, '"role" must be a string or {role, name}');
    }
  });

  return { ok: errors.length === 0, errors, warnings };
}

/** Machine-readable action reference, injected into AI prompts. */
export function actionReference() {
  return Object.entries(ACTIONS)
    .map(([name, spec]) => {
      const req = spec.required.length ? ` (requires: ${spec.required.join(', ')})` : '';
      const tgt = spec.target ? ' [needs a target]' : '';
      return `- ${name}${req}${tgt}: ${spec.desc}`;
    })
    .join('\n');
}
