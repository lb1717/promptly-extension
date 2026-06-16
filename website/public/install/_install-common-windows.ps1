function Promptly-UnzipPluginPack {
  param(
    [string]$ZipPath = (Join-Path $env:USERPROFILE "promptly.zip"),
    [string]$Dest = $env:USERPROFILE
  )
  Expand-Archive -Path $ZipPath -DestinationPath $Dest -Force
}

function Promptly-SyncImproveCli {
  param([string]$PluginDir)
  $src = Join-Path $env:USERPROFILE "integrations\packages\promptly-improve\bin\promptly-improve.mjs"
  if (Test-Path $src) {
    New-Item -ItemType Directory -Force -Path (Join-Path $PluginDir "bin") | Out-Null
    Copy-Item -Force $src (Join-Path $PluginDir "bin\promptly-improve.mjs")
    return
  }
  if (Test-Path (Join-Path $PluginDir "bin\promptly-improve.mjs")) { return }
  Write-Host "Missing promptly-improve.mjs - re-download the plugin pack"
  exit 1
}

function Promptly-SyncTelemetryCli {
  param([string]$PluginDir)
  $src = Join-Path $env:USERPROFILE "integrations\packages\telemetry-cli\bin\promptly-telemetry.mjs"
  if (Test-Path $src) {
    New-Item -ItemType Directory -Force -Path (Join-Path $PluginDir "bin") | Out-Null
    Copy-Item -Force $src (Join-Path $PluginDir "bin\promptly-telemetry.mjs")
    return
  }
  if (Test-Path (Join-Path $PluginDir "bin\promptly-telemetry.mjs")) { return }
  Write-Host "Missing promptly-telemetry.mjs - re-download the plugin pack"
  exit 1
}

function Promptly-MakeCodexHookEntry {
  param([string]$Command)
  return @{ hooks = @(@{ type = "command"; command = $Command; timeout = 15 }) }
}

function Promptly-WriteCodexHooksJson {
  param([Parameter(Mandatory)][string]$HooksPath)
  $node = Promptly-GetHookNodePrefix
  $cmd = $node + ' "${PLUGIN_ROOT}/bin/promptly-telemetry.mjs" hook --tool codex'
  $payload = @{
    hooks = @{
      UserPromptSubmit = @(Promptly-MakeCodexHookEntry -Command $cmd)
      Stop = @(Promptly-MakeCodexHookEntry -Command $cmd)
      SessionStart = @(Promptly-MakeCodexHookEntry -Command $cmd)
      SessionEnd = @(Promptly-MakeCodexHookEntry -Command $cmd)
    }
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $HooksPath) | Out-Null
  ($payload | ConvertTo-Json -Depth 8) + "`n" | Set-Content -LiteralPath $HooksPath -Encoding utf8
}

function Promptly-WriteCursorHooksJson {
  param([Parameter(Mandatory)][string]$HooksPath)
  $node = Promptly-GetHookNodePrefix
  $cmd = $node + ' "${CURSOR_PLUGIN_ROOT}/bin/promptly-telemetry.mjs" hook --tool cursor'
  $entry = @{ command = $cmd }
  $payload = @{
    version = 1
    hooks = @{
      beforeSubmitPrompt = @($entry)
      afterAgentResponse = @($entry)
      stop = @($entry)
      sessionStart = @($entry)
      sessionEnd = @($entry)
    }
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $HooksPath) | Out-Null
  ($payload | ConvertTo-Json -Depth 8) + "`n" | Set-Content -LiteralPath $HooksPath -Encoding utf8
}

