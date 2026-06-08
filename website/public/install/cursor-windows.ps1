$ErrorActionPreference = "Stop"

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$CursorPlugin = Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor"
$ZipPath = Join-Path $env:USERPROFILE "promptly.zip"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_ensure-node-windows.ps1" -UseBasicParsing).Content)
Ensure-NodeJs

Write-Host "-> Downloading Promptly plugin pack..."
Invoke-WebRequest -Uri $PluginPackUrl -OutFile $ZipPath
Expand-Archive -Path $ZipPath -DestinationPath $env:USERPROFILE -Force

if (-not (Test-Path (Join-Path $Integrations ".claude-plugin\marketplace.json"))) {
  Write-Host "Plugin pack failed - retry download"
  exit 1
}
Write-Host "Plugin pack OK"

Write-Host "-> Installing Cursor plugin..."
New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE ".cursor\plugins\local") | Out-Null
if (Test-Path $CursorPlugin) { Remove-Item -Recurse -Force $CursorPlugin }
Copy-Item -Recurse -Force (Join-Path $Integrations "cursor") $CursorPlugin

if (-not (Test-Path (Join-Path $CursorPlugin ".cursor-plugin"))) {
  Write-Host "Cursor plugin copy failed"
  exit 1
}

Write-Host "-> Verifying Cursor plugin configuration..."
$hooksJson = Get-Content (Join-Path $CursorPlugin "hooks\hooks.json") -Raw
$mcpJson = Get-Content (Join-Path $CursorPlugin "mcp.json") -Raw
if ($hooksJson -notmatch 'hook --tool cursor') {
  Write-Host "Hooks are not configured for Cursor (expected --tool cursor)"
  exit 1
}
if ($mcpJson -notmatch '"PROMPTLY_TOOL": "cursor"') {
  Write-Host "MCP server is not configured for Cursor"
  exit 1
}
if (-not (Test-Path (Join-Path $CursorPlugin "commands\promptly.md"))) {
  Write-Host "Missing /promptly slash command file"
  exit 1
}
Write-Host "Hooks and MCP verified for Cursor"

Write-Host "-> Installing /promptly slash command..."
$CursorCommands = Join-Path $env:USERPROFILE ".cursor\commands"
New-Item -ItemType Directory -Force -Path $CursorCommands | Out-Null
Copy-Item -Force (Join-Path $CursorPlugin "user-commands\promptly.md") (Join-Path $CursorCommands "promptly.md")
Write-Host "Type /promptly in Cursor chat (reload window if it does not appear)"

Write-Host ""
Write-Host "Promptly installed for Cursor"
Write-Host "  You can also install Claude Code and Codex on this PC - each needs its own install + pairing from promptly-labs.com/integrations."
Write-Host "  If you used the one-command setup, account connect runs next automatically."
Write-Host "  Otherwise finish step 1 on promptly-labs.com/integrations, then trust hooks (step 2)."
