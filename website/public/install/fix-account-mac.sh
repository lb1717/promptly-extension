#!/usr/bin/env bash
# Reset Promptly on this Mac: one pairing code → only account, all agents, merged stats.
# Usage: curl -fsSL https://promptly-labs.com/install/fix-account-mac.sh | bash -s -- YOUR_CODE
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.6}"
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

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "→ Downloading latest Promptly telemetry CLI…"
curl -fsSL -o "${TMP_DIR}/promptly.zip" "${PLUGIN_PACK_URL}"
unzip -oq "${TMP_DIR}/promptly.zip" "integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs" -d "${TMP_DIR}/extract"

CLI_SRC="${TMP_DIR}/extract/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
if [[ ! -f "${CLI_SRC}" ]]; then
  echo "✗ Could not extract telemetry CLI from plugin pack."
  exit 1
fi

CLI_DEST="${HOME}/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
mkdir -p "$(dirname "${CLI_DEST}")"
cp "${CLI_SRC}" "${CLI_DEST}"

for agent_bin in \
  "${HOME}/integrations/claude-code/bin/promptly-telemetry.mjs" \
  "${HOME}/integrations/cursor/bin/promptly-telemetry.mjs" \
  "${HOME}/integrations/codex/bin/promptly-telemetry.mjs"; do
  if [[ -d "$(dirname "${agent_bin}")" ]]; then
    cp "${CLI_SRC}" "${agent_bin}"
  fi
done

echo "→ Fixing Promptly account on this computer…"
node "${CLI_DEST}" fix-account "${CODE}"
