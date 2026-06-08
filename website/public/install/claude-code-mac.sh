#!/usr/bin/env bash
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip}"
INTEGRATIONS="${HOME}/integrations"
PROMPTLY_INSTALL_BASE="${PROMPTLY_INSTALL_BASE:-https://promptly-labs.com/install}"

if ! command -v curl >/dev/null 2>&1; then
  echo "✗ curl is required. On Mac run: xcode-select --install"
  exit 1
fi
eval "$(curl -fsSL "${PROMPTLY_INSTALL_BASE}/_ensure-node-mac.sh")"
ensure_unzip_mac
ensure_node_mac

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

echo "→ Installing Promptly in Claude Code…"
export PATH="$(npm prefix -g)/bin:${PATH}"
claude plugin marketplace add "${INTEGRATIONS}"
claude plugin install promptly-claude-code@promptly-labs

if ! claude plugin list 2>/dev/null | grep -q promptly-claude-code; then
  echo "✗ Promptly plugin not found in claude plugin list — retry this step"
  exit 1
fi

echo ""
echo "✓ Promptly installed for Claude Code"
echo "  You can also install Cursor and Codex on this Mac — each needs its own install + pairing from promptly-labs.com/integrations."
echo "  If you used the one-command setup, account connect runs next automatically."
echo "  Otherwise finish step 1 on promptly-labs.com/integrations, then trust hooks (step 2)."
