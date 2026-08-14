# guidesmith

A toolkit that lets an AI agent write **step-by-step user guides for a web app** —
grounded in the real UI, not in the model's imagination.

```
flow spec (agent writes)  →  capture (Playwright)  →  generate (Claude/Gemini/Codex)  →  build (Docusaurus)
      YAML                    annotated PNGs +           MDX guide, validated              landing page +
                              capture manifest           against the manifest              docs site
```

The model never guesses what the app looks like. It reads a page outline pulled from the
live DOM, writes an executable spec, and Playwright proves each step by performing it and
screenshotting the result. The prose is then written from that capture manifest — and
rejected if it drops a screenshot or drifts from the flow.

## Why the pipeline is shaped this way

| Problem with LLM-written docs | What guidesmith does |
| --- | --- |
| Screenshots go stale silently | `guidesmith verify` re-drives every flow and pixel-diffs against the committed images |
| The model invents buttons that don't exist | Steps must resolve to real elements or the capture fails |
| Images and prose drift apart | `generate` validates that every captured screenshot is referenced exactly once |
| "Which model do I have to use?" | Any of `claude`, `gemini`, `codex` — or none at all |

## Install

```bash
git clone <this repo> && cd guidesmith
npm install
npx playwright install chromium
npm link            # optional: puts `guidesmith` on your PATH
```

Node 18+. An AI CLI (`claude`, `gemini` or `codex`) is optional — without one, guidesmith
falls back to a deterministic renderer that writes the guide straight from the flow spec.

**New here?** [GETTING_STARTED.md](GETTING_STARTED.md) is the 11-step walkthrough, from an
empty folder to a published site. This README is the reference.
Driving it from an agent IDE? See [ANTIGRAVITY.md](ANTIGRAVITY.md).

## Quick start

```bash
guidesmith init --dir ../my-docs --base-url http://localhost:3000
cd ../my-docs
guidesmith doctor                                   # is Playwright ready? which AI CLIs are on PATH?
guidesmith explore --url http://localhost:3000      # what can a user actually do here?
guidesmith author "invite a teammate"               # AI drafts flows/invite-a-teammate.flow.yaml
guidesmith capture                                  # drive the app, screenshot every step
guidesmith generate                                 # AI writes the MDX guide
guidesmith build                                    # Docusaurus site in site/build
```

Or the whole chain: `guidesmith run`.

### Try it on the bundled demo app

```bash
npm run demo          # serves examples/demo-app, captures it, writes the guides
npm run demo:build    # …and builds the Docusaurus site
```

It scaffolds `examples/demo-project/`, documents a sign-in-and-create-a-project journey
from [flows/demo-login.flow.yaml](flows/demo-login.flow.yaml), and needs no AI CLI.

## Commands

| Command | What it does |
| --- | --- |
| `init` | Scaffold config, `flows/`, a Docusaurus site, and agent instructions (`AGENTS.md`, `.claude/skills/`) |
| `doctor` | Check Playwright browsers, AI CLI availability, and project health |
| `explore` | Crawl the running app and print a DOM/accessibility outline; `--plan` proposes a guide set, `--write` drafts specs |
| `author <goal>` | Draft one flow spec for one goal, grounded in the live page |
| `lint` | Validate every flow spec (unknown actions, missing targets, duplicate ids) |
| `capture` | Execute flows in a real browser, writing annotated screenshots + `capture.json` |
| `generate` | Turn capture manifests into Docusaurus MDX |
| `verify` | Re-capture and pixel-diff against the committed screenshots |
| `build` | Sync screenshots into the site and run the Docusaurus build |
| `run` | `capture` → `generate` → `build` |

## The flow spec

One flow is one task a user wants to complete. This is the only file humans and agents edit.

