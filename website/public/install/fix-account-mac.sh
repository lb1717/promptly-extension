#!/usr/bin/env bash
# Reset Promptly on this Mac: one pairing code → only account, merged stats, live tracking.
# Usage: curl -fsSL https://promptly-labs.com/install/fix-account-mac.sh | bash -s -- YOUR_CODE
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.16}"
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
ensure_node_mac

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "→ Downloading latest Promptly plugin pack…"
curl -fsSL -o "${TMP_DIR}/promptly.zip" "${PLUGIN_PACK_URL}"
promptly_unzip_plugin_pack "${TMP_DIR}/promptly.zip" "${HOME}"

promptly_finalize_with_pair_code "${CODE}" "${HOME}/integrations"
