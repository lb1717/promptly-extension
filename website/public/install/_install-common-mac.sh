# Promptly install helpers — source via: eval "$(curl -fsSL .../_install-common-mac.sh)"

promptly_is_quiet() {
  [[ "${PROMPTLY_QUIET:-}" == "1" ]]
}

promptly_detail() {
  promptly_is_quiet && return
  echo "$@"
}

promptly_ok() {
  echo "✓ $1"
}

promptly_fail() {
  echo "✗ $1" >&2
}

promptly_print_install_success() {
  echo "Promptly Successfully Installed"
}

promptly_normalize_pair_code() {
  printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9'
}

promptly_validate_pair_code() {
  local normalized
  normalized="$(promptly_normalize_pair_code "$1")"
  if [[ ${#normalized} -ne 8 ]]; then
    promptly_fail "Pairing code must be 8 letters/numbers (check https://promptly-labs.com/integrations)"
    return 1
  fi
  printf '%s' "${normalized}"
}

promptly_require_cmd() {
  local name="$1"
  if command -v "${name}" >/dev/null 2>&1; then
    return 0
  fi
  promptly_fail "${name} is required but not found."
  return 1
}

promptly_run_fix_account() {
  local code="$1"
  local cli="$2"
  local normalized
  normalized="$(promptly_validate_pair_code "${code}")" || return 1
  set +e
  if promptly_is_quiet; then
    node "${cli}" fix-account --quiet "${normalized}"
  else
    node "${cli}" fix-account "${normalized}"
  fi
  local exit_code=$?
  set -e
  if [[ $exit_code -ne 0 ]]; then
    promptly_fail "Pairing failed — get a fresh code at https://promptly-labs.com/integrations"
    return 1
  fi
  return 0
}

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
    promptly_detail "✓ Marketplace added"
    return 0
  fi
  if echo "${out}" | grep -qiE 'already installed|already exists'; then
    promptly_detail "✓ Marketplace promptly-labs already installed (refreshing from ~/integrations)"
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
  promptly_detail "✓ Marketplace refreshed"
}

promptly_claude_plugin_reinstall() {
  set +e
  if claude plugin list 2>/dev/null | grep -q 'promptly-claude-code'; then
    promptly_detail "→ Removing previous Promptly Claude Code plugin…"
    if promptly_is_quiet; then
      claude plugin uninstall promptly-claude-code@promptly-labs >/dev/null 2>&1 || true
    else
      claude plugin uninstall promptly-claude-code@promptly-labs 2>/dev/null || true
    fi
  fi
  set -e
  promptly_detail "→ Installing fresh Promptly plugin…"
  if promptly_is_quiet; then
    claude plugin install promptly-claude-code@promptly-labs >/dev/null 2>&1
  else
    claude plugin install promptly-claude-code@promptly-labs
  fi
}

promptly_codex_marketplace_add() {
  local integrations_path="${1:-${HOME}/integrations}"
  set +e
  local out
  out="$(codex plugin marketplace add "${integrations_path}" 2>&1)"
  local code=$?
  set -e
  if [[ $code -eq 0 ]]; then
    promptly_detail "✓ Marketplace added"
    return 0
  fi
  if echo "${out}" | grep -qiE 'already installed|already exists'; then
    promptly_detail "✓ Marketplace promptly-labs already installed (using updated files from ~/integrations)"
    return 0
  fi
  echo "✗ Failed to add marketplace: ${out}"
  return 1
}

promptly_codex_plugin_reinstall() {
  set +e
  if codex plugin list 2>/dev/null | grep -q 'promptly-codex'; then
    promptly_detail "→ Removing previous Promptly Codex plugin…"
    if promptly_is_quiet; then
      codex plugin remove promptly-codex@promptly-labs >/dev/null 2>&1 \
        || codex plugin remove promptly-codex --marketplace promptly-labs >/dev/null 2>&1 || true
    else
      codex plugin remove promptly-codex@promptly-labs 2>/dev/null \
        || codex plugin remove promptly-codex --marketplace promptly-labs 2>/dev/null || true
    fi
  fi
  set -e
  promptly_detail "→ Installing fresh Promptly plugin…"
  if promptly_is_quiet; then
    codex plugin add promptly-codex@promptly-labs >/dev/null 2>&1 \
      || codex plugin install promptly-codex@promptly-labs >/dev/null 2>&1
  else
    codex plugin add promptly-codex@promptly-labs 2>/dev/null \
      || codex plugin install promptly-codex@promptly-labs
  fi
}

promptly_sync_codex_plugin_cache() {
  local src="${HOME}/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  local hooks_src="${HOME}/integrations/codex/hooks/hooks.json"
  local cache_root="${HOME}/.codex/plugins/cache/promptly-labs/promptly-codex"
  [[ -f "${src}" ]] || return 0
  for bin_dir in "${cache_root}"/*/bin "${cache_root}"/*/codex/bin; do
    if [[ -d "${bin_dir}" ]]; then
      cp "${src}" "${bin_dir}/promptly-telemetry.mjs"
    fi
  done
  if [[ -f "${hooks_src}" ]]; then
    for hooks_dir in "${cache_root}"/*/hooks "${cache_root}"/*/codex/hooks; do
      if [[ -d "${hooks_dir}" ]]; then
        cp "${hooks_src}" "${hooks_dir}/hooks.json"
      fi
    done
  fi
}

promptly_sync_claude_plugin_cache() {
  local src="${HOME}/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  local hooks_src="${HOME}/integrations/claude-code/hooks/hooks.json"
  local cache_root="${HOME}/.claude/plugins/cache/promptly-labs/promptly-claude-code"
  [[ -f "${src}" ]] || return 0
  for bin_dir in "${cache_root}"/*/bin; do
    if [[ -d "${bin_dir}" ]]; then
      cp "${src}" "${bin_dir}/promptly-telemetry.mjs"
    fi
  done
  if [[ -f "${hooks_src}" ]]; then
    for hooks_dir in "${cache_root}"/*/hooks; do
      if [[ -d "${hooks_dir}" ]]; then
        cp "${hooks_src}" "${hooks_dir}/hooks.json"
      fi
    done
  fi
}

# Push latest telemetry CLI + hooks into every runtime path agents actually invoke (not only ~/integrations).
promptly_sync_all_agent_runtimes() {
  local integrations="${1:-${HOME}/integrations}"
  for plugin in claude-code cursor codex; do
    if [[ -d "${integrations}/${plugin}" ]]; then
      promptly_sync_telemetry_cli "${integrations}/${plugin}" 2>/dev/null || true
    fi
  done
  promptly_sync_claude_plugin_cache
  promptly_sync_codex_plugin_cache
  if [[ -d "${integrations}/cursor" ]]; then
    promptly_cursor_plugin_reinstall "${integrations}" 2>/dev/null || true
  fi
  echo "✓ Synced live hooks + telemetry CLI for Claude Code, Cursor, and Codex"
}

promptly_sync_claude_code_command_files() {
  local plugin_dir="${1:-${HOME}/integrations/claude-code}"
  local src="${plugin_dir}/user-commands/promptly.md"
  if [[ ! -f "${src}" ]]; then
    echo "✗ Missing ${src} — re-download the plugin pack"
    return 1
  fi
  mkdir -p "${HOME}/.claude/commands" "${HOME}/.claude/skills/promptly"
  cp "${src}" "${HOME}/.claude/commands/promptly.md"
  if [[ -f "${plugin_dir}/skill/SKILL.md" ]]; then
    cp "${plugin_dir}/skill/SKILL.md" "${HOME}/.claude/skills/promptly/SKILL.md"
  fi
  promptly_detail "→ Installed /promptly for Claude Code (~/.claude/commands + skills/promptly)"
}

promptly_sync_cursor_command_files() {
  local plugin_dir="${1:-${HOME}/integrations/cursor}"
  local src="${plugin_dir}/user-commands/promptly.md"
  if [[ ! -f "${src}" ]]; then
    echo "✗ Missing ${src} — re-download the plugin pack"
    return 1
  fi
  mkdir -p "${HOME}/.cursor/commands"
  cp "${src}" "${HOME}/.cursor/commands/promptly.md"
  cp "${src}" "${plugin_dir}/commands/promptly.md"
  promptly_detail "→ Installed /promptly for Cursor (~/.cursor/commands/promptly.md)"
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
  promptly_detail "→ Installed /promptly for Codex (~/.codex/skills/promptly/SKILL.md)"
}

promptly_cursor_plugin_reinstall() {
  local integrations="${1:-${HOME}/integrations}"
  local dest="${HOME}/.cursor/plugins/local/promptly-cursor"
  promptly_detail "→ Removing previous Promptly Cursor plugin…"
  rm -rf "${dest}"
  mkdir -p "${HOME}/.cursor/plugins/local"
  cp -R "${integrations}/cursor" "${dest}"
}

promptly_setup_npm_global_path() {
  local global_prefix user_prefix profile="${HOME}/.zprofile"
  global_prefix="$(npm prefix -g 2>/dev/null || echo /usr/local)"
  if [[ -w "${global_prefix}" ]] && [[ -w "${global_prefix}/lib" || ! -e "${global_prefix}/lib" ]]; then
    export PATH="${global_prefix}/bin:${PATH}"
    return 0
  fi
  user_prefix="${HOME}/.npm-global"
  mkdir -p "${user_prefix}/bin"
  export NPM_CONFIG_PREFIX="${user_prefix}"
  export PATH="${user_prefix}/bin:${PATH}"
  if ! grep -qF "${user_prefix}/bin" "${profile}" 2>/dev/null; then
    {
      echo ""
      echo "# Promptly install — user-level npm global packages"
      echo "export PATH=\"${user_prefix}/bin:\$PATH\""
    } >>"${profile}"
  fi
  promptly_detail "  Using user-level npm prefix (${user_prefix}) — global /usr/local is not writable"
}

promptly_ensure_claude_cli() {
  promptly_setup_npm_global_path
  if command -v claude >/dev/null 2>&1; then
    promptly_detail "$(claude --version 2>/dev/null || true)"
    return 0
  fi
  promptly_detail "→ Claude Code CLI not found; installing @anthropic-ai/claude-code…"
  if ! npm install -g @anthropic-ai/claude-code; then
    echo "⚠ Could not install Claude Code CLI — skip Claude Code or install it manually"
    return 1
  fi
  promptly_setup_npm_global_path
  if ! command -v claude >/dev/null 2>&1; then
    echo "⚠ Claude Code CLI still not on PATH after install"
    return 1
  fi
  promptly_detail "$(claude --version 2>/dev/null || true)"
  return 0
}

promptly_ensure_codex_cli() {
  promptly_setup_npm_global_path
  if command -v codex >/dev/null 2>&1; then
    promptly_detail "$(codex --version 2>/dev/null || true)"
    return 0
  fi
  promptly_detail "→ Codex CLI not found; installing @openai/codex…"
  if ! npm install -g @openai/codex; then
    echo "⚠ Could not install Codex CLI — skip Codex or install it manually"
    return 1
  fi
  promptly_setup_npm_global_path
  if ! command -v codex >/dev/null 2>&1; then
    echo "⚠ Codex CLI still not on PATH after install"
    return 1
  fi
  promptly_detail "$(codex --version 2>/dev/null || true)"
  return 0
}

promptly_write_cursor_hooks_json() {
  local hooks_path="$1"
  mkdir -p "$(dirname "${hooks_path}")"
  cat >"${hooks_path}" <<'EOF'
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      { "command": "node \"${CURSOR_PLUGIN_ROOT}/bin/promptly-telemetry.mjs\" hook --tool cursor" }
    ],
    "afterAgentResponse": [
      { "command": "node \"${CURSOR_PLUGIN_ROOT}/bin/promptly-telemetry.mjs\" hook --tool cursor" }
    ],
    "stop": [
      { "command": "node \"${CURSOR_PLUGIN_ROOT}/bin/promptly-telemetry.mjs\" hook --tool cursor" }
    ],
    "sessionStart": [
      { "command": "node \"${CURSOR_PLUGIN_ROOT}/bin/promptly-telemetry.mjs\" hook --tool cursor" }
    ],
    "sessionEnd": [
      { "command": "node \"${CURSOR_PLUGIN_ROOT}/bin/promptly-telemetry.mjs\" hook --tool cursor" }
    ]
  }
}
EOF
}

