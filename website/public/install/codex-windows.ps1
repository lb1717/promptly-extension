$ErrorActionPreference = "Stop"

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.7" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$ZipPath = Join-Path $env:USERPROFILE "promptly.zip"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_ensure-node-windows.ps1" -UseBasicParsing).Content)
try {
  Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_install-common-windows.ps1" -UseBasicParsing).Content)
} catch { }
Ensure-NodeJs

$env:Path = "$(npm prefix -g)\bin;" + $env:Path

Write-Host "-> Checking Codex CLI..."
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  npm install -g @openai/codex
  $env:Path = "$(npm prefix -g)\bin;" + $env:Path
}
codex --version

Write-Host "-> Downloading Promptly plugin pack..."
Invoke-WebRequest -Uri $PluginPackUrl -OutFile $ZipPath
Promptly-UnzipPluginPack -ZipPath $ZipPath -Dest $env:USERPROFILE

$CodexPlugin = Join-Path $Integrations "codex"
Promptly-SyncTelemetryCli -PluginDir $CodexPlugin
try { Promptly-SyncImproveCli -PluginDir $CodexPlugin } catch { }
Promptly-InstallCodexSkill -PluginDir $CodexPlugin

Write-Host "-> Installing Promptly in Codex..."
Promptly-CodexMarketplaceAdd -IntegrationsPath $Integrations
Promptly-CodexPluginReinstall

if (-not ((codex plugin list) -match "promptly-codex")) {
  Write-Host "Promptly plugin not found - retry this step"
  exit 1
}

Write-Host ""
Write-Host "Promptly installed for Codex"
Write-Host "  Quit and reopen Codex, trust this project folder, enable Promptly hooks (/hooks), then send a prompt"
