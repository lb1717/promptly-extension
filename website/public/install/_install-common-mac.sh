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
  echo "→ Installed /promptly for Claude Code (~/.claude/commands + skills/promptly)"
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
  echo "  Using user-level npm prefix (${user_prefix}) — global /usr/local is not writable"
}

promptly_ensure_claude_cli() {
  promptly_setup_npm_global_path
  if command -v claude >/dev/null 2>&1; then
    claude --version
    return 0
  fi
  echo "→ Claude Code CLI not found; installing @anthropic-ai/claude-code…"
  if ! npm install -g @anthropic-ai/claude-code; then
    echo "⚠ Could not install Claude Code CLI — skip Claude Code or install it manually"
    return 1
  fi
  promptly_setup_npm_global_path
  if ! command -v claude >/dev/null 2>&1; then
    echo "⚠ Claude Code CLI still not on PATH after install"
    return 1
  fi
  claude --version
  return 0
}

promptly_ensure_codex_cli() {
  promptly_setup_npm_global_path
  if command -v codex >/dev/null 2>&1; then
    codex --version
    return 0
  fi
  echo "→ Codex CLI not found; installing @openai/codex…"
  if ! npm install -g @openai/codex; then
    echo "⚠ Could not install Codex CLI — skip Codex or install it manually"
    return 1
  fi
  promptly_setup_npm_global_path
  if ! command -v codex >/dev/null 2>&1; then
    echo "⚠ Codex CLI still not on PATH after install"
    return 1
  fi
  codex --version
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
    echo "→ Refreshing telemetry CLI from GitHub (plugin pack zip was stale)…"
    if curl -fsSL "${raw_url}" -o "${dest}.tmp"; then
      mv "${dest}.tmp" "${dest}"
    else
      rm -f "${dest}.tmp"
      echo "⚠ Could not refresh telemetry CLI — timing stats may be inaccurate until the plugin pack updates"
    fi
  fi
}

promptly_prepare_plugin_pack() {
  local integrations="${1:-${HOME}/integrations}"
  promptly_refresh_telemetry_cli "${integrations}"
  local sync_script="${integrations}/scripts/sync-plugin-pack.mjs"
  if [[ -f "${sync_script}" ]] && command -v node >/dev/null 2>&1; then
    echo "→ Syncing plugin pack hooks and CLIs…"
    node "${sync_script}" >/dev/null 2>&1 || true
  fi
  if [[ ! -f "${integrations}/cursor/hooks/hooks.json" ]] \
    || ! grep -q 'afterAgentResponse' "${integrations}/cursor/hooks/hooks.json" 2>/dev/null; then
    echo "→ Patching Cursor hooks (afterAgentResponse)…"
    promptly_write_cursor_hooks_json "${integrations}/cursor/hooks/hooks.json"
  fi
  if [[ ! -f "${integrations}/codex/hooks/hooks.json" ]] \
    || ! grep -q 'UserPromptSubmit' "${integrations}/codex/hooks/hooks.json" 2>/dev/null; then
    echo "→ Patching Codex hooks (UserPromptSubmit)…"
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
  echo "✓ Promptly installed for Codex"
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

  ((${#_installed[@]} == 0)) && return 1
  return 0
}

promptly_sync_subscription_usage() {
  local integrations="${1:-${HOME}/integrations}"
  local cli="${integrations}/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  if [[ ! -f "${cli}" ]]; then
    echo "⚠ Subscription sync skipped — telemetry CLI missing."
    return 0
  fi
  echo "→ Syncing AI subscription usage (Claude, Codex, Cursor)…"
  echo "  First-time setup opens your browser once for claude.ai sign-in."
  set +e
  node "${cli}" usage-sync --login-claude
  local code=$?
  set -e
  if [[ $code -ne 0 ]]; then
    echo "⚠ Subscription sync incomplete — resync anytime at https://promptly-labs.com/integrations#resync-subscriptions"
    return 0
  fi
  echo "✓ Subscription usage synced — use Refresh on your stats page anytime."
}

promptly_finalize_with_pair_code() {
  local code="$1"
  local integrations="${2:-${HOME}/integrations}"
  local cli="${integrations}/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  if [[ ! -f "${cli}" ]]; then
    echo "✗ Could not install telemetry CLI from plugin pack."
    return 1
  fi
  echo "→ Pairing all agents, merging stats, and verifying live uploads…"
  node "${cli}" fix-account "${code}"
  echo "→ Syncing hooks + telemetry into Claude Code, Cursor, and Codex runtimes…"
  promptly_sync_all_agent_runtimes "${integrations}"
  promptly_sync_subscription_usage "${integrations}"
  echo ""
  echo "✓ All set. Restart Claude Code, Cursor, and Codex if they were open, then send a test prompt."
  echo "  Stats go to the email shown above on https://promptly-labs.com/account/statistics"
}