promptly_write_codex_hooks_json() {
  local hooks_path="$1"
  mkdir -p "$(dirname "${hooks_path}")"
  cat >"${hooks_path}" <<'EOF'
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/bin/promptly-telemetry.mjs\" hook --tool codex",
            "timeout": 15
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/bin/promptly-telemetry.mjs\" hook --tool codex",
            "timeout": 15
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/bin/promptly-telemetry.mjs\" hook --tool codex",
            "timeout": 15
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/bin/promptly-telemetry.mjs\" hook --tool codex",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
EOF
}

promptly_telemetry_cli_is_stale() {
  local path="$1"
  [[ ! -f "${path}" ]] && return 0
  grep -q 'hooks_audit' "${path}" 2>/dev/null && return 1
  return 0
}

promptly_refresh_telemetry_cli() {
  local integrations="${1:-${HOME}/integrations}"
  local dest="${integrations}/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  local raw_url="https://raw.githubusercontent.com/lb1717/promptly-extension/main/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  mkdir -p "$(dirname "${dest}")"
  if promptly_telemetry_cli_is_stale "${dest}"; then
    promptly_detail "→ Refreshing telemetry CLI from GitHub (plugin pack zip was stale)…"
    if curl -fsSL "${raw_url}" -o "${dest}.tmp"; then
      mv "${dest}.tmp" "${dest}"
    else
      rm -f "${dest}.tmp"
      promptly_detail "⚠ Could not refresh telemetry CLI — timing stats may be inaccurate until the plugin pack updates"
    fi
  fi
}

