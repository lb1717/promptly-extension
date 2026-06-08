# Promptly install helpers — source via: eval "$(curl -fsSL .../_install-common-mac.sh)"

promptly_unzip_plugin_pack() {
  local zip_path="${1:-${HOME}/promptly.zip}"
  local dest="${2:-${HOME}}"
  unzip -oq -o "${zip_path}" -d "${dest}"
}

promptly_sync_improve_cli() {
  local plugin_dir="$1"
  local src="${HOME}/integrations/packages/promptly-improve/bin/promptly-improve.mjs"
  if [[ -f "${src}" ]]; then
    mkdir -p "${plugin_dir}/bin"
    cp "${src}" "${plugin_dir}/bin/promptly-improve.mjs"
    return 0
  fi
  if [[ -f "${plugin_dir}/bin/promptly-improve.mjs" ]]; then
    return 0
  fi
  echo "✗ Missing promptly-improve.mjs — re-download the plugin pack"
  return 1
}

promptly_sync_telemetry_cli() {
  local plugin_dir="$1"
  local src="${HOME}/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  if [[ -f "${src}" ]]; then
    mkdir -p "${plugin_dir}/bin"
    cp "${src}" "${plugin_dir}/bin/promptly-telemetry.mjs"
    return 0
  fi
  if [[ -f "${plugin_dir}/bin/promptly-telemetry.mjs" ]]; then
    return 0
  fi
  echo "✗ Missing promptly-telemetry.mjs — re-download the plugin pack"
  return 1
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
  claude plugin marketplace update promptly-labs >/dev/null 2>&1
  set -e
  echo "✓ Marketplace refreshed"
}

promptly_claude_plugin_reinstall() {
  set +e
  if claude plugin list 2>/dev/null | grep -q 'promptly-claude-code'; then
    echo "→ Removing previous Promptly Claude Code plugin…"
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
    echo "→ Removing previous Promptly Codex plugin…"
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
  mkdir -p "${HOME}/.claude/commands"
  cp "${plugin_dir}/user-commands/promptly.md" "${HOME}/.claude/commands/promptly.md"
  echo "→ Installed /promptly for Claude Code (~/.claude/commands/promptly.md)"
}

promptly_sync_cursor_command_files() {
  local plugin_dir="${1:-${HOME}/integrations/cursor}"
  mkdir -p "${plugin_dir}/commands" "${plugin_dir}/user-commands"
  cat >"${plugin_dir}/user-commands/promptly.md" <<'EOF'
---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
---

Run Promptly improve and reply with **only** the improved prompt (no preamble):

```bash
node "$HOME/integrations/cursor/bin/promptly-improve.mjs" --tool cursor "$ARGUMENTS"
```

Draft:

$ARGUMENTS
EOF
  cp "${plugin_dir}/user-commands/promptly.md" "${plugin_dir}/commands/promptly.md"
  mkdir -p "${HOME}/.cursor/commands"
  cp "${plugin_dir}/user-commands/promptly.md" "${HOME}/.cursor/commands/promptly.md"
  echo "→ Installed /promptly for Cursor (~/.cursor/commands/promptly.md)"
}

promptly_install_codex_skill() {
  local plugin_dir="${1:-${HOME}/integrations/codex}"
  local skill_src="${plugin_dir}/skill/SKILL.md"
  local skill_dest="${HOME}/.codex/skills/promptly/SKILL.md"
  if [[ ! -f "${skill_src}" ]]; then
    echo "✗ Missing Codex skill file — re-download the plugin pack"
    return 1
  fi
  mkdir -p "${HOME}/.codex/skills/promptly"
  cp "${skill_src}" "${skill_dest}"
  echo "→ Installed /promptly for Codex (~/.codex/skills/promptly/SKILL.md)"
}

promptly_cursor_plugin_reinstall() {
  local integrations="${1:-${HOME}/integrations}"
  local dest="${HOME}/.cursor/plugins/local/promptly-cursor"
  echo "→ Removing previous Promptly Cursor plugin…"
  rm -rf "${dest}"
  mkdir -p "${HOME}/.cursor/plugins/local"
  cp -R "${integrations}/cursor" "${dest}"
}
