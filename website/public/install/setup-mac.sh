#!/usr/bin/env bash
# One command: install Promptly for Claude Code + Cursor + Codex, pair to your account, merge stats, verify live tracking.
# Usage: curl -fsSL https://promptly-labs.com/install/setup-mac.sh | bash -s -- YOUR_CODE
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.9}"
INTEGRATIONS="${HOME}/integrations"
PROMPTLY_INSTALL_BASE="${PROMPTLY_INSTALL_BASE:-https://promptly-labs.com/install}"
CODE="${1:-${PROMPTLY_PAIR_CODE:-}}"

if [[ -z "${CODE}" ]]; then
  echo "Usage: curl -fsSL ${PROMPTLY_INSTALL_BASE}/setup-mac.sh | bash -s -- YOUR_CODE"
  echo ""
  echo "Get YOUR_CODE at https://promptly-labs.com/integrations while signed into the Promptly account you want."
  exit 1
fi

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

echo "→ Downloading Promptly plugin pack (Claude Code, Cursor, Codex)…"
curl -fsSL -o "${HOME}/promptly.zip" "${PLUGIN_PACK_URL}"
promptly_unzip_plugin_pack "${HOME}/promptly.zip" "${HOME}"
promptly_verify_plugin_pack "${INTEGRATIONS}" || exit 1

promptly_install_all_agents "${INTEGRATIONS}" || exit 1
promptly_finalize_with_pair_code "${CODE}" "${INTEGRATIONS}"
