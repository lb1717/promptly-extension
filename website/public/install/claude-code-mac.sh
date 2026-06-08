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

echo "→ Installing Promptly in Claude Code…"
export PATH="$(npm prefix -g)/bin:${PATH}"
promptly_claude_marketplace_refresh "${INTEGRATIONS}"
promptly_claude_plugin_reinstall

if ! claude plugin list 2>/dev/null | grep -q promptly-claude-code; then
  echo "✗ Promptly plugin not found in claude plugin list — retry this step"
  exit 1
fi

CLAUDE_PLUGIN="${INTEGRATIONS}/claude-code"
promptly_sync_improve_cli "${CLAUDE_PLUGIN}"
promptly_sync_claude_code_command_files "${CLAUDE_PLUGIN}"
echo "→ Verifying Claude Code plugin configuration…"
if ! grep -q 'hook --tool claude_code' "${CLAUDE_PLUGIN}/hooks/hooks.json" 2>/dev/null; then
  echo "✗ Hooks are not configured for Claude Code (expected --tool claude_code)"
  exit 1
fi
if ! grep -q '"PROMPTLY_TOOL": "claude_code"' "${CLAUDE_PLUGIN}/.mcp.json" 2>/dev/null; then
  echo "✗ MCP server is not configured for Claude Code"
  exit 1
fi
if [[ ! -f "${CLAUDE_PLUGIN}/commands/promptly.md" ]]; then
  echo "✗ Missing /promptly slash command file"
  exit 1
fi
echo "✓ Hooks and MCP verified for Claude Code"

echo "→ Installing /promptly slash command…"
mkdir -p "${HOME}/.claude/commands"
cp "${CLAUDE_PLUGIN}/user-commands/promptly.md" "${HOME}/.claude/commands/promptly.md"
echo "✓ Type /promptly in Claude Code (then /reload-plugins if it does not appear)"

echo ""
echo "✓ Promptly installed for Claude Code"
echo "  Run /reload-plugins in Claude Code, then type /promptly your draft"
echo "  You can also install Cursor and Codex on this Mac — each needs its own install + pairing from promptly-labs.com/integrations."
echo "  If you used the one-command setup, account connect runs next automatically."
echo "  Otherwise finish step 1 on promptly-labs.com/integrations, then trust hooks (step 2)."
