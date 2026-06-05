$ErrorActionPreference = "Stop"

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$CursorPlugin = Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor"
$ZipPath = Join-Path $env:USERPROFILE "promptly.zip"

Write-Host "-> Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Install Node.js 18+ from https://nodejs.org/ then rerun."
  exit 1
}
node --version
Write-Host "Node.js OK"

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

Write-Host ""
Write-Host "Promptly installed for Cursor"
Write-Host "  Next: connect your account on promptly-labs.com/integrations (step 2)."