function Promptly-WriteClaudeHooksJson {
  param([Parameter(Mandatory)][string]$HooksPath)
  $node = Promptly-GetHookNodePrefix
  $cmd = $node + ' "${CLAUDE_PLUGIN_ROOT}/bin/promptly-telemetry.mjs" hook --tool claude_code'
  $payload = @{
    hooks = @{
      UserPromptSubmit = @(Promptly-MakeCodexHookEntry -Command $cmd)
      Stop = @(Promptly-MakeCodexHookEntry -Command $cmd)
      SessionStart = @(Promptly-MakeCodexHookEntry -Command $cmd)
      SessionEnd = @(Promptly-MakeCodexHookEntry -Command $cmd)
    }
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $HooksPath) | Out-Null
  ($payload | ConvertTo-Json -Depth 8) + "`n" | Set-Content -LiteralPath $HooksPath -Encoding utf8
}

function Promptly-ApplyWindowsHookPaths {
  param([string]$Integrations)
  Promptly-WriteCodexHooksJson -HooksPath (Join-Path $Integrations "codex\hooks\hooks.json")
  Promptly-WriteCursorHooksJson -HooksPath (Join-Path $Integrations "cursor\hooks\hooks.json")
  Promptly-WriteClaudeHooksJson -HooksPath (Join-Path $Integrations "claude-code\hooks\hooks.json")
}

function Promptly-PreparePluginPack {
  param([string]$Integrations)
  $syncScript = Join-Path $Integrations "scripts\sync-plugin-pack.mjs"
  $nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $nodeExe) {
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
  }
  if ($syncScript -and (Test-Path $syncScript) -and $nodeExe) {
    Write-Host "-> Syncing plugin pack hooks and CLIs..."
    & $nodeExe $syncScript 2>&1 | Out-Null
  }
  Promptly-ApplyWindowsHookPaths -Integrations $Integrations
}

function Promptly-SyncClaudePluginCache {
  $src = Join-Path $env:USERPROFILE "integrations\packages\telemetry-cli\bin\promptly-telemetry.mjs"
  $hooksSrc = Join-Path $env:USERPROFILE "integrations\claude-code\hooks\hooks.json"
  if (-not (Test-Path $src)) { return }
  $cacheRoot = Join-Path $env:USERPROFILE ".claude\plugins\cache\promptly-labs\promptly-claude-code"
  if (-not (Test-Path $cacheRoot)) { return }
  Get-ChildItem -Path $cacheRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $binDir = Join-Path $_.FullName "bin"
    if (Test-Path (Split-Path $binDir)) {
      New-Item -ItemType Directory -Force -Path $binDir | Out-Null
      Copy-Item -Force $src (Join-Path $binDir "promptly-telemetry.mjs")
    }
    if (Test-Path $hooksSrc) {
      $hooksDir = Join-Path $_.FullName "hooks"
      New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null
      Copy-Item -Force $hooksSrc (Join-Path $hooksDir "hooks.json")
    }
  }
}

function Promptly-SyncCodexPluginCache {
  $src = Join-Path $env:USERPROFILE "integrations\packages\telemetry-cli\bin\promptly-telemetry.mjs"
  $hooksSrc = Join-Path $env:USERPROFILE "integrations\codex\hooks\hooks.json"
  if (-not (Test-Path $src)) { return }
  $cacheRoot = Join-Path $env:USERPROFILE ".codex\plugins\cache\promptly-labs\promptly-codex"
  if (-not (Test-Path $cacheRoot)) { return }
  Get-ChildItem -Path $cacheRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    foreach ($binRel in @("bin", "codex\bin")) {
      $binDir = Join-Path $_.FullName $binRel
      $parent = Split-Path $binDir
      if (Test-Path $parent) {
        New-Item -ItemType Directory -Force -Path $binDir | Out-Null
        Copy-Item -Force $src (Join-Path $binDir "promptly-telemetry.mjs")
      }
    }
    if (Test-Path $hooksSrc) {
      foreach ($hooksRel in @("hooks", "codex\hooks")) {
        $hooksDir = Join-Path $_.FullName $hooksRel
        $parent = Split-Path $hooksDir
        if (Test-Path $parent) {
          New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null
          Copy-Item -Force $hooksSrc (Join-Path $hooksDir "hooks.json")
        }
      }
    }
  }
}

