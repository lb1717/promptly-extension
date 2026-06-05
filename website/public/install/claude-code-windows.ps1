$ErrorActionPreference = "Stop"

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$ZipPath = Join-Path $env:USERPROFILE "promptly.zip"

Write-Host "-> Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Install Node.js 18+ from https://nodejs.org/ then rerun."
  exit 1
}
node --version
Write-Host "Node.js OK"

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

Write-Host ""
Write-Host "Promptly plugin pack ready for Claude Code"
Write-Host "  Next: in Claude Code run /plugin marketplace add and select this folder:"
Write-Host "  $Integrations"
