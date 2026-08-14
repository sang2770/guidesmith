# Documenting a web app with Google Antigravity + guidesmith

Antigravity gives an agent synchronized control of your **editor, terminal and browser**.
Guidesmith gives that agent a way to turn what it sees in the browser into a documentation
site that stays correct. This is how to combine them.

## Division of labour

Antigravity's own browser tool and guidesmith's Playwright runner look similar. They are not
interchangeable — use each for what it is good at:

| Job | Tool | Why |
| --- | --- | --- |
| Explore the app, figure out what to document | Antigravity browser subagent, or `guidesmith explore` | Interactive, no spec needed |
| Verify a change works | Antigravity browser recording / screenshot artifact | Throwaway evidence for review |
| **Screenshots that ship in the docs** | **`guidesmith capture`** | Deterministic, re-runnable, annotated, pixel-diffable |
| Detect that the docs went stale | `guidesmith verify` | Runs in CI without an agent |

Antigravity artifacts are for *you* to review the agent's work. Guidesmith captures are for
*your users* to read. Never paste an artifact screenshot into a guide — it cannot be
regenerated or diffed later.

---

## Mode A — the Antigravity agent is the writer (recommended)

Inside Antigravity you already have a model with file access. You do **not** need the
`gemini`/`claude`/`codex` CLI: let the agent write the prose into the flow spec, then render
it deterministically.

```
agent explores app  →  agent writes flows/*.flow.yaml (prose lives in `note:`)
                    →  guidesmith capture        (Playwright, annotated PNGs)
                    →  guidesmith generate --no-ai   (renders MDX from the spec)
                    →  guidesmith build
```

Why prose goes in the flow spec and not the MDX: `generate` overwrites the MDX every run.
Text written into `note:`, `result:` and `callout:` survives regeneration; text typed
straight into the `.mdx` file does not.

### Step 1 — Prepare the project (once, in the Antigravity terminal)

```bash
git clone https://github.com/<your-account>/guidesmith.git ~/tools/guidesmith
cd ~/tools/guidesmith && npm install && npx playwright install chromium && npm link

guidesmith init --dir ~/acme-docs --base-url http://localhost:3000 --title "Acme Docs"
```

Open `~/acme-docs` as the Antigravity workspace. `init` has already written `AGENTS.md`
there — Antigravity reads it automatically, so the agent starts out knowing the pipeline
and the rules (never hand-edit MDX, never invent UI, mask secrets).

### Step 2 — Let the agent run guidesmith without asking every time

Agent Settings → terminal permissions. Keep **Request Review** as the default, but add to the
Allow list:

```
guidesmith capture
guidesmith generate
guidesmith lint
guidesmith explore
guidesmith verify
```

Leave `guidesmith build` and any `npm install` out of the allow list if you want to approve
those yourself. Also make sure your app's origin (`http://localhost:3000`) is on the browser
allowlist — localhost is allowed by default.

### Step 3 — Start the app you are documenting

The app must be running. Guidesmith drives a real browser against it.

### Step 4 — Prompt the agent

Paste this into the Agent Manager:

> Document the "sign in and create a project" journey for the app at http://localhost:3000.
>
> Follow the pipeline in AGENTS.md. Specifically:
> 1. Run `guidesmith explore --url http://localhost:3000 --depth 1` and read the outline.
>    Use the exact labels it reports — do not guess selectors.
> 2. Write `flows/sign-in.flow.yaml`. Target elements by `label`, `text` or `role`, not CSS.
>    Put the user-facing explanation of each step in `note:`, the expected outcome in
>    `result:`, and mark the password step `secret: true`.
> 3. Run `guidesmith lint`, then `guidesmith capture --flow sign-in`.
> 4. If a step fails, open `captures/sign-in/failure-step-NN.png`, fix the target in the
>    flow spec, and re-run. Do not delete a step to make the capture pass.
> 5. Run `guidesmith generate --flow sign-in --no-ai`.
> 6. Show me the generated MDX and the screenshots for review.

The agent will produce a task list artifact, then work through it. You review at the end by
opening the PNGs in `captures/sign-in/` — every step is a picture, so mistakes are obvious.

### Step 5 — Iterate on the wording

Review the guide and tell the agent what to change, e.g.:

> In step 3, explain that passwords are case sensitive, and add a tip callout pointing at
> "Reset password". Edit the flow spec, not the MDX, then re-run generate.

Because only `note:` changed, you can re-run `generate --no-ai` alone — no need to re-capture.

### Step 6 — Publish

```bash
guidesmith build
```

Ask the agent to copy `examples/github-pages.yml` into `.github/workflows/` if you want
GitHub Pages deployment.

---

## Mode B — guidesmith calls Gemini itself

Useful when the docs are regenerated in CI, or by a human without the IDE open.

```bash
npm install -g @google/gemini-cli   # then: gemini  (sign in once)
guidesmith generate --provider gemini
```

Here the model only ever sees the capture manifest, and the output is validated before it is
written (frontmatter must match the flow id, every screenshot must be referenced exactly
once). A draft that fails validation is discarded in favour of the deterministic renderer.

Set it as the project default in `guidesmith.config.json`:

```json
{ "ai": { "provider": "gemini", "model": "gemini-3-pro" } }
```

Mode A and Mode B coexist — the same flow specs work either way.

---

## Optional: a project-scoped subagent

If you want a dedicated agent for docs work, create
`.agents/agents/guide-writer/agent.md` in your documentation project:

```markdown
---
name: guide-writer
description: Writes and maintains end-user guides with guidesmith. Use for documenting a user journey, refreshing stale screenshots, or fixing a failing capture.
---

You maintain end-user documentation for a web app using guidesmith.

Read AGENTS.md in this workspace first — it defines the pipeline and is authoritative.

Working rules:
- The flow spec is the source of truth. Change a guide by editing `flows/*.flow.yaml`
  and re-running capture + generate. Never edit files under `site/docs/guides/`.
- Ground every step in a real page outline from `guidesmith explore`. Never guess a
  selector, a button label, an error message or a URL.
- Prefer `label`, `text` and `role` targets over CSS selectors.
- User-facing prose belongs in `note:`, `result:` and `callout:`.
- Passwords get `secret: true`. Customer data goes in the flow's `redact:` list.
- A failing capture means the spec is wrong. Fix the target; never delete the step.
- After capture, review the PNGs in `captures/<flow>/` before generating.
```

Keep the frontmatter minimal. Antigravity has a known failure mode where an unrecognised
tool name in a subagent's frontmatter causes the agent to hang, so omit the `tools:` key
unless you have verified the names.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Agent keeps asking to run `guidesmith capture` | Add it to the terminal Allow list in Agent Settings |
| Agent invents selectors that time out | It skipped `guidesmith explore`. Point it at the outline explicitly |
| Agent edits the `.mdx` and the change vanishes | Expected — `generate` overwrites it. The prose belongs in the flow spec |
| Browser prompt on every navigation | The app's origin is not on the browser allowlist; choose "always allow" |
| Screenshots look different every run | Something animates or shows live data — add those selectors to `redact:` |

## Sources

- [Antigravity docs — Artifacts](https://antigravity.google/docs/artifacts)
- [Antigravity docs — Agent Settings](https://antigravity.google/docs/agent-settings)
- [Antigravity docs — Subagents](https://antigravity.google/docs/subagents)
- [Getting started with Google Antigravity (codelab)](https://codelabs.developers.google.com/getting-started-google-antigravity)
