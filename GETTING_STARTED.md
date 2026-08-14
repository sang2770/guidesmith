# Getting started with guidesmith

A step-by-step walkthrough: from an empty folder to a published documentation site with
real screenshots of your app.

Allow about 20 minutes the first time. You need **Node 18 or newer** and a web app you can
open in a browser (running locally is fine).

---

## Step 1 — Install guidesmith

```bash
git clone https://github.com/<your-account>/guidesmith.git
cd guidesmith
npm install
npx playwright install chromium
npm link
```

`npm link` puts the `guidesmith` command on your PATH. Skip it if you prefer to type
`node /path/to/guidesmith/bin/guidesmith.mjs` every time.

**Check it worked:**

```bash
guidesmith --version
```

---

## Step 2 — Check your machine is ready

```bash
guidesmith doctor
```

You should see a green tick for Playwright and for Node.

| What you see | What to do |
| --- | --- |
| `✗ Playwright chromium` | Run `npx playwright install chromium` |
| `✗ claude CLI` / `✗ gemini CLI` / `✗ codex CLI` | Optional. Install one to get AI-written prose, or use `--no-ai` everywhere |
| `✗ guidesmith.config.json` | Expected at this point — you create it in the next step |

---

## Step 3 — Create your documentation project

Point it at the app you want to document:

```bash
guidesmith init --dir ~/acme-docs \
  --base-url http://localhost:3000 \
  --title "Acme Console Docs" \
  --tagline "Everything you need to run your first project."

cd ~/acme-docs
```

**What you get:**

```
guidesmith.config.json    settings: app URL, viewport, AI provider, redaction
flows/                    one file per guide — this is what you edit
captures/                 screenshots land here
site/                     a ready-to-run Docusaurus site
AGENTS.md                 instructions for AI agents working in this repo
.claude/skills/           the same instructions as a Claude Code skill
```

---

## Step 4 — Start the app you are documenting

guidesmith drives a **real browser against a real app**, so the app has to be running.

```bash
# in another terminal, whatever your app needs
npm start
```

Confirm the URL in `guidesmith.config.json` (`baseUrl`) matches where your app is serving.

> **No app handy?** Try the bundled demo instead:
> ```bash
> python3 -m http.server 4173 --directory <guidesmith>/examples/demo-app
> ```
> and set `baseUrl` to `http://localhost:4173`.

---

## Step 5 — Look at what your app offers

```bash
guidesmith explore --url http://localhost:3000 --depth 1
```

This prints the buttons, form fields, links and headings guidesmith can see — the same
information an AI agent uses to write a guide. Use it to decide which tasks are worth
documenting, and to copy exact field labels.

```
URL: http://localhost:3000
Title: Acme Console — Sign in
Headings:
  - h1: Sign in
Inputs:
  - Email [type=email, required, #email]
  - Password [type=password, required, #password]
Buttons:
  - Sign in
Links:
  - Reset password → #reset
```

---

## Step 6 — Write your first flow spec

A **flow** is one task a user wants to complete. Create `flows/sign-in.flow.yaml`:

```yaml
id: sign-in
title: Sign in to your account
description: Start your session so you can reach the dashboard.
sidebarPosition: 1
prerequisites:
  - An invitation email from your workspace admin

steps:
  - name: Open the sign-in page
    action: goto
    url: /login
    note: Go to the sign-in page. Bookmark it — this is where you start every time.

  - name: Enter your email address
    action: fill
    label: Email                 # the label shown next to the field
    value: you@example.com
    note: Type the address your invitation was sent to.

  - name: Enter your password
    action: fill
    label: Password
    value: your-password
    secret: true                 # masks the value in the published guide
    note: Passwords are case sensitive.
    callout:
      type: tip
      text: Forgotten it? Select "Reset password" under the form.

  - name: Select Sign in
    action: click
    role: { role: button, name: Sign in }
    result: The dashboard opens.

  - name: Confirm you are signed in
    action: expect
    text: Dashboard
```

**Rules of thumb**

- One action per step. If the step name needs the word "and", split it in two.
- `note:` is the sentence your reader sees. Write what *they* need to know.
- Target fields by `label`, `text` or `role` before falling back to a CSS `selector` —
  labels survive redesigns.
- Put anything sensitive in `secret: true` (passwords) or `redact:` (customer data).

**Prefer to have an AI write it?**

```bash
guidesmith author "invite a teammate" --url http://localhost:3000/team
```

