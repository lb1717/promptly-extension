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
  & $claude plugin install promptly-claude-code@promptly-labs
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
  & $codex plugin add promptly-codex@promptly-labs
  if ($LASTEXITCODE -ne 0) { & $codex plugin install promptly-codex@promptly-labs }
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
  Write-Host "Plugin pack OK"
  return $true
}

function Promptly-InstallForCursor {
  param([string]$Integrations)
  Write-Host ""
  Write-Host "=== Cursor ==="
  $source = Join-Path $Integrations "cursor"
  if (-not (Test-Path $source)) { Write-Host "Cursor plugin files missing"; return 1 }
  Promptly-SyncTelemetryCli -PluginDir $source
  try { Promptly-SyncImproveCli -PluginDir $source } catch { }
  Promptly-CursorPluginReinstall -Integrations $Integrations
  Promptly-SyncCursorCommandFiles -PluginDir $source
  $plugin = Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor"
  if (-not (Select-String -Path (Join-Path $plugin "hooks\hooks.json") -Pattern 'hook --tool cursor' -Quiet)) {
    Write-Host "Hooks not configured for Cursor"
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
  Promptly-SyncTelemetryCli -PluginDir $plugin
  try { Promptly-SyncImproveCli -PluginDir $plugin } catch { }
  Promptly-SyncClaudeCodeCommandFiles -PluginDir $plugin
  Promptly-ClaudeMarketplaceRefresh -IntegrationsPath $Integrations
  Promptly-ClaudePluginReinstall
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
  Promptly-SyncTelemetryCli -PluginDir $plugin
  try { Promptly-SyncImproveCli -PluginDir $plugin } catch { }
  Promptly-InstallCodexSkill -PluginDir $plugin
  Promptly-CodexMarketplaceAdd -IntegrationsPath $Integrations
  Promptly-CodexPluginReinstall
  Write-Host "Promptly installed for Codex"
  return 0
}
