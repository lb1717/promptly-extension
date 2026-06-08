$ErrorActionPreference = "Stop"

function Write-CodexCommandFile {
  param([string]$PluginDir)
  $commandsDir = Join-Path $PluginDir "commands"
  New-Item -ItemType Directory -Force -Path $commandsDir | Out-Null
  @'
---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "${PLUGIN_ROOT}/bin/promptly-improve.mjs" --tool codex "$ARGUMENTS"`
'@ | Set-Content -Path (Join-Path $commandsDir "promptly.md") -Encoding UTF8
}

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$ZipPath = Join-Path $env:USERPROFILE "promptly.zip"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_ensure-node-windows.ps1" -UseBasicParsing).Content)
try {
  Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_install-common-windows.ps1" -UseBasicParsing).Content)
} catch {
  Write-Host "Install helpers unavailable, using built-in fallback"
}
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
if (Get-Command Promptly-UnzipPluginPack -ErrorAction SilentlyContinue) {
  Promptly-UnzipPluginPack -ZipPath $ZipPath -Dest $env:USERPROFILE
} else {
  Expand-Archive -Path $ZipPath -DestinationPath $env:USERPROFILE -Force
}

if (-not (Test-Path (Join-Path $Integrations ".claude-plugin\marketplace.json"))) {
  Write-Host "Plugin pack failed - retry download"
  exit 1
}
Write-Host "Plugin pack OK"

Write-Host "-> Installing Promptly in Codex..."
$env:Path = "$(npm prefix -g)\bin;" + $env:Path
if (Get-Command Promptly-CodexMarketplaceAdd -ErrorAction SilentlyContinue) {
  Promptly-CodexMarketplaceAdd -IntegrationsPath $Integrations
  Promptly-CodexPluginReinstall
} else {
  codex plugin marketplace add $Integrations 2>$null
  if ((codex plugin list 2>&1 | Out-String) -match "promptly-codex") {
    codex plugin remove promptly-codex@promptly-labs 2>$null
  }
  codex plugin add promptly-codex@promptly-labs
  if ($LASTEXITCODE -ne 0) { codex plugin install promptly-codex@promptly-labs }
}
codex plugin list

if (-not ((codex plugin list) -match "promptly-codex")) {
  Write-Host "Promptly plugin not found - retry this step"
  exit 1
}

$CodexPlugin = Join-Path $Integrations "codex"

if (Get-Command Promptly-SyncCodexCommandFiles -ErrorAction SilentlyContinue) {
  Promptly-SyncCodexCommandFiles -PluginDir $CodexPlugin
} else {
  Write-CodexCommandFile -PluginDir $CodexPlugin
  Write-Host "Synced slash command files"
}

if (Get-Command Promptly-SyncImproveCli -ErrorAction SilentlyContinue) {
  try { Promptly-SyncImproveCli -PluginDir $CodexPlugin } catch { }
} else {
  $src = Join-Path $env:USERPROFILE "integrations\packages\promptly-improve\bin\promptly-improve.mjs"
  if (Test-Path $src) {
    New-Item -ItemType Directory -Force -Path (Join-Path $CodexPlugin "bin") | Out-Null
    Copy-Item -Force $src (Join-Path $CodexPlugin "bin\promptly-improve.mjs")
  }
}

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
  Write-CodexCommandFile -PluginDir $CodexPlugin
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
