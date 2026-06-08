#!/usr/bin/env bash
set -euo pipefail

PLUGIN_PACK_URL="${PROMPTLY_PLUGIN_PACK_URL:-https://promptly-labs.com/downloads/promptly-coding-agents.zip}"
INTEGRATIONS="${HOME}/integrations"
PROMPTLY_INSTALL_BASE="${PROMPTLY_INSTALL_BASE:-https://promptly-labs.com/install}"

# Inline fallback — works even if _install-common-mac.sh is missing or stale on CDN.
promptly_write_codex_command_file() {
  local plugin_dir="${1:-${HOME}/integrations/codex}"
  mkdir -p "${plugin_dir}/commands"
  cat >"${plugin_dir}/commands/promptly.md" <<'EOF'
---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "${PLUGIN_ROOT}/bin/promptly-improve.mjs" --tool codex "$ARGUMENTS"`
EOF
}

if ! command -v curl >/dev/null 2>&1; then
  echo "✗ curl is required. On Mac run: xcode-select --install"
  exit 1
fi
eval "$(curl -fsSL "${PROMPTLY_INSTALL_BASE}/_ensure-node-mac.sh")"
eval "$(curl -fsSL "${PROMPTLY_INSTALL_BASE}/_install-common-mac.sh" 2>/dev/null)" || true
ensure_unzip_mac
ensure_node_mac

export PATH="$(npm prefix -g)/bin:${PATH}"

echo "→ Checking Codex CLI…"
if ! command -v codex >/dev/null 2>&1; then
  echo "  Installing @openai/codex…"
  npm install -g @openai/codex
  export PATH="$(npm prefix -g)/bin:${PATH}"
fi
codex --version
echo "✓ Codex CLI ready"

echo "→ Downloading Promptly plugin pack…"
curl -fsSL -o "${HOME}/promptly.zip" "${PLUGIN_PACK_URL}"
if declare -f promptly_unzip_plugin_pack >/dev/null 2>&1; then
  promptly_unzip_plugin_pack "${HOME}/promptly.zip" "${HOME}"
else
  unzip -oq -o "${HOME}/promptly.zip" -d "${HOME}"
fi

if [[ ! -f "${INTEGRATIONS}/.claude-plugin/marketplace.json" ]]; then
  echo "✗ Plugin pack failed — retry download"
  exit 1
fi
echo "✓ Plugin pack OK"

echo "→ Installing Promptly in Codex…"
export PATH="$(npm prefix -g)/bin:${PATH}"
if declare -f promptly_codex_marketplace_add >/dev/null 2>&1; then
  promptly_codex_marketplace_add "${INTEGRATIONS}"
  promptly_codex_plugin_reinstall
else
  set +e
  codex plugin marketplace add "${INTEGRATIONS}" 2>/dev/null
  if codex plugin list 2>/dev/null | grep -q 'promptly-codex'; then
    codex plugin remove promptly-codex@promptly-labs 2>/dev/null \
      || codex plugin remove promptly-codex --marketplace promptly-labs 2>/dev/null
  fi
  set -e
  codex plugin add promptly-codex@promptly-labs 2>/dev/null \
    || codex plugin install promptly-codex@promptly-labs
fi

if ! codex plugin list 2>/dev/null | grep -q promptly-codex; then
  echo "✗ Promptly plugin not found in codex plugin list — retry this step"
  exit 1
fi

CODEX_PLUGIN="${INTEGRATIONS}/codex"

# Always write slash command first — do not fail install if improve CLI copy fails.
if declare -f promptly_sync_codex_command_files >/dev/null 2>&1; then
  promptly_sync_codex_command_files "${CODEX_PLUGIN}"
else
  promptly_write_codex_command_file "${CODEX_PLUGIN}"
  echo "→ Synced slash command files"
fi

if declare -f promptly_sync_improve_cli >/dev/null 2>&1; then
  set +e
  promptly_sync_improve_cli "${CODEX_PLUGIN}"
  set -e
elif [[ -f "${HOME}/integrations/packages/promptly-improve/bin/promptly-improve.mjs" ]]; then
  mkdir -p "${CODEX_PLUGIN}/bin"
  cp "${HOME}/integrations/packages/promptly-improve/bin/promptly-improve.mjs" \
    "${CODEX_PLUGIN}/bin/promptly-improve.mjs" 2>/dev/null || true
fi

echo "→ Verifying Codex plugin configuration…"
if ! grep -q 'hook --tool codex' "${CODEX_PLUGIN}/hooks/hooks.json" 2>/dev/null; then
  echo "✗ Hooks are not configured for Codex (expected --tool codex)"
  exit 1
fi
if ! grep -q '"PROMPTLY_TOOL": "codex"' "${CODEX_PLUGIN}/.mcp.json" 2>/dev/null; then
  echo "✗ MCP server is not configured for Codex"
  exit 1
fi
if [[ ! -f "${CODEX_PLUGIN}/commands/promptly.md" ]]; then
  promptly_write_codex_command_file "${CODEX_PLUGIN}"
fi
if [[ ! -f "${CODEX_PLUGIN}/commands/promptly.md" ]]; then
  echo "✗ Missing /promptly slash command file"
  exit 1
fi
echo "✓ Hooks and MCP verified for Codex"

echo ""
echo "✓ Promptly installed for Codex"
echo "  Improve prompts with: /promptly-codex:promptly your draft here"
echo "  You can also install Claude Code and Cursor on this Mac — each needs its own install + pairing from promptly-labs.com/integrations."
echo "  If you used the one-command setup, account connect runs next automatically."
echo "  Otherwise finish step 1 on promptly-labs.com/integrations, then trust hooks (step 2)."