It reads the live page and drafts `flows/invite-a-teammate.flow.yaml` for you to review.

**Check the spec is valid:**

```bash
guidesmith lint
```

---

## Step 7 — Capture the screenshots

```bash
guidesmith capture
```

Add `--headed` the first time if you want to watch the browser do it.

```
sign-in — Sign in to your account
  01 Open the sign-in page
  02 Enter your email address
  03 Enter your password
  04 Select Sign in
  05 Confirm you are signed in
✓ sign-in: 5 steps, 5 screenshots (4637ms)
```

Screenshots land in `captures/sign-in/`, each with the relevant control outlined in red and
a badge matching the step number.

**If a step fails**, guidesmith stops and writes `captures/<flow>/failure-step-NN.png`.
Open it — you will usually see either that the element has a different label than you
expected, or that the page had not finished loading. Fix the target, or add a wait:

```yaml
  - name: Wait for the dashboard
    action: wait
    text: Dashboard
    screenshot: false
```

---

## Step 8 — Generate the guide

```bash
guidesmith generate                 # AI writes the prose
guidesmith generate --no-ai         # or build it straight from your flow spec
```

Choose your model with `--provider claude`, `--provider gemini` or `--provider codex`
(whichever CLI you have installed and signed in to).

The result is `site/docs/guides/sign-in.mdx`, with screenshots already wired up. Guidesmith
checks the model's output before writing it: if a screenshot went missing or an image path
was invented, it discards that draft and uses the deterministic renderer instead.

**Read the guide and edit the wording** — in the flow spec's `note:` fields, not in the MDX.
The MDX is regenerated every time.

---

## Step 9 — Preview the site

```bash
npm --prefix site install     # first time only
guidesmith build --serve
```

Open http://localhost:3000 (Docusaurus will pick another port if that one is busy). You get
a landing page plus your guides in the sidebar, ordered by `sidebarPosition`.

To produce the static site instead:

```bash
guidesmith build              # output in site/build/
```

---

## Step 10 — Keep the guides honest

When your app changes, the screenshots go stale. Catch it automatically:

```bash
guidesmith verify
```

It re-drives every flow and compares the new screenshots to the committed ones, exiting
non-zero when something drifted. Per-step diff images land in `captures/<flow>/__diff__/`.

- Change was intentional? `guidesmith verify --update` accepts the new screenshots,
  then run `guidesmith generate` to refresh the prose.
- Too sensitive? Raise `--tolerance` (default `0.005`, i.e. 0.5% of pixels), or add
  animated/live-data elements to `redact:` in `guidesmith.config.json`.

Run it in CI so a UI change that breaks the docs fails the build:

```yaml
- run: npm start & npx wait-on http://localhost:3000
- run: guidesmith verify
```

---

## Step 11 — Publish

Commit `flows/`, `captures/` and `site/docs/` so screenshots are reviewable in pull requests.

To publish on GitHub Pages, copy [examples/github-pages.yml](examples/github-pages.yml)
into `.github/workflows/`, set `url` and `baseUrl` in `site/docusaurus.config.js`, and enable
**Settings → Pages → Source: GitHub Actions** in your repository.

---

## Documenting an app that needs a login

Sign in once, save the session, reuse it in every other flow:

```yaml
# flows/sign-in.flow.yaml
saveStorageState: auth/user.json
```

```yaml
# every other flow
storageState: auth/user.json
```

Add `auth/` to `.gitignore`.

---

## Common problems

| Problem | Cause and fix |
| --- | --- |
| `No guidesmith.config.json found` | You are outside the project folder. `cd` into it, or run `guidesmith init` |
| `Could not load anything at <url>` | The app is not running, or `baseUrl` points at the wrong port |
| `Step N failed: locator.click: Timeout` | The target does not match. Run `guidesmith explore` and copy the exact label |
| Screenshot shows a half-rendered page | Add `settle: 1000` to the step, or a `wait` step before it |
| Guide reads well but skips a step | The step had `screenshot: false`, or the model dropped it — check the warning from `generate` |
| Every screenshot drifts in `verify` | Something animates or shows live data. Add those selectors to `redact:` |
| `claude`/`gemini`/`codex` not found | Install the CLI, or add `--no-ai` |

---

## Where to go next

- [README.md](README.md) — full command and flow-spec reference
- `AGENTS.md` in your project — the rules an AI agent follows when working there
- `guidesmith run` — capture, generate and build in one command
