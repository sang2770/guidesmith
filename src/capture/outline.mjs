/**
 * Page outline: the grounding material an AI agent needs before it can write a
 * flow spec. Deliberately biased toward accessible names (labels, roles) rather
 * than CSS, so drafted specs target elements the way a user perceives them.
 */

/** Serialized into the page by `page.evaluate`. */
export const OUTLINE_FN = (limit) => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const accName = (el) =>
    clean(
      el.getAttribute('aria-label') ||
        (el.labels && el.labels[0] && el.labels[0].textContent) ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        el.value ||
        el.textContent,
    );
  const testIdOf = (el) =>
    el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-test') || null;
  const take = (sel, fn) =>
    Array.from(document.querySelectorAll(sel)).filter(visible).slice(0, limit).map(fn);

  return {
    url: location.href,
    title: document.title,
    headings: Array.from(document.querySelectorAll('h1,h2,h3'))
      .filter(visible)
      .slice(0, limit)
      .map((h) => `${h.tagName.toLowerCase()}: ${clean(h.textContent)}`),
    buttons: take('button, [role=button], input[type=submit], input[type=button]', (el) => ({
      name: accName(el),
      testId: testIdOf(el),
      disabled: !!el.disabled,
    })),
    links: take('a[href]', (el) => ({ name: clean(el.textContent), href: el.getAttribute('href') })),
    inputs: take('input:not([type=hidden]), textarea, select', (el) => ({
      name: accName(el),
      type: el.getAttribute('type') || el.tagName.toLowerCase(),
      required: !!el.required,
      testId: testIdOf(el),
      id: el.id || null,
    })),
    forms: Array.from(document.querySelectorAll('form'))
      .filter(visible)
      .slice(0, limit)
      .map((f) => clean(f.getAttribute('aria-label') || f.getAttribute('name') || f.id || 'form')),
  };
};

export function formatOutline(o) {
  const lines = [`URL: ${o.url}`, `Title: ${o.title || '(none)'}`];
  if (o.headings?.length) {
    lines.push('Headings:');
    for (const h of o.headings) lines.push(`  - ${h}`);
  }
  const section = (label, items, fmt) => {
    const rows = (items || []).filter((i) => i.name || i.href).map(fmt);
    if (!rows.length) return;
    lines.push(`${label}:`);
    for (const r of rows) lines.push(`  - ${r}`);
  };
  section('Inputs', o.inputs, (i) =>
    `${i.name || '(unlabelled)'} [type=${i.type}${i.required ? ', required' : ''}` +
    `${i.testId ? `, testId=${i.testId}` : ''}${i.id ? `, #${i.id}` : ''}]`,
  );
  section('Buttons', o.buttons, (b) =>
    `${b.name || '(unnamed)'}${b.testId ? ` [testId=${b.testId}]` : ''}${b.disabled ? ' (disabled)' : ''}`,
  );
  section('Links', o.links, (l) => `${l.name || '(unnamed)'} → ${l.href}`);
  if (o.forms?.length) lines.push(`Forms: ${o.forms.join(', ')}`);
  return lines.join('\n');
}
