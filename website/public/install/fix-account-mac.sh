#!/usr/bin/env bash
# Reset Promptly on this Mac: one pairing code → only account, merged stats, live tracking.
# Usage: curl -fsSL https://promptly-labs.com/install/fix-account-mac.sh | bash -s -- YOUR_CODE
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.7}"
PROMPTLY_INSTALL_BASE="${PROMPTLY_INSTALL_BASE:-https://promptly-labs.com/install}"
CODE="${1:-${PROMPTLY_PAIR_CODE:-}}"

if [[ -z "${CODE}" ]]; then
  echo "Usage: curl -fsSL ${PROMPTLY_INSTALL_BASE}/fix-account-mac.sh | bash -s -- YOUR_CODE"
  echo ""
  echo "Get YOUR_CODE at https://promptly-labs.com/integrations while signed into the Promptly account you want."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "✗ curl is required."
  exit 1
fi

eval "$(curl -fsSL "${PROMPTLY_INSTALL_BASE}/_ensure-node-mac.sh")"
eval "$(curl -fsSL "${PROMPTLY_INSTALL_BASE}/_install-common-mac.sh")"
ensure_unzip_mac

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "→ Downloading latest Promptly plugin pack…"
curl -fsSL -o "${TMP_DIR}/promptly.zip" "${PLUGIN_PACK_URL}"
promptly_unzip_plugin_pack "${TMP_DIR}/promptly.zip" "${HOME}"

CLI_DEST="${HOME}/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
if [[ ! -f "${CLI_DEST}" ]]; then
  echo "✗ Could not install telemetry CLI from plugin pack."
  exit 1
fi

echo "→ Fixing Promptly account (pair all agents + merge stats + verify live uploads)…"
node "${CLI_DEST}" fix-account "${CODE}"

echo "→ Syncing hooks + telemetry into Claude Code, Cursor, and Codex runtimes…"
promptly_sync_all_agent_runtimes "${HOME}/integrations"

echo ""
echo "✓ All set. Restart Claude Code, Cursor, and Codex if they were open, then send a test prompt."
echo "  Stats go to the email shown above on https://promptly-labs.com/account/statistics"
