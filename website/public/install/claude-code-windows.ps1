$ErrorActionPreference = "Stop"

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.14" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$ZipPath = Join-Path $env:USERPROFILE "promptly.zip"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

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

Ensure-NodeJs
Promptly-RefreshNpmPath

Write-Host "-> Checking Claude Code CLI..."
if (-not (Promptly-EnsureClaudeCli)) {
  Write-Host "Claude Code CLI is required for plugin install. Install it, reopen PowerShell, and rerun."
  exit 1
}
$claude = Promptly-GetAgentCliPath -Name claude

Write-Host "-> Downloading Promptly plugin pack..."
Invoke-WebRequest -Uri $PluginPackUrl -OutFile $ZipPath -UseBasicParsing
Promptly-UnzipPluginPack -ZipPath $ZipPath -Dest $env:USERPROFILE

$ClaudePlugin = Join-Path $Integrations "claude-code"
Promptly-SyncTelemetryCli -PluginDir $ClaudePlugin
try { Promptly-SyncImproveCli -PluginDir $ClaudePlugin } catch { }
Promptly-SyncClaudeCodeCommandFiles -PluginDir $ClaudePlugin

Write-Host "-> Installing Promptly in Claude Code..."
Promptly-ClaudeMarketplaceRefresh -IntegrationsPath $Integrations
Promptly-ClaudePluginReinstall

$pluginList = & $claude plugin list 2>&1 | Out-String
if ($pluginList -notmatch "promptly-claude-code") {
  Write-Host "Promptly plugin not found - retry this step"
  exit 1
}

Promptly-SyncClaudePluginCache | Out-Null
$telemetryCli = Join-Path $Integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"
if (Test-Path $telemetryCli) {
  Write-Host "-> Syncing telemetry into Claude Code plugin cache..."
  Promptly-RunNode -Args @($telemetryCli, "sync-runtimes") -AllowFailure | Out-Null
}

Write-Host ""
Write-Host "Promptly installed for Claude Code"
Write-Host "  After pairing: run /reload-plugins once, then send a test prompt."
