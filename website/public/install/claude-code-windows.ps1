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

Write-Host "-> Checking Claude Code CLI..."
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  npm install -g @anthropic-ai/claude-code
  $env:Path = "$(npm prefix -g)\bin;" + $env:Path
}
claude --version

Write-Host "-> Downloading Promptly plugin pack..."
Invoke-WebRequest -Uri $PluginPackUrl -OutFile $ZipPath
Promptly-UnzipPluginPack -ZipPath $ZipPath -Dest $env:USERPROFILE

$ClaudePlugin = Join-Path $Integrations "claude-code"
Promptly-SyncTelemetryCli -PluginDir $ClaudePlugin
try { Promptly-SyncImproveCli -PluginDir $ClaudePlugin } catch { }
Promptly-SyncClaudeCodeCommandFiles -PluginDir $ClaudePlugin

Write-Host "-> Installing Promptly in Claude Code..."
Promptly-ClaudeMarketplaceRefresh -IntegrationsPath $Integrations
Promptly-ClaudePluginReinstall

if (-not ((claude plugin list) -match "promptly-claude-code")) {
  Write-Host "Promptly plugin not found - retry this step"
  exit 1
}

Write-Host ""
Write-Host "Promptly installed for Claude Code"
Write-Host "  Run /reload-plugins once, then type: /promptly your draft here"
