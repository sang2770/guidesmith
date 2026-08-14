/**
 * Turns a declarative step into Playwright calls.
 * Every target form lands on a Locator, so the rest of the pipeline
 * (annotation, clipping, assertions) has one thing to work with.
 */

export function resolveTarget(page, step) {
  if (step.selector !== undefined) return page.locator(step.selector);
  if (step.testId !== undefined) return page.getByTestId(step.testId);
  if (step.label !== undefined) return page.getByLabel(step.label, { exact: false });
  if (step.placeholder !== undefined) return page.getByPlaceholder(step.placeholder, { exact: false });
  if (step.text !== undefined) return page.getByText(step.text, { exact: false });
  if (step.role !== undefined) {
    const role = typeof step.role === 'string' ? { role: step.role } : step.role;
    const { role: name, ...opts } = role;
    return page.getByRole(name, opts);
  }
  return null;
}

function absoluteUrl(url, baseUrl) {
  if (/^[a-z]+:\/\//i.test(url) || url.startsWith('file:')) return url;
  if (!baseUrl) return url;
  return `${baseUrl.replace(/\/+$/, '')}/${String(url).replace(/^\/+/, '')}`;
}

/**
 * Execute one step. Returns metadata describing what happened,
 * which becomes the raw material for the generated guide.
 */
export async function runAction(page, step, ctx) {
  const action = step.action || 'screenshot';
  const timeout = step.timeout ?? ctx.timeout;
  const target = resolveTarget(page, step);
  const meta = { action, target: describeTarget(step) };

  switch (action) {
    case 'goto': {
      const url = absoluteUrl(step.url, ctx.baseUrl);
      await page.goto(url, { waitUntil: step.waitUntil || 'load', timeout });
      meta.url = url;
      break;
    }
    case 'click':
      await target.first().click({ timeout });
      break;
    case 'dblclick':
      await target.first().dblclick({ timeout });
      break;
    case 'fill':
      await target.first().fill(String(step.value), { timeout });
      meta.value = redactValue(step);
      break;
    case 'type':
      await target.first().pressSequentially(String(step.value), { timeout, delay: step.delay ?? 25 });
      meta.value = redactValue(step);
      break;
    case 'select':
      await target.first().selectOption(step.value, { timeout });
      meta.value = step.value;
      break;
    case 'check':
      await target.first().check({ timeout });
      break;
    case 'uncheck':
      await target.first().uncheck({ timeout });
      break;
    case 'hover':
      await target.first().hover({ timeout });
      break;
    case 'press':
      if (target) await target.first().press(step.key, { timeout });
      else await page.keyboard.press(step.key);
      meta.key = step.key;
      break;
    case 'scroll':
      await target.first().scrollIntoViewIfNeeded({ timeout });
      break;
    case 'upload':
      await target.first().setInputFiles(step.files, { timeout });
      meta.files = step.files;
      break;
    case 'wait':
      if (step.ms !== undefined) await page.waitForTimeout(step.ms);
      else await target.first().waitFor({ state: step.state || 'visible', timeout });
      break;
    case 'expect': {
      if (step.url) {
        await page.waitForURL(
          step.url.includes('*') ? new RegExp(globToRegex(step.url)) : absoluteUrl(step.url, ctx.baseUrl),
          { timeout },
        );
        meta.expected = `url ${step.url}`;
        break;
      }
      const state = step.state || 'visible';
      await target.first().waitFor({ state, timeout });
      if (step.value !== undefined) {
        const text = (await target.first().innerText()).trim();
        if (!text.includes(String(step.value))) {
          throw new Error(
            `expect failed: ${describeTarget(step)} text ${JSON.stringify(text)} does not contain ${JSON.stringify(step.value)}`,
          );
        }
      }
      meta.expected = step.value !== undefined ? `text contains "${step.value}"` : state;
      break;
    }
    case 'screenshot':
      break;
    case 'viewport':
      await page.setViewportSize(step.viewport);
      meta.viewport = step.viewport;
      break;
    case 'eval':
      meta.result = await page.evaluate(step.script);
      break;
    default:
      throw new Error(`Unsupported action "${action}"`);
  }

  if (step.settle ?? ctx.settle) await page.waitForTimeout(step.settle ?? ctx.settle);
  return meta;
}

function globToRegex(glob) {
  return `^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`;
}

/** Never leak a password into the docs, even if the flow spells it out. */
function redactValue(step) {
  if (step.secret) return '••••••••';
  return String(step.value);
}

export function describeTarget(step) {
  for (const key of ['selector', 'testId', 'label', 'placeholder', 'text']) {
    if (step[key] !== undefined) return `${key}=${JSON.stringify(step[key])}`;
  }
  if (step.role !== undefined) return `role=${JSON.stringify(step.role)}`;
  return null;
}
