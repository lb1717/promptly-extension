# Reset Promptly on this PC: one pairing code -> only account, merged stats, live tracking.
# Usage: irm https://promptly-labs.com/install/fix-account-windows.ps1 | iex; Fix-PromptlyAccount -Code YOUR_CODE
param(
  [Parameter(Mandatory = $false)]
  [string]$Code = $env:PROMPTLY_PAIR_CODE
)

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.7" }
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

function Sync-PromptlyAgentBins {
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
}

function Fix-PromptlyAccount {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Code
  )

  if (-not $Code -or $Code.Trim().Length -lt 6) {
    Write-Host "Usage: irm ${InstallBase}/fix-account-windows.ps1 | iex; Fix-PromptlyAccount -Code YOUR_CODE"
    Write-Host ""
    Write-Host "Get YOUR_CODE at https://promptly-labs.com/integrations while signed into the account you want."
    exit 1
  }

  $zipPath = Join-Path $env:TEMP "promptly-fix-account.zip"
  $extractRoot = Join-Path $env:TEMP "promptly-fix-account"
  Write-Host "-> Downloading latest Promptly plugin pack..."
  Invoke-WebRequest -Uri $PluginPackUrl -OutFile $zipPath -UseBasicParsing
  if (Test-Path $extractRoot) { Remove-Item -Recurse -Force $extractRoot }
  Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force

  $integrationsSrc = Join-Path $extractRoot "integrations"
  $integrationsDest = Join-Path $env:USERPROFILE "integrations"
  if (Test-Path $integrationsSrc) {
    Copy-Item -Recurse -Force $integrationsSrc $integrationsDest
  }

  $cliDest = Join-Path $env:USERPROFILE "integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  if (-not (Test-Path $cliDest)) {
    Write-Host "X Could not install telemetry CLI from plugin pack."
    exit 1
  }

  Write-Host "-> Fixing Promptly account (pair all agents + merge stats + verify live uploads)..."
  node $cliDest fix-account $Code

  Write-Host "-> Syncing telemetry CLI into agent install paths..."
  Sync-PromptlyAgentBins -CliSrc $cliDest

  $cursorSrc = Join-Path $env:USERPROFILE "integrations/cursor"
  $cursorDest = Join-Path $env:USERPROFILE ".cursor/plugins/local/promptly-cursor"
  if (Test-Path $cursorSrc) {
    if (Test-Path $cursorDest) { Remove-Item -Recurse -Force $cursorDest }
    New-Item -ItemType Directory -Force -Path (Split-Path $cursorDest) | Out-Null
    Copy-Item -Recurse -Force $cursorSrc $cursorDest
  }

  Write-Host ""
  Write-Host "OK. Restart Claude Code, Cursor, and Codex if they were open, then send a test prompt."
  Write-Host "Stats: https://promptly-labs.com/account/statistics"
}

if ($Code) {
  Fix-PromptlyAccount -Code $Code
}
