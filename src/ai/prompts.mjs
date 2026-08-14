import { actionReference } from '../flow/schema.mjs';

const RULES = `Hard rules:
- Never invent UI that is not in the material you were given.
- Never invent URLs, button labels, field names, error messages or wait times.
- If something is unclear, describe only what the captured data proves.
- Write for the reader's task, not for the DOM: "Select Save" not "Click the button with id #save".`;

/** Prompt: turn a page outline into a runnable flow spec. */
export function flowSpecPrompt({ goal, url, outline, style, existingIds = [] }) {
  return `You are writing an automation spec for Guidesmith, a documentation toolkit.
Guidesmith runs your spec with Playwright, screenshots each step, and publishes a Docusaurus guide.

# Task
Write ONE flow spec (YAML) that walks a user through this goal:
"${goal}"

Starting URL: ${url}
Audience: ${style.audience}

# Page outline captured from the live app
${outline}

# Flow spec format
Top level keys: id (kebab-case, unique; already used: ${existingIds.join(', ') || 'none'}), title, description,
audience, prerequisites (array of strings), tags (array), sidebarPosition (number), steps (array).

Each step:
  name: short imperative label shown as the guide's step heading, e.g. "Enter your email address"
  action: one of the actions below
  note: one or two sentences of user-facing explanation (what this does / what to expect)
  result: (optional) what the user should see afterwards
  callout: (optional) { type: tip|note|warning|danger, text: "..." }
  secret: true on any step that types a password (the value is masked in the docs)
  screenshot: false to skip capturing this step
  highlight: false, or a CSS selector, to override which element is outlined

# Available actions
${actionReference()}

# Targeting elements
Use exactly one of: selector (CSS), text, label, placeholder, testId, role ({role: "button", name: "Save"}).
Prefer role/label/text — they survive redesigns better than CSS selectors.

${RULES}

Output ONLY a \`\`\`yaml fenced block containing the flow spec. No commentary.`;
}

/** Prompt: turn a capture manifest into a finished MDX guide. */
export function guidePrompt({ manifest, imageBase, style, extraContext = '' }) {
  const steps = manifest.steps
    .map((s) => {
      const bits = [
        `### Step ${s.index}: ${s.name}`,
        `- action: ${s.action}${s.target ? ` on ${s.target}` : ''}`,
        s.value ? `- typed value: ${s.value}` : null,
        s.url ? `- navigated to: ${s.url}` : null,
        `- page after this step: ${s.pageTitle || '(untitled)'} — ${s.pageUrl}`,
        s.expected ? `- verified: ${s.expected}` : null,
        s.note ? `- author's note: ${s.note}` : null,
        s.result ? `- expected result: ${s.result}` : null,
        s.callout ? `- callout (${s.callout.type}): ${s.callout.text}` : null,
        s.optional ? '- this step is OPTIONAL' : null,
        s.screenshotFile ? `- screenshot: ${imageBase}/${s.screenshotFile}` : '- no screenshot for this step',
      ].filter(Boolean);
      return bits.join('\n');
    })
    .join('\n\n');

  return `You are a senior technical writer producing an end-user guide for a Docusaurus site.

# Source material — a Playwright capture of the real app
Guide title: ${manifest.title}
Description: ${manifest.description || '(none)'}
Audience: ${manifest.audience || style.audience}
Prerequisites: ${manifest.prerequisites?.length ? manifest.prerequisites.join('; ') : '(none stated)'}
App URL: ${manifest.baseUrl}
Captured: ${manifest.capturedAt} on ${manifest.browser} at ${manifest.viewport?.width}x${manifest.viewport?.height}

${steps}

${extraContext}

# Output format — a single MDX file
Start with YAML frontmatter, exactly these keys:
---
id: ${manifest.flowId}
title: ${manifest.title}
sidebar_label: <short label, max 30 chars>
${manifest.sidebarPosition != null ? `sidebar_position: ${manifest.sidebarPosition}\n` : ''}description: <one sentence, max 155 chars>
${manifest.tags?.length ? `tags: [${manifest.tags.join(', ')}]\n` : ''}---

Then:
1. One short intro paragraph: what the reader will accomplish and roughly how long it takes.
2. A "## Before you begin" section ONLY if there are prerequisites.
3. "## Steps" with each step as "### <n>. <imperative label>".
   - Under each heading: ${style.maxWordsPerStep} words maximum, in ${style.tone}.
   - Then the screenshot exactly as: ![<descriptive alt text>](<the screenshot path given above>)
   - Use the screenshot path VERBATIM. Do not rename, reorder, or omit images.
   - Use Docusaurus admonitions for callouts: :::tip / :::note / :::warning / :::danger
4. A "## What you should see" closing section describing the final state.
5. A "## Troubleshooting" section ONLY if the capture shows a plausible failure point.

${RULES}
- Language: ${style.language}.
- Do not add a top-level "# Title" heading; the frontmatter title renders it.

Output ONLY a \`\`\`mdx fenced block containing the file contents. No commentary.`;
}

/** Prompt: propose which guides a site needs, from an exploration crawl. */
export function outlinePrompt({ pages, style, goal }) {
  return `You are planning a user-guide documentation set for a web app.

# What the crawler found
${pages.map((p) => `## ${p.title || '(untitled)'} — ${p.url}\n${p.outline}`).join('\n\n')}

# Goal
${goal || 'Cover the tasks a new user must be able to complete on their own.'}
Audience: ${style.audience}

Propose 3-8 guides. For each: a kebab-case id, a task-shaped title (starts with a verb),
one-sentence description, the starting URL, and 3-8 rough step labels.
Order them the way a new user would encounter them and set sidebarPosition accordingly.

Output ONLY a \`\`\`json fenced block:
{"guides":[{"id":"...","title":"...","description":"...","startUrl":"...","sidebarPosition":1,"steps":["...","..."]}]}`;
}