promptly_pull_latest_telemetry_cli() {
  local integrations="${1:-${HOME}/integrations}"
  local dest="${integrations}/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  local raw_url="https://raw.githubusercontent.com/lb1717/promptly-extension/main/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  mkdir -p "$(dirname "${dest}")"
  if curl -fsSL "${raw_url}" -o "${dest}.tmp" 2>/dev/null; then
    mv "${dest}.tmp" "${dest}"
    return 0
  fi
  rm -f "${dest}.tmp"
  return 1
}

promptly_prepare_plugin_pack() {
  local integrations="${1:-${HOME}/integrations}"
  promptly_refresh_telemetry_cli "${integrations}"
  local sync_script="${integrations}/scripts/sync-plugin-pack.mjs"
  if [[ -f "${sync_script}" ]] && command -v node >/dev/null 2>&1; then
    promptly_detail "→ Syncing plugin pack hooks and CLIs…"
    node "${sync_script}" >/dev/null 2>&1 || true
  fi
  if [[ ! -f "${integrations}/cursor/hooks/hooks.json" ]] \
    || ! grep -q 'afterAgentResponse' "${integrations}/cursor/hooks/hooks.json" 2>/dev/null; then
    promptly_detail "→ Patching Cursor hooks (afterAgentResponse)…"
    promptly_write_cursor_hooks_json "${integrations}/cursor/hooks/hooks.json"
  fi
  if [[ ! -f "${integrations}/codex/hooks/hooks.json" ]] \
    || ! grep -q 'UserPromptSubmit' "${integrations}/codex/hooks/hooks.json" 2>/dev/null; then
    promptly_detail "→ Patching Codex hooks (UserPromptSubmit)…"
    promptly_write_codex_hooks_json "${integrations}/codex/hooks/hooks.json"
  fi
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
  promptly_prepare_plugin_pack "${integrations}"
  promptly_is_quiet && promptly_ok "Plugin pack ready" || echo "✓ Plugin pack OK"
  return 0
}

