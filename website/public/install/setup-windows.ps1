# One command: install Promptly for Claude Code + Cursor + Codex, pair to your account, merge stats, verify live tracking.
# Usage: irm https://promptly-labs.com/install/setup-windows.ps1 | iex; Setup-PromptlyAgents -Code YOUR_CODE
param(
  [Parameter(Mandatory = $false)]
  [string]$Code = $env:PROMPTLY_PAIR_CODE
)

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.6.8" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

function Sync-PromptlyAgentRuntimes {
  param([string]$CliSrc)
  $paths = @(
    (Join-Path $env:USERPROFILE "integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"),
    (Join-Path $env:USERPROFILE "integrations/claude-code/bin/promptly-telemetry.mjs"),
    (Join-Path $env:USERPROFILE "integrations/cursor/bin/promptly-telemetry.mjs"),
    (Join-Path $env:USERPROFILE "integrations/codex/bin/promptly-telemetry.mjs"),
    (Join-Path $env:USERPROFILE ".cursor/plugins/local/promptly-cursor/bin/promptly-telemetry.mjs")
  )
  foreach ($dest in $paths) {
    $dir = Split-Path $dest
    if (Test-Path $dir) {
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
      Copy-Item -Force $CliSrc $dest
    }
  }
  $cursorSrc = Join-Path $env:USERPROFILE "integrations/cursor"
  $cursorDest = Join-Path $env:USERPROFILE ".cursor/plugins/local/promptly-cursor"
  if (Test-Path $cursorSrc) {
    if (Test-Path $cursorDest) { Remove-Item -Recurse -Force $cursorDest }
    New-Item -ItemType Directory -Force -Path (Split-Path $cursorDest) | Out-Null
    Copy-Item -Recurse -Force $cursorSrc $cursorDest
  }
}

function Setup-PromptlyAgents {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Code
  )

  if (-not $Code -or $Code.Trim().Length -lt 6) {
    Write-Host "Usage: irm ${InstallBase}/setup-windows.ps1 | iex; Setup-PromptlyAgents -Code YOUR_CODE"
    Write-Host ""
    Write-Host "Get YOUR_CODE at https://promptly-labs.com/integrations while signed into the Promptly account you want."
    exit 1
  }

  Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_ensure-node-windows.ps1" -UseBasicParsing).Content)
  try {
    Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_install-common-windows.ps1" -UseBasicParsing).Content)
  } catch {
    Write-Host "Failed to load install helpers"
    exit 1
  }
  Ensure-NodeJs

  $zipPath = Join-Path $env:USERPROFILE "promptly.zip"
  Write-Host "-> Downloading Promptly plugin pack (Claude Code, Cursor, Codex)..."
  Invoke-WebRequest -Uri $PluginPackUrl -OutFile $zipPath -UseBasicParsing
  Promptly-UnzipPluginPack -ZipPath $zipPath -Dest $env:USERPROFILE
  if (-not (Promptly-VerifyPluginPack -Integrations $Integrations)) { exit 1 }

  $installed = @()
  $skipped = @()
  $failed = @()

  function Register-AgentResult {
    param([string]$Label, [int]$ExitCode)
    if ($ExitCode -eq 0) { $script:installed += $Label }
    elseif ($ExitCode -eq 2) { $script:skipped += $Label }
    else { $script:failed += $Label }
  }

  Register-AgentResult "Cursor" (Promptly-InstallForCursor -Integrations $Integrations)
  Register-AgentResult "Claude Code" (Promptly-InstallForClaudeCode -Integrations $Integrations)
  Register-AgentResult "Codex" (Promptly-InstallForCodex -Integrations $Integrations)

  Write-Host ""
  Write-Host "Promptly all-agents install summary"
  if ($installed.Count) { Write-Host "  Installed: $($installed -join ', ')" }
  if ($skipped.Count) { Write-Host "  Skipped (CLI not available): $($skipped -join ', ')" }
  if ($failed.Count) { Write-Host "  Failed: $($failed -join ', ')" }
  Write-Host ""

  if (-not $installed.Count) { exit 1 }

  $cliDest = Join-Path $env:USERPROFILE "integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  if (-not (Test-Path $cliDest)) {
    Write-Host "X Could not install telemetry CLI from plugin pack."
    exit 1
  }

  Write-Host "-> Pairing all agents, merging stats, and verifying live uploads..."
  node $cliDest fix-account $Code

  Write-Host "-> Syncing hooks + telemetry into Claude Code, Cursor, and Codex runtimes..."
  Sync-PromptlyAgentRuntimes -CliSrc $cliDest

  Write-Host "-> Syncing AI subscription usage (Claude, Codex, Cursor)..."
  Write-Host "  First-time setup opens your browser once for claude.ai sign-in."
  node $cliDest usage-sync --login-claude
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Subscription sync incomplete — resync anytime at https://promptly-labs.com/integrations#resync-subscriptions"
  } else {
    Write-Host "Subscription usage synced — use Refresh on your stats page anytime."
  }

  Write-Host ""
  Write-Host "OK. Restart Claude Code, Cursor, and Codex if they were open, then send a test prompt."
  Write-Host "Stats: https://promptly-labs.com/account/statistics"
}

if ($Code) {
  Setup-PromptlyAgents -Code $Code
}
