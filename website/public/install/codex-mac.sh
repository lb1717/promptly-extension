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

echo "→ Checking Codex CLI…"
if ! command -v codex >/dev/null 2>&1; then
  echo "  Installing @openai/codex…"
  npm install -g @openai/codex
  export PATH="$(npm prefix -g)/bin:${PATH}"
fi
codex --version
echo "✓ Codex CLI ready"

echo "→ Downloading Promptly plugin pack…"
curl -fsSL -o "${HOME}/promptly.zip" "${PLUGIN_PACK_URL}"
unzip -oq "${HOME}/promptly.zip" -d "${HOME}"

if [[ ! -f "${INTEGRATIONS}/.claude-plugin/marketplace.json" ]]; then
  echo "✗ Plugin pack failed — retry download"
  exit 1
fi
echo "✓ Plugin pack OK"

echo "→ Installing Promptly in Codex…"
export PATH="$(npm prefix -g)/bin:${PATH}"
codex plugin marketplace add "${INTEGRATIONS}"
codex plugin add promptly-codex@promptly-labs 2>/dev/null || codex plugin install promptly-codex@promptly-labs

if ! codex plugin list 2>/dev/null | grep -q promptly-codex; then
  echo "✗ Promptly plugin not found in codex plugin list — retry this step"
  exit 1
fi

echo ""
echo "✓ Promptly installed for Codex"
echo "  Next: connect your account on promptly-labs.com/integrations (step 2)."
