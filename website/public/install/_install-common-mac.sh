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
description: Improve a draft with Promptly and run it immediately
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`

The block above is my improved task. Start working on it now — do not ask me to confirm or restate it.
EOF
  cat >"${plugin_dir}/user-commands/promptly.md" <<'EOF'
---
description: Improve a draft with Promptly and run it immediately
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "$HOME/integrations/claude-code/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`

The block above is my improved task. Start working on it now — do not ask me to confirm or restate it.
EOF
  mkdir -p "${HOME}/.claude/commands" "${HOME}/.claude/skills/promptly"
  cp "${plugin_dir}/user-commands/promptly.md" "${HOME}/.claude/commands/promptly.md"
  if [[ -f "${plugin_dir}/skill/SKILL.md" ]]; then
    cp "${plugin_dir}/skill/SKILL.md" "${HOME}/.claude/skills/promptly/SKILL.md"
  fi
  echo "→ Installed /promptly for Claude Code (~/.claude/commands + skills/promptly)"
}

promptly_sync_cursor_command_files() {
  local plugin_dir="${1:-${HOME}/integrations/cursor}"
  mkdir -p "${plugin_dir}/commands" "${plugin_dir}/user-commands"
  cat >"${plugin_dir}/user-commands/promptly.md" <<'EOF'
---
description: Improve a draft with Promptly and run it immediately
argument-hint: [your draft prompt]
---

Improve the draft below with Promptly, then **execute the improved version as my task** (do not only echo it back):

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

promptly_ensure_claude_cli() {
  export PATH="$(npm prefix -g)/bin:${PATH}"
  if command -v claude >/dev/null 2>&1; then
    claude --version
    return 0
  fi
  echo "→ Claude Code CLI not found; installing @anthropic-ai/claude-code…"
  if ! npm install -g @anthropic-ai/claude-code; then
    echo "⚠ Could not install Claude Code CLI — skip Claude Code or install it manually"
    return 1
  fi
  export PATH="$(npm prefix -g)/bin:${PATH}"
  if ! command -v claude >/dev/null 2>&1; then
    echo "⚠ Claude Code CLI still not on PATH after install"
    return 1
  fi
  claude --version
  return 0
}

promptly_ensure_codex_cli() {
  export PATH="$(npm prefix -g)/bin:${PATH}"
  if command -v codex >/dev/null 2>&1; then
    codex --version
    return 0
  fi
  echo "→ Codex CLI not found; installing @openai/codex…"
  if ! npm install -g @openai/codex; then
    echo "⚠ Could not install Codex CLI — skip Codex or install it manually"
    return 1
  fi
  export PATH="$(npm prefix -g)/bin:${PATH}"
  if ! command -v codex >/dev/null 2>&1; then
    echo "⚠ Codex CLI still not on PATH after install"
    return 1
  fi
  codex --version
  return 0
}

promptly_verify_plugin_pack() {
  local integrations="${1:-${HOME}/integrations}"
  if [[ ! -f "${integrations}/.claude-plugin/marketplace.json" ]]; then
    echo "✗ Plugin pack failed — retry download"
    return 1
  fi
  if [[ ! -f "${integrations}/packages/telemetry-cli/bin/promptly-telemetry.mjs" ]]; then
    echo "✗ Plugin pack missing telemetry CLI"
    return 1
  fi
  if [[ ! -f "${integrations}/packages/promptly-improve/bin/promptly-improve.mjs" ]]; then
    echo "✗ Plugin pack missing improve CLI"
    return 1
  fi
  echo "✓ Plugin pack OK"
  return 0
}

promptly_install_for_cursor() {
  local integrations="${1:-${HOME}/integrations}"
  local source_cursor="${integrations}/cursor"
  local cursor_plugin="${HOME}/.cursor/plugins/local/promptly-cursor"
  echo ""
  echo "━━━ Cursor ━━━"
  if [[ ! -d "${source_cursor}" ]]; then
    echo "✗ Cursor plugin files missing from ${integrations}/cursor"
    return 1
  fi
  promptly_sync_telemetry_cli "${source_cursor}" || return 1
  set +e
  promptly_sync_improve_cli "${source_cursor}"
  set -e
  promptly_cursor_plugin_reinstall "${integrations}"
  promptly_sync_cursor_command_files "${source_cursor}"
  if ! grep -q 'afterAgentResponse' "${cursor_plugin}/hooks/hooks.json" 2>/dev/null; then
    echo "✗ Cursor hooks missing afterAgentResponse (re-download plugin pack)"
    return 1
  fi
  if ! grep -q 'hook --tool cursor' "${cursor_plugin}/hooks/hooks.json" 2>/dev/null; then
    echo "✗ Hooks are not configured for Cursor (expected --tool cursor)"
    return 1
  fi
  if ! grep -q '"PROMPTLY_TOOL": "cursor"' "${cursor_plugin}/mcp.json" 2>/dev/null; then
    echo "✗ MCP server is not configured for Cursor"
    return 1
  fi
  if [[ ! -f "${HOME}/.cursor/commands/promptly.md" ]]; then
    echo "✗ Missing /promptly command (~/.cursor/commands/promptly.md)"
    return 1
  fi
  echo "✓ Promptly installed for Cursor"
  return 0
}

promptly_install_for_claude_code() {
  local integrations="${1:-${HOME}/integrations}"
  local claude_plugin="${integrations}/claude-code"
  echo ""
  echo "━━━ Claude Code ━━━"
  if ! promptly_ensure_claude_cli; then
    return 2
  fi
  if [[ ! -d "${claude_plugin}" ]]; then
    echo "✗ Claude Code plugin files missing from ${integrations}/claude-code"
    return 1
  fi
  promptly_sync_telemetry_cli "${claude_plugin}" || return 1
  set +e
  promptly_sync_improve_cli "${claude_plugin}"
  set -e
  promptly_sync_claude_code_command_files "${claude_plugin}"
  promptly_claude_marketplace_refresh "${integrations}" || return 1
  promptly_claude_plugin_reinstall || return 1
  if ! claude plugin list 2>/dev/null | grep -q promptly-claude-code; then
    echo "✗ Promptly plugin not found in claude plugin list — retry this step"
    return 1
  fi
  if ! grep -q 'hook --tool claude_code' "${claude_plugin}/hooks/hooks.json" 2>/dev/null; then
    echo "✗ Hooks are not configured for Claude Code"
    return 1
  fi
  if ! grep -q '"PROMPTLY_TOOL": "claude_code"' "${claude_plugin}/.mcp.json" 2>/dev/null; then
    echo "✗ MCP server is not configured for Claude Code"
    return 1
  fi
  if [[ ! -f "${HOME}/.claude/commands/promptly.md" ]]; then
    echo "✗ Missing /promptly command (~/.claude/commands/promptly.md)"
    return 1
  fi
  echo "✓ Promptly installed for Claude Code"
  return 0
}

promptly_install_for_codex() {
  local integrations="${1:-${HOME}/integrations}"
  local codex_plugin="${integrations}/codex"
  echo ""
  echo "━━━ Codex ━━━"
  if ! promptly_ensure_codex_cli; then
    return 2
  fi
  if [[ ! -d "${codex_plugin}" ]]; then
    echo "✗ Codex plugin files missing from ${integrations}/codex"
    return 1
  fi
  promptly_sync_telemetry_cli "${codex_plugin}" || return 1
  set +e
  promptly_sync_improve_cli "${codex_plugin}"
  set -e
  promptly_install_codex_skill "${codex_plugin}" || return 1
  promptly_codex_marketplace_add "${integrations}" || return 1
  promptly_codex_plugin_reinstall || return 1
  if ! codex plugin list 2>/dev/null | grep -q promptly-codex; then
    echo "✗ Promptly plugin not found in codex plugin list — retry this step"
    return 1
  fi
  if ! grep -q 'UserPromptSubmit' "${codex_plugin}/hooks/hooks.json" 2>/dev/null; then
    echo "✗ Codex hooks missing UserPromptSubmit (re-download plugin pack)"
    return 1
  fi
  if ! grep -q 'hook --tool codex' "${codex_plugin}/hooks/hooks.json" 2>/dev/null; then
    echo "✗ Hooks are not configured for Codex"
    return 1
  fi
  if ! grep -q '"PROMPTLY_TOOL": "codex"' "${codex_plugin}/.mcp.json" 2>/dev/null; then
    echo "✗ MCP server is not configured for Codex"
    return 1
  fi
  if [[ ! -f "${HOME}/.codex/skills/promptly/SKILL.md" ]]; then
    echo "✗ Missing /promptly skill (~/.codex/skills/promptly/SKILL.md)"
    return 1
  fi
  echo "✓ Promptly installed for Codex"
  return 0
}
