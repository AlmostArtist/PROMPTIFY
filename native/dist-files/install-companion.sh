#!/bin/sh
# Connect PROMPTIFY to the Codex / Claude Code CLIs on Linux. Run:  sh install-companion.sh
cd "$(dirname "$0")" || exit 1
NODE="$(command -v node 2>/dev/null)"
for candidate in /usr/local/bin/node /usr/bin/node "$HOME"/.nvm/versions/node/*/bin/node "$HOME"/.volta/bin/node; do
  if [ -z "$NODE" ] && [ -x "$candidate" ]; then NODE="$candidate"; fi
done
if [ -z "$NODE" ]; then
  echo "Node.js is required for the PROMPTIFY companion. Install the LTS version from https://nodejs.org and run this again."
  exit 1
fi
exec "$NODE" install.mjs "$@"