```yaml
id: sign-in
title: Sign in to your account
description: Start your session so you can reach the dashboard.
sidebarPosition: 1
prerequisites:
  - An invitation email
redact: ['.customer-name']     # blurred in every screenshot

steps:
  - name: Open the sign-in page
    action: goto
    url: /login
    note: Go to the sign-in page. Bookmark it — this is where you start every time.

  - name: Enter your password
    action: fill
    label: Password           # target by accessible label, not CSS
    value: hunter2
    secret: true              # masked everywhere in the output
    callout: { type: tip, text: 'Forgot it? Use "Reset password".' }

  - name: Select Sign in
    action: click
    role: { role: button, name: Sign in }
    result: The dashboard opens.

  - name: Confirm you are signed in
    action: expect
    text: Dashboard
```

**Actions:** `goto` `click` `dblclick` `fill` `type` `select` `check` `uncheck` `hover`
`press` `scroll` `upload` `wait` `expect` `screenshot` `viewport` `eval`

**Targets** (exactly one per step): `selector` `text` `label` `placeholder` `testId` `role`.
Prefer the accessible ones — they survive redesigns.

**Per-step extras:** `note` (the user-facing sentence), `result`, `callout`, `optional`,
`secret`, `screenshot: false`, `highlight` (`false` / a selector / a list), `fullPage`,
`clip`, `caption`, `timeout`, `settle`.

### Screenshots

Every screenshot gets the acted-on element outlined and a badge matching the step number.
Configure globally in `guidesmith.config.json` (`annotate.highlightColor`, `badge`,
`dimBackdrop`) or per step. Passwords are masked by the browser; anything else sensitive
goes in `redact`.

### Authenticated apps

Capture the session once, reuse it everywhere:

```yaml
# flows/sign-in.flow.yaml
saveStorageState: auth/user.json
```
```yaml
# every other flow
storageState: auth/user.json
```

## Choosing the model

```bash
guidesmith generate --provider claude   # claude -p
guidesmith generate --provider gemini   # gemini
guidesmith generate --provider codex    # codex exec
guidesmith generate --no-ai             # deterministic renderer
```

Set a default in `guidesmith.config.json` under `ai.provider` / `ai.model`, and point at a
custom binary with `GUIDESMITH_CLAUDE_BIN` (or `..._GEMINI_BIN`, `..._CODEX_BIN`).
Providers are called headlessly with the prompt on stdin — whatever auth the CLI already
has is what guidesmith uses.

**AI output is validated before it is written.** Frontmatter must match the flow id and
every captured screenshot must be referenced exactly once with non-empty alt text. Output
that fails falls back to the deterministic renderer (`--strict` makes it an error instead).

## Keeping guides honest in CI

```yaml
- run: npm start & npx wait-on http://localhost:3000
- run: guidesmith verify          # exits 1 when screenshots drift or a flow breaks
```

`verify` writes `captures/verify-report.json` plus per-step diff images under
`captures/<flow>/__diff__/`. Accept intentional UI changes with `guidesmith verify --update`.
Tune with `--tolerance` (fraction of pixels allowed to differ, default 0.005) and
`--threshold` (pixelmatch per-pixel sensitivity).

## Layout of a guidesmith project

```
guidesmith.config.json    app URL, viewport, AI provider, annotation + redaction defaults
flows/*.flow.yaml         source of truth for each guide   ← edit these
captures/<id>/            screenshots + capture.json       ← generated, committed
site/docs/guides/*.mdx    generated guides                 ← regenerated, don't hand-edit
site/                     Docusaurus: landing page, theme, config  ← yours to customise
AGENTS.md                 how an agent should work in this repo
.claude/skills/           the same rules as a Claude Code skill
```

## Repo layout (the toolkit itself)

```
bin/guidesmith.mjs        CLI entry
src/cli.mjs               command wiring
src/config.mjs            config discovery + defaults
src/flow/                 spec schema, validation, loading
src/capture/              Playwright runner, action verbs, annotation overlay, DOM outline
src/ai/                   provider adapters (claude/gemini/codex) + prompts
src/mdx/render.mjs        deterministic renderer + AI output validation
src/commands/             one file per CLI command
src/agent/skill.mjs       the agent instructions written by `init`
templates/site/           the Docusaurus scaffold
examples/demo-app/        a two-page app to try the pipeline against
```

## License

MIT
