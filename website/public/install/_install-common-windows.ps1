function Promptly-UnzipPluginPack {
  param(
    [string]$ZipPath = (Join-Path $env:USERPROFILE "promptly.zip"),
    [string]$Dest = $env:USERPROFILE
  )
  Expand-Archive -Path $ZipPath -DestinationPath $Dest -Force
}

function Promptly-ClaudeMarketplaceAdd {
  param([string]$IntegrationsPath)
  $out = claude plugin marketplace add $IntegrationsPath 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Marketplace added"
    return
  }
  if ($out -match 'already installed|already exists') {
    Write-Host "Marketplace promptly-labs already installed (refreshing from ~/integrations)"
    return
  }
  Write-Host "Failed to add marketplace: $out"
  exit 1
}

function Promptly-ClaudeMarketplaceRefresh {
  param([string]$IntegrationsPath)
  Promptly-ClaudeMarketplaceAdd -IntegrationsPath $IntegrationsPath
  $out = claude plugin marketplace update promptly-labs 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Marketplace refreshed"
    return
  }
  Write-Host "Marketplace update skipped: $out"
}

function Promptly-ClaudePluginReinstall {
  if ((claude plugin list 2>&1 | Out-String) -match 'promptly-claude-code') {
    Write-Host "-> Removing previous Promptly plugin..."
    claude plugin uninstall promptly-claude-code@promptly-labs 2>$null
  }
  Write-Host "-> Installing fresh Promptly plugin..."
  claude plugin install promptly-claude-code@promptly-labs
}

function Promptly-CodexMarketplaceAdd {
  param([string]$IntegrationsPath)
  $out = codex plugin marketplace add $IntegrationsPath 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Marketplace added"
    return
  }
  if ($out -match 'already installed|already exists') {
    Write-Host "Marketplace promptly-labs already installed (using updated files from ~/integrations)"
    return
  }
  Write-Host "Failed to add marketplace: $out"
  exit 1
}

function Promptly-CodexPluginReinstall {
  if ((codex plugin list 2>&1 | Out-String) -match 'promptly-codex') {
    Write-Host "-> Removing previous Promptly plugin..."
    codex plugin remove promptly-codex@promptly-labs 2>$null
    if ($LASTEXITCODE -ne 0) {
      codex plugin remove promptly-codex --marketplace promptly-labs 2>$null
    }
  }
  Write-Host "-> Installing fresh Promptly plugin..."
  codex plugin add promptly-codex@promptly-labs
  if ($LASTEXITCODE -ne 0) { codex plugin install promptly-codex@promptly-labs }
}

function Promptly-SyncCodexCommandFiles {
  param([string]$PluginDir)
  $commandsDir = Join-Path $PluginDir "commands"
  New-Item -ItemType Directory -Force -Path $commandsDir | Out-Null
  $commandFile = Join-Path $commandsDir "promptly.md"
  @'
---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "${PLUGIN_ROOT}/bin/promptly-improve.mjs" --tool codex "$ARGUMENTS"`
'@ | Set-Content -Path $commandFile -Encoding UTF8
  Write-Host "Synced slash command files"
}

function Promptly-SyncClaudeCodeCommandFiles {
  param([string]$PluginDir)
  $commandsDir = Join-Path $PluginDir "commands"
  $userCommandsDir = Join-Path $PluginDir "user-commands"
  New-Item -ItemType Directory -Force -Path $commandsDir, $userCommandsDir | Out-Null
  @'
---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`
'@ | Set-Content -Path (Join-Path $commandsDir "promptly.md") -Encoding UTF8
  @'
---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "$HOME/integrations/claude-code/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`
'@ | Set-Content -Path (Join-Path $userCommandsDir "promptly.md") -Encoding UTF8
  Write-Host "Synced slash command files"
}

function Promptly-SyncImproveCli {
  param([string]$PluginDir)
  $src = Join-Path $env:USERPROFILE "integrations\packages\promptly-improve\bin\promptly-improve.mjs"
  $dest = Join-Path $PluginDir "bin\promptly-improve.mjs"
  if (Test-Path $src) {
    New-Item -ItemType Directory -Force -Path (Join-Path $PluginDir "bin") | Out-Null
    Copy-Item -Force $src $dest
    return
  }
  if (Test-Path $dest) { return }
  Write-Host "Missing promptly-improve.mjs - re-download the plugin pack"
  exit 1
}
