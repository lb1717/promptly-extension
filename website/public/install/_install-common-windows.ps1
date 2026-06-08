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
  $out = claude plugin marketplace add $IntegrationsPath 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -and $out -notmatch 'already installed|already exists') {
    Write-Host "Failed to add marketplace: $out"
    exit 1
  }
  claude plugin marketplace update promptly-labs 2>$null | Out-Null
  Write-Host "Marketplace refreshed"
}

function Promptly-ClaudePluginReinstall {
  if ((claude plugin list 2>&1 | Out-String) -match 'promptly-claude-code') {
    Write-Host "-> Removing previous Promptly Claude Code plugin..."
    claude plugin uninstall promptly-claude-code@promptly-labs 2>$null
  }
  Write-Host "-> Installing fresh Promptly plugin..."
  claude plugin install promptly-claude-code@promptly-labs
}

function Promptly-CodexMarketplaceAdd {
  param([string]$IntegrationsPath)
  $out = codex plugin marketplace add $IntegrationsPath 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { return }
  if ($out -match 'already installed|already exists') { return }
  Write-Host "Failed to add marketplace: $out"
  exit 1
}

function Promptly-CodexPluginReinstall {
  if ((codex plugin list 2>&1 | Out-String) -match 'promptly-codex') {
    Write-Host "-> Removing previous Promptly Codex plugin..."
    codex plugin remove promptly-codex@promptly-labs 2>$null
  }
  Write-Host "-> Installing fresh Promptly plugin..."
  codex plugin add promptly-codex@promptly-labs
  if ($LASTEXITCODE -ne 0) { codex plugin install promptly-codex@promptly-labs }
}

function Promptly-SyncClaudeCodeCommandFiles {
  param([string]$PluginDir)
  $content = @'
---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "$HOME/integrations/claude-code/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`
'@
  New-Item -ItemType Directory -Force -Path (Join-Path $PluginDir "user-commands") | Out-Null
  $dest = Join-Path $env:USERPROFILE ".claude\commands\promptly.md"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  $content | Set-Content -Path $dest -Encoding UTF8
  Write-Host "Installed /promptly for Claude Code"
}

function Promptly-SyncCursorCommandFiles {
  param([string]$PluginDir)
  $content = @'
---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
---

Run Promptly improve and reply with **only** the improved prompt (no preamble):

```bash
node "$env:USERPROFILE/integrations/cursor/bin/promptly-improve.mjs" --tool cursor "$ARGUMENTS"
```

Draft:

$ARGUMENTS
'@
  $dest = Join-Path $env:USERPROFILE ".cursor\commands\promptly.md"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  $content | Set-Content -Path $dest -Encoding UTF8
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