promptly_install_for_cursor() {
  local integrations="${1:-${HOME}/integrations}"
  local source_cursor="${integrations}/cursor"
  local cursor_plugin="${HOME}/.cursor/plugins/local/promptly-cursor"
  promptly_detail ""
  promptly_detail "━━━ Cursor ━━━"
  if [[ ! -d "${source_cursor}" ]]; then
    echo "✗ Cursor plugin files missing from ${integrations}/cursor"
    return 1
  fi
  promptly_prepare_plugin_pack "${integrations}"
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
  if ! grep -q 'CURSOR_PLUGIN_ROOT' "${cursor_plugin}/hooks/hooks.json" 2>/dev/null; then
    echo "✗ Cursor hooks must use \${CURSOR_PLUGIN_ROOT}/bin (re-run install or update plugin pack)"
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
  promptly_is_quiet && promptly_ok "Cursor completed" || echo "✓ Promptly installed for Cursor"
  return 0
}

promptly_install_for_claude_code() {
  local integrations="${1:-${HOME}/integrations}"
  local claude_plugin="${integrations}/claude-code"
  promptly_detail ""
  promptly_detail "━━━ Claude Code ━━━"
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
  promptly_sync_claude_plugin_cache
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
  promptly_is_quiet && promptly_ok "Claude Code completed" || echo "✓ Promptly installed for Claude Code"
  return 0
}

