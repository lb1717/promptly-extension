# Promptly install helpers — source via: eval "$(curl -fsSL .../_install-common-mac.sh)"

promptly_unzip_plugin_pack() {
  local zip_path="${1:-${HOME}/promptly.zip}"
  local dest="${2:-${HOME}}"
  unzip -oq -o "${zip_path}" -d "${dest}"
}

promptly_claude_marketplace_add() {
  local integrations_path="${1:-${HOME}/integrations}"
  set +e
  local out
  out="$(claude plugin marketplace add "${integrations_path}" 2>&1)"
  local code=$?
  set -e
  if [[ $code -eq 0 ]]; then
    echo "✓ Marketplace added"
    return 0
  fi
  if echo "${out}" | grep -qiE 'already installed|already exists'; then
    echo "✓ Marketplace promptly-labs already installed (refreshing from ~/integrations)"
    return 0
  fi
  echo "✗ Failed to add marketplace: ${out}"
  return 1
}

promptly_claude_marketplace_refresh() {
  promptly_claude_marketplace_add "${1:-${HOME}/integrations}" || return 1
  set +e
  local out
  out="$(claude plugin marketplace update promptly-labs 2>&1)"
  local code=$?
  set -e
  if [[ $code -eq 0 ]]; then
    echo "✓ Marketplace refreshed"
    return 0
  fi
  echo "→ Marketplace update skipped (${out})"
  return 0
}

promptly_claude_plugin_reinstall() {
  set +e
  if claude plugin list 2>/dev/null | grep -q 'promptly-claude-code'; then
    echo "→ Removing previous Promptly plugin…"
    claude plugin uninstall promptly-claude-code@promptly-labs 2>/dev/null
  fi
  set -e
  echo "→ Installing fresh Promptly plugin…"
  claude plugin install promptly-claude-code@promptly-labs
}

promptly_codex_marketplace_add() {
  local integrations_path="${1:-${HOME}/integrations}"
  set +e
  local out
  out="$(codex plugin marketplace add "${integrations_path}" 2>&1)"
  local code=$?
  set -e
  if [[ $code -eq 0 ]]; then
    echo "✓ Marketplace added"
    return 0
  fi
  if echo "${out}" | grep -qiE 'already installed|already exists'; then
    echo "✓ Marketplace promptly-labs already installed (using updated files from ~/integrations)"
    return 0
  fi
  echo "✗ Failed to add marketplace: ${out}"
  return 1
}

promptly_codex_plugin_reinstall() {
  set +e
  if codex plugin list 2>/dev/null | grep -q 'promptly-codex'; then
    echo "→ Removing previous Promptly plugin…"
    codex plugin remove promptly-codex@promptly-labs 2>/dev/null \
      || codex plugin remove promptly-codex --marketplace promptly-labs 2>/dev/null
  fi
  set -e
  echo "→ Installing fresh Promptly plugin…"
  codex plugin add promptly-codex@promptly-labs 2>/dev/null \
    || codex plugin install promptly-codex@promptly-labs
}

promptly_sync_claude_code_command_files() {
  local plugin_dir="${1:-${HOME}/integrations/claude-code}"
  mkdir -p "${plugin_dir}/commands" "${plugin_dir}/user-commands"
  cat >"${plugin_dir}/commands/promptly.md" <<'EOF'
---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`
EOF
  cat >"${plugin_dir}/user-commands/promptly.md" <<'EOF'
---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "$HOME/integrations/claude-code/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`
EOF
  echo "→ Synced slash command files"
}

promptly_sync_codex_command_files() {
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
  echo "→ Synced slash command files"
}

promptly_sync_improve_cli() {
  local plugin_dir="$1"
  if [[ -f "${HOME}/integrations/packages/promptly-improve/bin/promptly-improve.mjs" ]]; then
    mkdir -p "${plugin_dir}/bin"
    cp "${HOME}/integrations/packages/promptly-improve/bin/promptly-improve.mjs" "${plugin_dir}/bin/promptly-improve.mjs"
    return 0
  fi
  if [[ -f "${plugin_dir}/bin/promptly-improve.mjs" ]]; then
    return 0
  fi
  echo "✗ Missing promptly-improve.mjs — re-download the plugin pack"
  return 1
}
