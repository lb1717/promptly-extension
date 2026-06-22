#!/usr/bin/env bash
# One command: coding agents + stats tracking + Promptly desktop app (Mac).
# Usage: curl -fsSL https://promptly-labs.com/install/full-setup-mac.sh | bash -s -- YOUR_CODE
set -euo pipefail

export PROMPTLY_QUIET=1
PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.12}"
INTEGRATIONS="${HOME}/integrations"
PROMPTLY_INSTALL_BASE="${PROMPTLY_INSTALL_BASE:-https://promptly-labs.com/install}"
CODE="${1:-${PROMPTLY_PAIR_CODE:-}}"

if [[ -z "${CODE}" ]]; then
  echo "Usage: curl -fsSL ${PROMPTLY_INSTALL_BASE}/full-setup-mac.sh | bash -s -- YOUR_CODE"
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

CODE="$(promptly_validate_pair_code "${CODE}")" || exit 1

ensure_unzip_mac
ensure_node_mac
promptly_require_cmd node || exit 1

promptly_detail "→ Downloading Promptly plugin pack (Claude Code, Cursor, Codex)…"
pack_ok=0
for attempt in 1 2; do
  if curl -fsSL -o "${HOME}/promptly.zip" "${PLUGIN_PACK_URL}"; then
    pack_ok=1
    break
  fi
  sleep 1
done
if [[ $pack_ok -ne 1 ]]; then
  echo "✗ Could not download plugin pack — check your network and retry."
  exit 1
fi

promptly_unzip_plugin_pack "${HOME}/promptly.zip" "${HOME}"
promptly_verify_plugin_pack "${INTEGRATIONS}" || exit 1
promptly_pull_latest_telemetry_cli "${INTEGRATIONS}" || promptly_refresh_telemetry_cli "${INTEGRATIONS}" || true

promptly_install_all_agents "${INTEGRATIONS}" || exit 1
promptly_finalize_with_pair_code "${CODE}" "${INTEGRATIONS}" || exit 1
promptly_install_companion_mac || exit 1

promptly_print_install_success