promptly_install_for_codex() {
  local integrations="${1:-${HOME}/integrations}"
  local codex_plugin="${integrations}/codex"
  promptly_detail ""
  promptly_detail "━━━ Codex ━━━"
  if ! promptly_ensure_codex_cli; then
    return 2
  fi
  if [[ ! -d "${codex_plugin}" ]]; then
    echo "✗ Codex plugin files missing from ${integrations}/codex"
    return 1
  fi
  promptly_prepare_plugin_pack "${integrations}"
  promptly_sync_telemetry_cli "${codex_plugin}" || return 1
  set +e
  promptly_sync_improve_cli "${codex_plugin}"
  set -e
  promptly_install_codex_skill "${codex_plugin}" || return 1
  promptly_codex_marketplace_add "${integrations}" || return 1
  promptly_codex_plugin_reinstall || return 1
  promptly_sync_codex_plugin_cache
  if ! codex plugin list 2>/dev/null | grep -q promptly-codex; then
    echo "✗ Promptly plugin not found in codex plugin list — retry this step"
    return 1
  fi
  if ! grep -q 'UserPromptSubmit' "${codex_plugin}/hooks/hooks.json" 2>/dev/null; then
    echo "✗ Codex hooks missing UserPromptSubmit (re-download plugin pack)"
    return 1
  fi
  if ! grep -q 'PLUGIN_ROOT' "${codex_plugin}/hooks/hooks.json" 2>/dev/null; then
    echo "✗ Codex hooks must use \${PLUGIN_ROOT}/bin (re-run install or update plugin pack)"
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
  promptly_is_quiet && promptly_ok "Codex completed" || echo "✓ Promptly installed for Codex"
  return 0
}