function Promptly-SyncAllAgentRuntimes {
  param([string]$Integrations = (Join-Path $env:USERPROFILE "integrations"))
  $cliSrc = Join-Path $env:USERPROFILE "integrations\packages\telemetry-cli\bin\promptly-telemetry.mjs"
  if (-not (Test-Path $cliSrc)) { return }

  foreach ($plugin in @("claude-code", "cursor", "codex")) {
    $pluginDir = Join-Path $Integrations $plugin
    if (Test-Path $pluginDir) {
      Promptly-SyncTelemetryCli -PluginDir $pluginDir
    }
  }

  Promptly-SyncClaudePluginCache
  Promptly-SyncCodexPluginCache

  $cursorDest = Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor"
  $cursorSrc = Join-Path $Integrations "cursor"
  if (Test-Path $cursorSrc) {
    if (Test-Path $cursorDest) { Remove-Item -Recurse -Force $cursorDest }
    New-Item -ItemType Directory -Force -Path (Split-Path $cursorDest) | Out-Null
    Copy-Item -Recurse -Force $cursorSrc $cursorDest
  }

  $nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $nodeExe) {
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
  }
  if ($nodeExe) {
    & $nodeExe $cliSrc sync-runtimes 2>&1 | Write-Host
  }
  Write-Host "Synced live hooks + telemetry CLI for Claude Code, Cursor, and Codex"
}

function Promptly-ClaudeMarketplaceRefresh {
  param([string]$IntegrationsPath)
  $claude = Promptly-GetAgentCliPath -Name claude
  if (-not $claude) {
    Write-Host "Claude Code CLI not found"
    exit 1
  }
  $out = & $claude plugin marketplace add $IntegrationsPath 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -and $out -notmatch 'already installed|already exists') {
    Write-Host "Failed to add marketplace: $out"
    exit 1
  }
  & $claude plugin marketplace update promptly-labs 2>$null | Out-Null
  Write-Host "Marketplace refreshed"
}

function Promptly-ClaudePluginReinstall {
  $claude = Promptly-GetAgentCliPath -Name claude
  if (-not $claude) {
    Write-Host "Claude Code CLI not found"
    exit 1
  }
  if ((& $claude plugin list 2>&1 | Out-String) -match 'promptly-claude-code') {
    Write-Host "-> Removing previous Promptly Claude Code plugin..."
    & $claude plugin uninstall promptly-claude-code@promptly-labs 2>$null
  }
  Write-Host "-> Installing fresh Promptly plugin..."
  & $claude plugin install promptly-claude-code@promptly-labs 2>&1 | Write-Host
}

function Promptly-CodexMarketplaceAdd {
  param([string]$IntegrationsPath)
  $codex = Promptly-GetAgentCliPath -Name codex
  if (-not $codex) {
    Write-Host "Codex CLI not found"
    exit 1
  }
  $out = & $codex plugin marketplace add $IntegrationsPath 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { return }
  if ($out -match 'already installed|already exists') { return }
  Write-Host "Failed to add marketplace: $out"
  exit 1
}

function Promptly-CodexPluginReinstall {
  $codex = Promptly-GetAgentCliPath -Name codex
  if (-not $codex) {
    Write-Host "Codex CLI not found"
    exit 1
  }
  if ((& $codex plugin list 2>&1 | Out-String) -match 'promptly-codex') {
    Write-Host "-> Removing previous Promptly Codex plugin..."
    & $codex plugin remove promptly-codex@promptly-labs 2>$null
  }
  Write-Host "-> Installing fresh Promptly plugin..."
  & $codex plugin add promptly-codex@promptly-labs 2>&1 | Write-Host
  if ($LASTEXITCODE -ne 0) { & $codex plugin install promptly-codex@promptly-labs 2>&1 | Write-Host }
}

