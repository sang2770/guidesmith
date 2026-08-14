/**
 * Instructions handed to whichever AI agent drives the toolkit.
 * `guidesmith init` writes these into the target project so Claude Code,
 * Codex and Gemini CLI all pick them up without extra prompting.
 */

export const AGENT_SKILL = `---
name: user-guide-docs
description: Write step-by-step end-user documentation for a web app using guidesmith — author Playwright flow specs, capture annotated screenshots, and publish a Docusaurus site. Use when asked to document a user journey, produce a how-to guide, refresh stale screenshots, or set up a docs site for a web app.
---

# Writing user guides with guidesmith

The pipeline is always the same four moves. Do them in order; do not skip capture.

\`\`\`
flow spec (you write)  →  guidesmith capture  →  guidesmith generate  →  guidesmith build
    YAML                    Playwright + PNGs       MDX from the manifest    Docusaurus site
\`\`\`

## 1. Understand the app before writing anything

Never write a flow spec from imagination. Get the real DOM first:

\`\`\`bash
guidesmith explore --url http://localhost:3000 --depth 1   # prints a page outline (roles, labels, links)
\`\`\`

If the app needs a login, capture a session once and reuse it:
set \`saveStorageState: auth/user.json\` on a login flow, then \`storageState: auth/user.json\` on the others.

## 2. Author the flow spec

One flow = one task the user wants to accomplish. Put it in \`flows/<id>.flow.yaml\`.

- \`id\` kebab-case and unique, \`title\` starts with a verb ("Create your first project").
- Target elements with \`role\`, \`label\`, \`text\` or \`testId\` before reaching for a CSS \`selector\` —
  accessible targets survive redesigns and double as a check that the app is accessible.
- \`note:\` is the user-facing sentence for that step. Write what the user needs to know,
  not what the automation does.
- Mark password steps \`secret: true\`. The value is masked everywhere in the output.
- \`redact:\` (flow level) blurs selectors containing customer data in every screenshot.
- Steps that only wait or set up state: \`screenshot: false\`.

Validate before running: \`guidesmith lint\`.

## 3. Capture

\`\`\`bash
guidesmith capture                      # every flow
guidesmith capture --flow sign-in       # one flow, by id or path
guidesmith capture --headed             # watch it drive the browser while debugging
\`\`\`

Output lands in \`captures/<flow-id>/\`: numbered PNGs plus \`capture.json\`, the manifest
recording each step's action, resulting URL, page title and screenshot hash.

If a step fails, the runner writes \`failure-step-NN.png\`. Open it — the selector is usually
wrong, or the step needs a \`wait\` before it.

## 4. Generate the guide

\`\`\`bash
guidesmith generate                      # AI writes the prose from the manifest
guidesmith generate --no-ai              # deterministic renderer, no model call
guidesmith generate --provider gemini    # claude | gemini | codex
\`\`\`

Generated MDX is validated before it is written: frontmatter must match the flow id, and
every captured screenshot must be referenced exactly once with non-empty alt text. If the model's
output fails that check, guidesmith falls back to the deterministic renderer rather than
publishing something that drifted from the capture.

**Review the prose yourself afterwards.** The model only sees the manifest, so it can be
bland but it cannot be verified for domain accuracy by the toolkit.

## 5. Publish

\`\`\`bash
npm --prefix site install     # once
guidesmith build              # copies screenshots into the site, then builds Docusaurus
npm --prefix site run serve   # preview the built site
\`\`\`

## Keeping guides honest over time

\`guidesmith verify\` re-runs every flow against the live app and compares the new screenshots
to the committed ones (pixel diff, \`--threshold\` to tune). Use it in CI: a guide whose
screenshots drifted is a guide whose instructions probably drifted too.

## Writing rules for the prose

- Second person, present tense, imperative step headings ("Select **Save**").
- One action per step. If a step needs the word "and", split it.
- Never describe implementation ("the POST returns 201") — describe what the user sees.
- Do not invent UI, URLs, error text or timings that are not in the capture manifest.
- State the outcome after an action that changes the screen ("The project list refreshes").
`;

export const AGENTS_MD = `# Working in this repository

This project builds **end-user documentation for a web app**. Screenshots come from the real
app via Playwright; the site is Docusaurus. The tool that ties them together is \`guidesmith\`.

## Commands

| Command | What it does |
| --- | --- |
| \`guidesmith doctor\` | Check Playwright browsers and AI CLI availability |
| \`guidesmith explore --url <url>\` | Print an accessibility/DOM outline of the live app |
| \`guidesmith lint\` | Validate every flow spec in \`flows/\` |
| \`guidesmith capture [--flow <id>]\` | Drive the app, write annotated screenshots + manifest |
| \`guidesmith generate [--no-ai]\` | Turn capture manifests into MDX guides |
| \`guidesmith verify\` | Re-capture and pixel-diff against committed screenshots |
| \`guidesmith build\` | Sync images into the site and run the Docusaurus build |

## Layout

- \`flows/*.flow.yaml\` — the source of truth for each guide. **Edit these, not the MDX.**
- \`captures/<id>/\` — generated screenshots + \`capture.json\`. Committed, never hand-edited.
- \`site/docs/guides/*.mdx\` — generated guides. Regenerated from captures; hand edits are lost.
- \`site/\` — the Docusaurus site. \`docusaurus.config.js\`, the landing page and CSS are yours to edit.

## Rules

1. A guide's content changes by editing its flow spec and re-running capture + generate.
2. Never write a screenshot path by hand — \`generate\` wires them up from the manifest.
3. Never put real customer data in a flow. Use \`secret: true\` for passwords and \`redact:\` for PII.
4. If a capture fails, fix the selector in the flow spec; do not delete the step to make it pass.
`;
