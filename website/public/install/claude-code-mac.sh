#!/usr/bin/env bash
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip}"
INTEGRATIONS="${HOME}/integrations"

echo "→ Checking Node.js…"
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js not found. Install Node.js 18+ from https://nodejs.org/ then rerun."
  exit 1
fi
node --version
echo "✓ Node.js OK"

export PATH="$(npm prefix -g)/bin:${PATH}"

echo "→ Checking Claude Code CLI…"
if ! command -v claude >/dev/null 2>&1; then
  echo "  Installing @anthropic-ai/claude-code…"
  npm install -g @anthropic-ai/claude-code
  export PATH="$(npm prefix -g)/bin:${PATH}"
fi
claude --version
echo "✓ Claude Code CLI ready"

echo "→ Downloading Promptly plugin pack…"
curl -fsSL -o "${HOME}/promptly.zip" "${PLUGIN_PACK_URL}"
unzip -oq "${HOME}/promptly.zip" -d "${HOME}"

if [[ ! -f "${INTEGRATIONS}/.claude-plugin/marketplace.json" ]]; then
  echo "✗ Plugin pack failed — retry download"
  exit 1
fi
echo "✓ Plugin pack OK"

echo ""
echo "✓ Promptly plugin pack ready for Claude Code"
echo "  Next on the website: step 2 — paste the plugin commands into Claude Code."
echo "  Marketplace path: ${INTEGRATIONS}"
