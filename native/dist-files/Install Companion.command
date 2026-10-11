#!/bin/bash
# Double-click to connect PROMPTIFY to the ChatGPT (Codex CLI) and Claude Code
# CLIs on this Mac. Needs Node.js — no npm commands or project source.
cd "$(dirname "$0")" || exit 1
NODE="$(command -v node 2>/dev/null)"
for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node "$HOME"/.volta/bin/node; do
  if [ -z "$NODE" ] && [ -x "$candidate" ]; then NODE="$candidate"; fi
done
if [ -z "$NODE" ]; then
  echo "Node.js is required for the PROMPTIFY companion, but it isn't installed."
  echo "Opening https://nodejs.org — install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download" 2>/dev/null
  echo; read -n 1 -s -r -p "Press any key to close…"; echo
  exit 1
fi
"$NODE" install.mjs "$@"
status=$?
echo; read -n 1 -s -r -p "Press any key to close…"; echo
exit $status
