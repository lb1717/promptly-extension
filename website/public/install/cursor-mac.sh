#!/usr/bin/env bash
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip}"
INTEGRATIONS="${HOME}/integrations"
CURSOR_PLUGIN="${HOME}/.cursor/plugins/local/promptly-cursor"
PROMPTLY_INSTALL_BASE="${PROMPTLY_INSTALL_BASE:-https://promptly-labs.com/install}"

if ! command -v curl >/dev/null 2>&1; then
  echo "✗ curl is required. On Mac run: xcode-select --install"
  exit 1
fi
eval "$(curl -fsSL "${PROMPTLY_INSTALL_BASE}/_ensure-node-mac.sh")"
ensure_unzip_mac
ensure_node_mac

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

echo "→ Verifying Cursor plugin configuration…"
if ! grep -q 'hook --tool cursor' "${CURSOR_PLUGIN}/hooks/hooks.json" 2>/dev/null; then
  echo "✗ Hooks are not configured for Cursor (expected --tool cursor)"
  exit 1
fi
if ! grep -q '"PROMPTLY_TOOL": "cursor"' "${CURSOR_PLUGIN}/mcp.json" 2>/dev/null; then
  echo "✗ MCP server is not configured for Cursor"
  exit 1
fi
echo "✓ Hooks and MCP verified for Cursor"

echo ""
echo "✓ Promptly installed for Cursor"
echo "  You can also install Claude Code and Codex on this Mac — each needs its own install + pairing from promptly-labs.com/integrations."
echo "  If you used the one-command setup, account connect runs next automatically."
echo "  Otherwise finish step 1 on promptly-labs.com/integrations, then trust hooks (step 2)."
