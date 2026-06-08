$ErrorActionPreference = "Stop"

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$ZipPath = Join-Path $env:USERPROFILE "promptly.zip"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_ensure-node-windows.ps1" -UseBasicParsing).Content)
Ensure-NodeJs

$env:Path = "$(npm prefix -g)\bin;" + $env:Path

Write-Host "-> Checking Claude Code CLI..."
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host "  Installing @anthropic-ai/claude-code..."
  npm install -g @anthropic-ai/claude-code
  $env:Path = "$(npm prefix -g)\bin;" + $env:Path
}
claude --version
Write-Host "Claude Code CLI ready"

Write-Host "-> Downloading Promptly plugin pack..."
Invoke-WebRequest -Uri $PluginPackUrl -OutFile $ZipPath
Expand-Archive -Path $ZipPath -DestinationPath $env:USERPROFILE -Force

if (-not (Test-Path (Join-Path $Integrations ".claude-plugin\marketplace.json"))) {
  Write-Host "Plugin pack failed - retry download"
  exit 1
}
Write-Host "Plugin pack OK"

Write-Host "-> Installing Promptly in Claude Code..."
$env:Path = "$(npm prefix -g)\bin;" + $env:Path
claude plugin marketplace add $Integrations
claude plugin install promptly-claude-code@promptly-labs
claude plugin list

if (-not ((claude plugin list) -match "promptly-claude-code")) {
  Write-Host "Promptly plugin not found - retry this step"
  exit 1
}

$ClaudePlugin = Join-Path $Integrations "claude-code"
Write-Host "-> Verifying Claude Code plugin configuration..."
$hooksJson = Get-Content (Join-Path $ClaudePlugin "hooks\hooks.json") -Raw
$mcpJson = Get-Content (Join-Path $ClaudePlugin ".mcp.json") -Raw
if ($hooksJson -notmatch 'hook --tool claude_code') {
  Write-Host "Hooks are not configured for Claude Code (expected --tool claude_code)"
  exit 1
}
if ($mcpJson -notmatch '"PROMPTLY_TOOL": "claude_code"') {
  Write-Host "MCP server is not configured for Claude Code"
  exit 1
}
Write-Host "Hooks and MCP verified for Claude Code"

Write-Host ""
Write-Host "Promptly installed for Claude Code"
Write-Host "  You can also install Cursor and Codex on this PC - each needs its own install + pairing from promptly-labs.com/integrations."
Write-Host "  If you used the one-command setup, account connect runs next automatically."
Write-Host "  Otherwise finish step 1 on promptly-labs.com/integrations, then trust hooks (step 2)."
