/**
 * Deterministic MDX renderer.
 *
 * Used when no AI provider is configured (--no-ai), and as the safety net if a
 * model's output fails validation. It never invents prose: everything it writes
 * comes from the flow spec and the capture manifest.
 */

const ADMONITIONS = new Set(['tip', 'note', 'info', 'warning', 'danger', 'caution']);

function esc(s) {
  // MDX treats { and < as syntax; escape them in prose we didn't author.
  return String(s).replace(/([<{])/g, '\\$1');
}

function frontmatter(manifest) {
  const lines = ['---', `id: ${manifest.flowId}`, `title: ${yamlString(manifest.title)}`];
  lines.push(`sidebar_label: ${yamlString(truncate(manifest.title, 30))}`);
  if (manifest.sidebarPosition != null) lines.push(`sidebar_position: ${manifest.sidebarPosition}`);
  if (manifest.description) lines.push(`description: ${yamlString(truncate(manifest.description, 155))}`);
  if (manifest.tags?.length) lines.push(`tags: [${manifest.tags.map(yamlString).join(', ')}]`);
  lines.push('---', '');
  return lines.join('\n');
}

function yamlString(s) {
  const v = String(s ?? '');
  return /[:#{}[\]&*!|>'"%@`]|^\s|\s$/.test(v) ? JSON.stringify(v) : v;
}

function truncate(s, n) {
  const v = String(s ?? '');
  return v.length <= n ? v : `${v.slice(0, n - 1).trimEnd()}…`;
}

function actionSentence(step) {
  const label = step.name;
  switch (step.action) {
    case 'goto':
      return `Open ${step.url ? `[${step.url}](${step.url})` : 'the page'} in your browser.`;
    case 'fill':
    case 'type':
      return `Type ${step.value ? `\`${esc(step.value)}\`` : 'your value'} into the highlighted field.`;
    case 'click':
      return `Select the highlighted control.`;
    case 'select':
      return `Choose \`${esc(step.value)}\` from the highlighted list.`;
    case 'check':
      return 'Tick the highlighted checkbox.';
    case 'uncheck':
      return 'Clear the highlighted checkbox.';
    case 'hover':
      return 'Hover over the highlighted item to reveal its options.';
    case 'press':
      return `Press <kbd>${esc(step.key)}</kbd>.`;
    case 'upload':
      return 'Choose the file you want to upload.';
    case 'expect':
      return `Confirm the highlighted content appears${step.expected ? ` (${esc(step.expected)})` : ''}.`;
    case 'wait':
      return 'Wait for the page to finish loading.';
    default:
      return esc(label);
  }
}

export function renderGuide(manifest, { imageBase }) {
  const out = [frontmatter(manifest)];

  out.push(
    manifest.description
      ? `${esc(manifest.description)}\n`
      : `This guide walks you through **${esc(manifest.title)}**.\n`,
  );

  if (manifest.prerequisites?.length) {
    out.push('## Before you begin\n');
    out.push(manifest.prerequisites.map((p) => `- ${esc(p)}`).join('\n'), '');
  }

  out.push('## Steps\n');

  let n = 0;
  for (const step of manifest.steps) {
    if (step.action === 'eval') continue;
    n += 1;
    out.push(`### ${n}. ${esc(step.name)}${step.optional ? ' *(optional)*' : ''}\n`);
    out.push(step.note ? esc(step.note) : actionSentence(step));
    out.push('');
    if (step.result) out.push(`${esc(step.result)}\n`);
    if (step.callout && ADMONITIONS.has(step.callout.type)) {
      out.push(`:::${step.callout.type}\n\n${esc(step.callout.text)}\n\n:::\n`);
    }
    if (step.screenshotFile) {
      out.push(`![${esc(step.name)}](${imageBase}/${step.screenshotFile})\n`);
    }
  }

  const last = [...manifest.steps].reverse().find((s) => s.screenshotFile);
  out.push('## What you should see\n');
  out.push(
    `When you have finished, you should be on **${esc(last?.pageTitle || manifest.title)}**` +
      `${last?.pageUrl ? ` (\`${esc(last.pageUrl)}\`)` : ''}.\n`,
  );

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/**
 * Guard rails for AI output: the model may write the prose, but it does not get to
 * drop screenshots, rename image paths, or skip frontmatter.
 * @returns {{ok: boolean, problems: string[]}}
 */
export function validateGuide(mdx, manifest, { imageBase }) {
  const problems = [];
  if (!/^---\n/.test(mdx)) problems.push('missing YAML frontmatter');
  if (!new RegExp(`^id:\\s*${manifest.flowId}\\s*$`, 'm').test(mdx)) {
    problems.push(`frontmatter id must be "${manifest.flowId}"`);
  }
  if (!/^title:\s*\S/m.test(mdx)) problems.push('frontmatter is missing title');

  const expected = manifest.steps.filter((s) => s.screenshotFile).map((s) => `${imageBase}/${s.screenshotFile}`);
  const referenced = [...mdx.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1].trim());
  for (const img of expected) {
    if (!referenced.includes(img)) problems.push(`screenshot not referenced: ${img}`);
  }
  for (const img of referenced) {
    if (!expected.includes(img)) problems.push(`references an image that was not captured: ${img}`);
  }
  const missingAlt = [...mdx.matchAll(/!\[\s*\]\(([^)]+)\)/g)].map((m) => m[1]);
  for (const img of missingAlt) problems.push(`image has empty alt text: ${img}`);

  return { ok: problems.length === 0, problems };
}
