#!/usr/bin/env bash
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.7}"
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

echo "→ Downloading Promptly plugin pack (Claude Code, Cursor, Codex)…"
curl -fsSL -o "${HOME}/promptly.zip" "${PLUGIN_PACK_URL}"
promptly_unzip_plugin_pack "${HOME}/promptly.zip" "${HOME}"
promptly_verify_plugin_pack "${INTEGRATIONS}" || exit 1

INSTALLED=()
SKIPPED=()
FAILED=()

run_agent_install() {
  local label="$1"
  shift
  set +e
  "$@"
  local code=$?
  set -e
  if [[ $code -eq 0 ]]; then
    INSTALLED+=("${label}")
  elif [[ $code -eq 2 ]]; then
    SKIPPED+=("${label}")
  else
    FAILED+=("${label}")
  fi
}

run_agent_install "Cursor" promptly_install_for_cursor "${INTEGRATIONS}"
run_agent_install "Claude Code" promptly_install_for_claude_code "${INTEGRATIONS}"
run_agent_install "Codex" promptly_install_for_codex "${INTEGRATIONS}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Promptly all-agents install summary"
if ((${#INSTALLED[@]})); then
  echo "  ✓ Installed: ${INSTALLED[*]}"
fi
if ((${#SKIPPED[@]})); then
  echo "  ⚠ Skipped (CLI not available): ${SKIPPED[*]}"
fi
if ((${#FAILED[@]})); then
  echo "  ✗ Failed: ${FAILED[*]}"
fi
echo ""
echo "Next: get ONE pairing code on the integrations page, then:"
echo "  promptly-telemetry login --tool claude_code YOUR_CODE"
echo "  promptly-telemetry login --tool cursor --from-sibling"
echo "  promptly-telemetry login --tool codex --from-sibling"
echo "  node ${INTEGRATIONS}/packages/telemetry-cli/bin/promptly-telemetry.mjs status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ((${#INSTALLED[@]} == 0)); then
  exit 1
fi
