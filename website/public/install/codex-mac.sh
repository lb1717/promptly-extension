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
eval "$(curl -fsSL "${PROMPTLY_INSTALL_BASE}/_install-common-mac.sh")"
if ! declare -f promptly_unzip_plugin_pack >/dev/null 2>&1; then
  echo "✗ Failed to load install helpers from ${PROMPTLY_INSTALL_BASE}/_install-common-mac.sh"
  exit 1
fi
ensure_unzip_mac
ensure_node_mac

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
promptly_unzip_plugin_pack "${HOME}/promptly.zip" "${HOME}"

if [[ ! -f "${INTEGRATIONS}/.claude-plugin/marketplace.json" ]]; then
  echo "✗ Plugin pack failed — retry download"
  exit 1
fi
echo "✓ Plugin pack OK"

CODEX_PLUGIN="${INTEGRATIONS}/codex"
promptly_sync_telemetry_cli "${CODEX_PLUGIN}"
set +e
promptly_sync_improve_cli "${CODEX_PLUGIN}"
set -e
promptly_install_codex_skill "${CODEX_PLUGIN}"

echo "→ Installing Promptly in Codex…"
promptly_codex_marketplace_add "${INTEGRATIONS}"
promptly_codex_plugin_reinstall

if ! codex plugin list 2>/dev/null | grep -q promptly-codex; then
  echo "✗ Promptly plugin not found in codex plugin list — retry this step"
  exit 1
fi

echo "→ Verifying Codex plugin configuration…"
if ! grep -q 'UserPromptSubmit' "${CODEX_PLUGIN}/hooks/hooks.json" 2>/dev/null; then
  echo "✗ Codex hooks missing UserPromptSubmit (re-download plugin pack)"
  exit 1
fi
if ! grep -q 'hook --tool codex' "${CODEX_PLUGIN}/hooks/hooks.json" 2>/dev/null; then
  echo "✗ Hooks are not configured for Codex (expected --tool codex)"
  exit 1
fi
if ! grep -q '"PROMPTLY_TOOL": "codex"' "${CODEX_PLUGIN}/.mcp.json" 2>/dev/null; then
  echo "✗ MCP server is not configured for Codex"
  exit 1
fi
if [[ ! -f "${HOME}/.codex/skills/promptly/SKILL.md" ]]; then
  echo "✗ Missing /promptly skill (~/.codex/skills/promptly/SKILL.md)"
  exit 1
fi
echo "✓ Hooks, MCP, and /promptly verified for Codex"

echo ""
echo "✓ Promptly installed for Codex"
echo "  Quit and reopen Codex, trust this project folder, enable Promptly hooks (/hooks), then send a prompt"
