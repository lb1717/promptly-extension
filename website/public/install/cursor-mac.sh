#!/usr/bin/env bash
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip}"
INTEGRATIONS="${HOME}/integrations"
CURSOR_PLUGIN="${HOME}/.cursor/plugins/local/promptly-cursor"

echo "→ Checking Node.js…"
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js not found. Install Node.js 18+ from https://nodejs.org/ then rerun."
  exit 1
fi
node --version
echo "✓ Node.js OK"

echo "→ Downloading Promptly plugin pack…"
curl -fsSL -o "${HOME}/promptly.zip" "${PLUGIN_PACK_URL}"
unzip -oq "${HOME}/promptly.zip" -d "${HOME}"

if [[ ! -f "${INTEGRATIONS}/.claude-plugin/marketplace.json" ]]; then
  echo "✗ Plugin pack failed — retry download"
  exit 1
fi
echo "✓ Plugin pack OK"

echo "→ Installing Cursor plugin…"
mkdir -p "${HOME}/.cursor/plugins/local"
rm -rf "${CURSOR_PLUGIN}"
cp -R "${INTEGRATIONS}/cursor" "${CURSOR_PLUGIN}"

if [[ ! -d "${CURSOR_PLUGIN}/.cursor-plugin" ]]; then
  echo "✗ Cursor plugin copy failed"
  exit 1
fi

echo ""
echo "✓ Promptly installed for Cursor"
echo "  If you used the one-command setup, account connect runs next automatically."
echo "  Otherwise finish step 1 on promptly-labs.com/integrations, then trust hooks (step 2)."