promptly_install_all_agents() {
  local integrations="${1:-${HOME}/integrations}"
  local _installed=() _skipped=() _failed=()

  _run_agent_install() {
    local label="$1"
    shift
    set +e
    "$@"
    local code=$?
    set -e
    if [[ $code -eq 0 ]]; then
      _installed+=("${label}")
    elif [[ $code -eq 2 ]]; then
      _skipped+=("${label}")
    else
      _failed+=("${label}")
    fi
  }

  _run_agent_install "Cursor" promptly_install_for_cursor "${integrations}"
  _run_agent_install "Claude Code" promptly_install_for_claude_code "${integrations}"
  _run_agent_install "Codex" promptly_install_for_codex "${integrations}"

  if ! promptly_is_quiet; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Promptly all-agents install summary"
    if ((${#_installed[@]})); then
      echo "  ✓ Installed: ${_installed[*]}"
    fi
    if ((${#_skipped[@]})); then
      echo "  ⚠ Skipped (CLI not available): ${_skipped[*]}"
    fi
    if ((${#_failed[@]})); then
      echo "  ✗ Failed: ${_failed[*]}"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  else
    local label
    if ((${#_skipped[@]})); then
      for label in "${_skipped[@]}"; do
        promptly_ok "${label} skipped (CLI not installed)"
      done
    fi
    if ((${#_failed[@]})); then
      for label in "${_failed[@]}"; do
        echo "✗ ${label} failed" >&2
      done
    fi
  fi

  ((${#_installed[@]} == 0)) && return 1
  return 0
}

promptly_sync_subscription_usage() {
  local integrations="${1:-${HOME}/integrations}"
  local cli="${integrations}/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  if [[ ! -f "${cli}" ]]; then
    promptly_detail "⚠ Subscription sync skipped — telemetry CLI missing."
    return 0
  fi
  promptly_detail "→ Syncing AI subscription usage (Claude, Codex, Cursor)…"
  promptly_detail "  First-time setup opens your browser once for claude.ai sign-in."
  set +e
  if promptly_is_quiet; then
    node "${cli}" usage-sync --login-claude >/dev/null 2>&1
  else
    node "${cli}" usage-sync --login-claude
  fi
  local code=$?
  set -e
  if [[ $code -ne 0 ]]; then
    promptly_detail "⚠ Subscription sync incomplete — resync anytime at https://promptly-labs.com/integrations#resync-subscriptions"
    return 0
  fi
  promptly_is_quiet && promptly_ok "Subscription usage synced" || echo "✓ Subscription usage synced — use Refresh on your stats page anytime."
}

promptly_finalize_with_pair_code() {
  local code="$1"
  local integrations="${2:-${HOME}/integrations}"
  local cli="${integrations}/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  if [[ ! -f "${cli}" ]]; then
    promptly_fail "Could not install telemetry CLI from plugin pack."
    return 1
  fi
  promptly_run_fix_account "${code}" "${cli}" || return 1
  if promptly_is_quiet; then
    promptly_sync_all_agent_runtimes "${integrations}" >/dev/null 2>&1 \
      || promptly_sync_all_agent_runtimes "${integrations}" || return 1
    promptly_sync_subscription_usage "${integrations}" || true
    return 0
  fi
  promptly_detail "→ Syncing hooks + telemetry into Claude Code, Cursor, and Codex runtimes…"
  promptly_sync_all_agent_runtimes "${integrations}"
  promptly_sync_subscription_usage "${integrations}"
  echo ""
  echo "✓ All set. Restart Claude Code, Cursor, and Codex if they were open, then send a test prompt."
  echo "  Stats go to the email shown above on https://promptly-labs.com/account/statistics"
}

promptly_pick_companion_app_dir() {
  local system_dir="/Applications"
  local system_apps="${system_dir}/Promptly Companion.app"
  local user_apps="${HOME}/Applications/Promptly Companion.app"
  if [[ -d "${system_apps}" ]]; then
    printf '%s' "${system_apps}"
    return 0
  fi
  if [[ -w "${system_dir}" ]] 2>/dev/null; then
    printf '%s' "${system_apps}"
    return 0
  fi
  mkdir -p "${HOME}/Applications"
  printf '%s' "${user_apps}"
}

promptly_open_companion_mac() {
  local app_path="$1"
  if [[ ! -d "${app_path}" ]]; then
    return 1
  fi
  if ! command -v open >/dev/null 2>&1; then
    promptly_detail "→ Open ${app_path} manually to finish setup."
    return 0
  fi
  if open "${app_path}" >/dev/null 2>&1; then
    promptly_ok "Desktop app opened"
    return 0
  fi
  promptly_detail "→ Desktop app installed — open it from Applications if it did not launch automatically."
  return 0
}

promptly_install_companion_mac() {
  local app_path
  app_path="$(promptly_pick_companion_app_dir)"
  local api_url="https://promptly-labs.com/api/companion/download"
  local fallback="https://github.com/lb1717/promptly-extension/releases/download/companion-v0.2.0/Promptly-Companion-0.2.0-mac.dmg"
  local dmg_url="${PROMPTLY_COMPANION_DMG_URL:-}"
  local tmp_dmg mount_point src_app attempt

  promptly_require_cmd curl || return 1
  if ! command -v hdiutil >/dev/null 2>&1; then
    promptly_fail "hdiutil is required to install the desktop app on macOS."
    return 1
  fi

  if [[ -z "${dmg_url}" ]]; then
    local json
    json="$(curl -fsSL "${api_url}" 2>/dev/null || true)"
    if [[ -n "${json}" ]] && command -v node >/dev/null 2>&1; then
      dmg_url="$(printf '%s' "${json}" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j.macUrl||"")}catch{}})' 2>/dev/null || true)"
    fi
  fi
  [[ -n "${dmg_url}" ]] || dmg_url="${fallback}"

  tmp_dmg="$(mktemp /tmp/promptly-companion.XXXXXX.dmg)"
  mount_point="$(mktemp -d /tmp/promptly-mount.XXXXXX)"

  for attempt in 1 2; do
    if curl -fsSL -o "${tmp_dmg}" "${dmg_url}"; then
      break
    fi
    if [[ $attempt -eq 2 ]]; then
      rm -f "${tmp_dmg}"
      rm -rf "${mount_point}"
      promptly_fail "Could not download Promptly desktop app."
      return 1
    fi
    sleep 1
  done

  if ! hdiutil attach "${tmp_dmg}" -nobrowse -readonly -mountpoint "${mount_point}" -quiet 2>/dev/null; then
    rm -f "${tmp_dmg}"
    rm -rf "${mount_point}"
    promptly_fail "Could not mount Promptly desktop installer."
    return 1
  fi

  src_app="${mount_point}/Promptly Companion.app"
  if [[ ! -d "${src_app}" ]]; then
    hdiutil detach "${mount_point}" -quiet 2>/dev/null || true
    rm -f "${tmp_dmg}"
    rm -rf "${mount_point}"
    promptly_fail "Promptly Companion.app not found in the installer."
    return 1
  fi

  rm -rf "${app_path}"
  if ! cp -R "${src_app}" "$(dirname "${app_path}")/"; then
    hdiutil detach "${mount_point}" -quiet 2>/dev/null || true
    rm -f "${tmp_dmg}"
    rm -rf "${mount_point}"
    promptly_fail "Could not copy Promptly to $(dirname "${app_path}"). Check disk space and permissions."
    return 1
  fi

  hdiutil detach "${mount_point}" -quiet 2>/dev/null || hdiutil detach "${mount_point}" -force -quiet 2>/dev/null || true
  rm -f "${tmp_dmg}"
  rm -rf "${mount_point}"
  xattr -cr "${app_path}" 2>/dev/null || true
  if [[ "${app_path}" == "${HOME}/Applications/"* ]]; then
    promptly_ok "Desktop app installed (~/Applications — no admin password needed)"
  else
    promptly_ok "Desktop app installed"
  fi
  promptly_open_companion_mac "${app_path}"
  return 0
}
