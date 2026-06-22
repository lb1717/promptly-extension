# Reset Promptly on this PC: one pairing code -> only account, merged stats, live tracking.
# Usage: irm https://promptly-labs.com/install/fix-account-windows.ps1 | iex; Fix-PromptlyAccount -Code YOUR_CODE
param(
  [Parameter(Mandatory = $false)]
  [string]$Code = $env:PROMPTLY_PAIR_CODE
)

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.13" }
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

$__loaderRes = Invoke-WebRequest -Uri "$InstallBase/_load-helpers-windows.ps1" -UseBasicParsing
$__loaderText = $__loaderRes.Content
if ($__loaderText -is [byte[]]) {
  $__loaderText = [System.Text.Encoding]::UTF8.GetString($__loaderText)
}
Invoke-Expression ([string]$__loaderText.TrimStart([char]0xFEFF))
if (-not (Get-Command Promptly-SyncAllAgentRuntimes -ErrorAction SilentlyContinue)) {
  Write-Host "X Failed to load Promptly install helpers from $InstallBase"
  exit 1
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

  Ensure-NodeJs
  Promptly-RefreshNpmPath

  Write-Host "-> Fixing Promptly account (pair all agents + merge stats + verify live uploads)..."
  Promptly-RunNode -Args @($cliDest, "fix-account", $Code)

  Write-Host "-> Syncing hooks, Codex transcript watcher, and telemetry CLIs..."
  Promptly-SyncAllAgentRuntimes -Integrations $integrationsDest

  Write-Host ""
  Write-Host "OK. Restart Claude Code, Cursor, and Codex if they were open, then send a test prompt."
  Write-Host "Codex Windows: no /hooks command — hooks are pre-trusted; transcript watcher runs in background."
  Write-Host "Stats: https://promptly-labs.com/account/statistics"
}

if ($Code) {
  Fix-PromptlyAccount -Code $Code
}
