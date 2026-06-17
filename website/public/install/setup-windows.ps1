# One command: install Promptly for Claude Code + Cursor + Codex, pair to your account, merge stats, verify live tracking.
# Usage: irm https://promptly-labs.com/install/setup-windows.ps1 | iex; Setup-PromptlyAgents -Code YOUR_CODE
param(
  [Parameter(Mandatory = $false)]
  [string]$Code = $env:PROMPTLY_PAIR_CODE
)

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.6.16" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

# Load shared helpers at script scope (must not run inside a function).
$__loaderRes = Invoke-WebRequest -Uri "$InstallBase/_load-helpers-windows.ps1" -UseBasicParsing
$__loaderText = $__loaderRes.Content
if ($__loaderText -is [byte[]]) {
  $__loaderText = [System.Text.Encoding]::UTF8.GetString($__loaderText)
}
Invoke-Expression ([string]$__loaderText.TrimStart([char]0xFEFF))
if (-not (Get-Command Promptly-UnzipPluginPack -ErrorAction SilentlyContinue)) {
  Write-Host "X Failed to load Promptly install helpers from $InstallBase"
  exit 1
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

  if (-not (Get-Command Ensure-NodeJs -ErrorAction SilentlyContinue)) {
    Write-Host "X Install helpers are missing. Re-run: irm ${InstallBase}/setup-windows.ps1 | iex"
    exit 1
  }

  Ensure-NodeJs

  $zipPath = Join-Path $env:USERPROFILE "promptly.zip"
  Write-Host "-> Downloading Promptly plugin pack (Claude Code, Cursor, Codex)..."
  Invoke-WebRequest -Uri $PluginPackUrl -OutFile $zipPath -UseBasicParsing
  Promptly-UnzipPluginPack -ZipPath $zipPath -Dest $env:USERPROFILE
  if (-not (Promptly-VerifyPluginPack -Integrations $Integrations)) {
    Promptly-PrintInstallDebugReport -Integrations $Integrations -PairCode $Code
    exit 1
  }

  $summary = Promptly-InstallAllAgentsWithSummary -Integrations $Integrations
  Promptly-FinalizeWithPairCodeAndDebug -Code $Code -Integrations $Integrations -InstallSummary $summary
}

if ($Code) {
  Setup-PromptlyAgents -Code $Code
}
