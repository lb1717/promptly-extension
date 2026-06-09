#!/usr/bin/env bash
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.3}"
INTEGRATIONS="${HOME}/integrations"
CURSOR_PLUGIN="${HOME}/.cursor/plugins/local/promptly-cursor"
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

echo "→ Downloading Promptly plugin pack…"
curl -fsSL -o "${HOME}/promptly.zip" "${PLUGIN_PACK_URL}"
promptly_unzip_plugin_pack "${HOME}/promptly.zip" "${HOME}"

if [[ ! -f "${INTEGRATIONS}/.claude-plugin/marketplace.json" ]]; then
  echo "✗ Plugin pack failed — retry download"
  exit 1
fi
promptly_prepare_plugin_pack "${INTEGRATIONS}"
echo "✓ Plugin pack OK"

SOURCE_CURSOR="${INTEGRATIONS}/cursor"
promptly_sync_telemetry_cli "${SOURCE_CURSOR}"
set +e
promptly_sync_improve_cli "${SOURCE_CURSOR}"
set -e
promptly_cursor_plugin_reinstall "${INTEGRATIONS}"
promptly_sync_cursor_command_files "${SOURCE_CURSOR}"

echo "→ Verifying Cursor plugin configuration…"
if ! grep -q 'afterAgentResponse' "${CURSOR_PLUGIN}/hooks/hooks.json" 2>/dev/null; then
  echo "✗ Cursor hooks missing afterAgentResponse (re-download plugin pack)"
  exit 1
fi
if ! grep -q 'hook --tool cursor' "${CURSOR_PLUGIN}/hooks/hooks.json" 2>/dev/null; then
  echo "✗ Hooks are not configured for Cursor (expected --tool cursor)"
  exit 1
fi
if ! grep -q '"PROMPTLY_TOOL": "cursor"' "${CURSOR_PLUGIN}/mcp.json" 2>/dev/null; then
  echo "✗ MCP server is not configured for Cursor"
  exit 1
fi
if [[ ! -f "${HOME}/.cursor/commands/promptly.md" ]]; then
  echo "✗ Missing /promptly command (~/.cursor/commands/promptly.md)"
  exit 1
fi
echo "✓ Hooks, MCP, and /promptly verified for Cursor"

echo ""
echo "✓ Promptly installed for Cursor"
echo "  Reload Cursor window, allow hooks if asked, then type: /promptly your draft here"
