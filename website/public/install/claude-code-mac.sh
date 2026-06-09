#!/usr/bin/env bash
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.5}"
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
promptly_unzip_plugin_pack "${HOME}/promptly.zip" "${HOME}"

if [[ ! -f "${INTEGRATIONS}/.claude-plugin/marketplace.json" ]]; then
  echo "✗ Plugin pack failed — retry download"
  exit 1
fi
echo "✓ Plugin pack OK"

CLAUDE_PLUGIN="${INTEGRATIONS}/claude-code"
promptly_sync_telemetry_cli "${CLAUDE_PLUGIN}"
set +e
promptly_sync_improve_cli "${CLAUDE_PLUGIN}"
set -e
promptly_sync_claude_code_command_files "${CLAUDE_PLUGIN}"

echo "→ Installing Promptly in Claude Code…"
promptly_claude_marketplace_refresh "${INTEGRATIONS}"
promptly_claude_plugin_reinstall
promptly_sync_claude_plugin_cache

if ! claude plugin list 2>/dev/null | grep -q promptly-claude-code; then
  echo "✗ Promptly plugin not found in claude plugin list — retry this step"
  exit 1
fi

echo "→ Verifying Claude Code plugin configuration…"
if ! grep -q 'hook --tool claude_code' "${CLAUDE_PLUGIN}/hooks/hooks.json" 2>/dev/null; then
  echo "✗ Hooks are not configured for Claude Code (expected --tool claude_code)"
  exit 1
fi
if ! grep -q '"PROMPTLY_TOOL": "claude_code"' "${CLAUDE_PLUGIN}/.mcp.json" 2>/dev/null; then
  echo "✗ MCP server is not configured for Claude Code"
  exit 1
fi
if [[ ! -f "${HOME}/.claude/commands/promptly.md" ]]; then
  echo "✗ Missing /promptly command (~/.claude/commands/promptly.md)"
  exit 1
fi
echo "✓ Hooks, MCP, and /promptly verified for Claude Code"

echo ""
echo "✓ Promptly installed for Claude Code"
echo "  Run /reload-plugins once, then type: /promptly your draft here"
echo "  Re-pair only if you have not connected this agent yet (integrations page)."