function Promptly-SyncClaudeCodeCommandFiles {
  param([string]$PluginDir)
  $src = Join-Path $PluginDir "user-commands\promptly.md"
  if (-not (Test-Path $src)) {
    Write-Host "Missing Claude Code /promptly command — re-download the plugin pack"
    exit 1
  }
  $dest = Join-Path $env:USERPROFILE ".claude\commands\promptly.md"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -Force $src $dest
  $skillSrc = Join-Path $PluginDir "skill\SKILL.md"
  if (Test-Path $skillSrc) {
    $skillDestDir = Join-Path $env:USERPROFILE ".claude\skills\promptly"
    New-Item -ItemType Directory -Force -Path $skillDestDir | Out-Null
    Copy-Item -Force $skillSrc (Join-Path $skillDestDir "SKILL.md")
  }
  Write-Host "Installed /promptly for Claude Code"
}

function Promptly-SyncCursorCommandFiles {
  param([string]$PluginDir)
  $src = Join-Path $PluginDir "user-commands\promptly.md"
  if (-not (Test-Path $src)) {
    Write-Host "Missing Cursor /promptly command — re-download the plugin pack"
    exit 1
  }
  $dest = Join-Path $env:USERPROFILE ".cursor\commands\promptly.md"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -Force $src $dest
  $pluginCmd = Join-Path $PluginDir "commands\promptly.md"
  New-Item -ItemType Directory -Force -Path (Split-Path $pluginCmd) | Out-Null
  Copy-Item -Force $src $pluginCmd
  Write-Host "Installed /promptly for Cursor"
}

function Promptly-InstallCodexSkill {
  param([string]$PluginDir)
  $src = Join-Path $PluginDir "skill\SKILL.md"
  if (-not (Test-Path $src)) {
    Write-Host "Missing Codex skill file - re-download the plugin pack"
    exit 1
  }
  $destDir = Join-Path $env:USERPROFILE ".codex\skills\promptly"
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -Force $src (Join-Path $destDir "SKILL.md")
  Write-Host "Installed /promptly for Codex"
}

function Promptly-CursorPluginReinstall {
  param([string]$Integrations)
  $dest = Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor"
  Write-Host "-> Removing previous Promptly Cursor plugin..."
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE ".cursor\plugins\local") | Out-Null
  Copy-Item -Recurse -Force (Join-Path $Integrations "cursor") $dest
}

function Promptly-EnsureClaudeCli {
  return Promptly-EnsureAgentCli -Name claude -NpmPackage "@anthropic-ai/claude-code" -DisplayName "Claude Code"
}

function Promptly-EnsureCodexCli {
  return Promptly-EnsureAgentCli -Name codex -NpmPackage "@openai/codex" -DisplayName "Codex"
}

