#!/usr/bin/env bash
# End-to-end demo: serves the bundled two-page app, documents it, builds the site.
#
#   bash examples/demo.sh            capture + generate (no model needed)
#   bash examples/demo.sh --build    also npm-install and build the Docusaurus site
#
# Everything lands in examples/demo-project/ (gitignored). Delete it to start over.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/examples/demo-project"
PORT="${PORT:-4173}"
GS="node $ROOT/bin/guidesmith.mjs"

command -v python3 >/dev/null || { echo "python3 is needed to serve the demo app"; exit 1; }

echo "→ serving examples/demo-app on http://localhost:$PORT"
python3 -m http.server "$PORT" --directory "$ROOT/examples/demo-app" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 1

$GS init --dir "$PROJECT" \
  --base-url "http://localhost:$PORT" \
  --title "Acme Console Docs" \
  --tagline "Everything you need to run your first project." \
  --provider none

cp "$ROOT/flows/demo-login.flow.yaml" "$PROJECT/flows/"
rm -f "$PROJECT/flows/example.flow.yaml"

cd "$PROJECT"
$GS lint
$GS capture
$GS generate --no-ai

if [[ "${1:-}" == "--build" ]]; then
  $GS build
  echo
  echo "Built site: $PROJECT/site/build  →  npm --prefix $PROJECT/site run serve"
else
  echo
  echo "Guides written to $PROJECT/site/docs/guides/"
  echo "Run 'bash examples/demo.sh --build' to build the Docusaurus site too."
fi
