$ErrorActionPreference = "Stop"

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.6.12" }
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

Write-Host "-> Checking Codex CLI..."
if (-not (Promptly-EnsureCodexCli)) {
  Write-Host "Codex CLI is required for plugin install. Install it, reopen PowerShell, and rerun."
  exit 1
}
$codex = Promptly-GetAgentCliPath -Name codex

Write-Host "-> Downloading Promptly plugin pack..."
Invoke-WebRequest -Uri $PluginPackUrl -OutFile $ZipPath -UseBasicParsing
Promptly-UnzipPluginPack -ZipPath $ZipPath -Dest $env:USERPROFILE

$CodexPlugin = Join-Path $Integrations "codex"
Promptly-SyncTelemetryCli -PluginDir $CodexPlugin
try { Promptly-SyncImproveCli -PluginDir $CodexPlugin } catch { }
Promptly-InstallCodexSkill -PluginDir $CodexPlugin

Write-Host "-> Installing Promptly in Codex..."
Promptly-CodexMarketplaceAdd -IntegrationsPath $Integrations
Promptly-CodexPluginReinstall

$pluginList = & $codex plugin list 2>&1 | Out-String
if ($pluginList -notmatch "promptly-codex") {
  Write-Host "Promptly plugin not found - retry this step"
  exit 1
}

Write-Host ""
Write-Host "Promptly installed for Codex"
Write-Host "  Quit and reopen Codex, trust this project folder, enable Promptly hooks (/hooks), then send a prompt"