function Promptly-VerifyPluginPack {
  param([string]$Integrations)
  if (-not (Test-Path (Join-Path $Integrations ".claude-plugin\marketplace.json"))) {
    Write-Host "Plugin pack failed - retry download"
    return $false
  }
  if (-not (Test-Path (Join-Path $Integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"))) {
    Write-Host "Plugin pack missing telemetry CLI"
    return $false
  }
  if (-not (Test-Path (Join-Path $Integrations "packages\promptly-improve\bin\promptly-improve.mjs"))) {
    Write-Host "Plugin pack missing improve CLI"
    return $false
  }
  Promptly-PreparePluginPack -Integrations $Integrations
  Write-Host "Plugin pack OK"
  return $true
}

function Promptly-InstallForCursor {
  param([string]$Integrations)
  Write-Host ""
  Write-Host "=== Cursor ==="
  $source = Join-Path $Integrations "cursor"
  if (-not (Test-Path $source)) { Write-Host "Cursor plugin files missing"; return 1 }
  Promptly-PreparePluginPack -Integrations $Integrations
  Promptly-SyncTelemetryCli -PluginDir $source
  try { Promptly-SyncImproveCli -PluginDir $source } catch { }
  Promptly-CursorPluginReinstall -Integrations $Integrations
  Promptly-SyncCursorCommandFiles -PluginDir $source
  $plugin = Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor"
  $hooksPath = Join-Path $plugin "hooks\hooks.json"
  if (-not (Select-String -Path $hooksPath -Pattern 'afterAgentResponse' -Quiet)) {
    Write-Host "Cursor hooks missing afterAgentResponse"
    return 1
  }
  if (-not (Select-String -Path $hooksPath -Pattern 'hook --tool cursor' -Quiet)) {
    Write-Host "Hooks not configured for Cursor"
    return 1
  }
  if (-not (Select-String -Path $hooksPath -Pattern 'CURSOR_PLUGIN_ROOT' -Quiet)) {
    Write-Host "Cursor hooks must use `${CURSOR_PLUGIN_ROOT}/bin"
    return 1
  }
  Write-Host "Promptly installed for Cursor"
  return 0
}

function Promptly-InstallForClaudeCode {
  param([string]$Integrations)
  Write-Host ""
  Write-Host "=== Claude Code ==="
  if (-not (Promptly-EnsureClaudeCli)) { return 2 }
  $plugin = Join-Path $Integrations "claude-code"
  if (-not (Test-Path $plugin)) { Write-Host "Claude Code plugin files missing"; return 1 }
  Promptly-PreparePluginPack -Integrations $Integrations
  Promptly-SyncTelemetryCli -PluginDir $plugin
  try { Promptly-SyncImproveCli -PluginDir $plugin } catch { }
  Promptly-SyncClaudeCodeCommandFiles -PluginDir $plugin
  Promptly-ClaudeMarketplaceRefresh -IntegrationsPath $Integrations
  Promptly-ClaudePluginReinstall
  Promptly-SyncClaudePluginCache
  $claude = Promptly-GetAgentCliPath -Name claude
  $pluginList = & $claude plugin list 2>&1 | Out-String
  if ($pluginList -notmatch "promptly-claude-code") {
    Write-Host "Promptly plugin not found in claude plugin list"
    return 1
  }
  $hooksPath = Join-Path $plugin "hooks\hooks.json"
  if (-not (Select-String -Path $hooksPath -Pattern 'hook --tool claude_code' -Quiet)) {
    Write-Host "Hooks not configured for Claude Code"
    return 1
  }
  Write-Host "Promptly installed for Claude Code"
  return 0
}

function Promptly-InstallForCodex {
  param([string]$Integrations)
  Write-Host ""
  Write-Host "=== Codex ==="
  if (-not (Promptly-EnsureCodexCli)) { return 2 }
  $plugin = Join-Path $Integrations "codex"
  if (-not (Test-Path $plugin)) { Write-Host "Codex plugin files missing"; return 1 }
  Promptly-PreparePluginPack -Integrations $Integrations
  Promptly-SyncTelemetryCli -PluginDir $plugin
  try { Promptly-SyncImproveCli -PluginDir $plugin } catch { }
  Promptly-InstallCodexSkill -PluginDir $plugin
  Promptly-CodexMarketplaceAdd -IntegrationsPath $Integrations
  Promptly-CodexPluginReinstall
  Promptly-SyncCodexPluginCache
  $codex = Promptly-GetAgentCliPath -Name codex
  $pluginList = & $codex plugin list 2>&1 | Out-String
  if ($pluginList -notmatch "promptly-codex") {
    Write-Host "Promptly plugin not found in codex plugin list"
    return 1
  }
  $hooksPath = Join-Path $plugin "hooks\hooks.json"
  if (-not (Select-String -Path $hooksPath -Pattern 'UserPromptSubmit' -Quiet)) {
    Write-Host "Codex hooks missing UserPromptSubmit"
    return 1
  }
  if (-not (Select-String -Path $hooksPath -Pattern 'PLUGIN_ROOT' -Quiet)) {
    Write-Host "Codex hooks must use `${PLUGIN_ROOT}/bin"
    return 1
  }
  Write-Host "Promptly installed for Codex"
  Write-Host "  After reopening Codex, type /hooks in your project and trust Promptly hooks"
  return 0
}
