$ErrorActionPreference = "Stop"

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$ZipPath = Join-Path $env:USERPROFILE "promptly.zip"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_ensure-node-windows.ps1" -UseBasicParsing).Content)
Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_install-common-windows.ps1" -UseBasicParsing).Content)
Ensure-NodeJs

$env:Path = "$(npm prefix -g)\bin;" + $env:Path

Write-Host "-> Checking Codex CLI..."
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  Write-Host "  Installing @openai/codex..."
  npm install -g @openai/codex
  $env:Path = "$(npm prefix -g)\bin;" + $env:Path
}
codex --version
Write-Host "Codex CLI ready"

Write-Host "-> Downloading Promptly plugin pack..."
Invoke-WebRequest -Uri $PluginPackUrl -OutFile $ZipPath
Promptly-UnzipPluginPack -ZipPath $ZipPath -Dest $env:USERPROFILE

if (-not (Test-Path (Join-Path $Integrations ".claude-plugin\marketplace.json"))) {
  Write-Host "Plugin pack failed - retry download"
  exit 1
}
Write-Host "Plugin pack OK"

Write-Host "-> Installing Promptly in Codex..."
$env:Path = "$(npm prefix -g)\bin;" + $env:Path
Promptly-CodexMarketplaceAdd -IntegrationsPath $Integrations
Promptly-CodexPluginReinstall
codex plugin list

if (-not ((codex plugin list) -match "promptly-codex")) {
  Write-Host "Promptly plugin not found - retry this step"
  exit 1
}

$CodexPlugin = Join-Path $Integrations "codex"
Promptly-SyncImproveCli -PluginDir $CodexPlugin
Promptly-SyncCodexCommandFiles -PluginDir $CodexPlugin
Write-Host "-> Verifying Codex plugin configuration..."
$hooksJson = Get-Content (Join-Path $CodexPlugin "hooks\hooks.json") -Raw
$mcpJson = Get-Content (Join-Path $CodexPlugin ".mcp.json") -Raw
if ($hooksJson -notmatch 'hook --tool codex') {
  Write-Host "Hooks are not configured for Codex (expected --tool codex)"
  exit 1
}
if ($mcpJson -notmatch '"PROMPTLY_TOOL": "codex"') {
  Write-Host "MCP server is not configured for Codex"
  exit 1
}
if (-not (Test-Path (Join-Path $CodexPlugin "commands\promptly.md"))) {
  Write-Host "Missing /promptly slash command file"
  exit 1
}
Write-Host "Hooks and MCP verified for Codex"

Write-Host ""
Write-Host "Promptly installed for Codex"
Write-Host "  Improve prompts with: /promptly-codex:promptly your draft here"
Write-Host "  You can also install Claude Code and Cursor on this PC - each needs its own install + pairing from promptly-labs.com/integrations."
Write-Host "  If you used the one-command setup, account connect runs next automatically."
Write-Host "  Otherwise finish step 1 on promptly-labs.com/integrations, then trust hooks (step 2)."
