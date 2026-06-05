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
Expand-Archive -Path $ZipPath -DestinationPath $env:USERPROFILE -Force

if (-not (Test-Path (Join-Path $Integrations ".claude-plugin\marketplace.json"))) {
  Write-Host "Plugin pack failed - retry download"
  exit 1
}
Write-Host "Plugin pack OK"

Write-Host "-> Installing Promptly in Codex..."
$env:Path = "$(npm prefix -g)\bin;" + $env:Path
codex plugin marketplace add $Integrations
codex plugin add promptly-codex@promptly-labs
if ($LASTEXITCODE -ne 0) { codex plugin install promptly-codex@promptly-labs }
codex plugin list

if (-not ((codex plugin list) -match "promptly-codex")) {
  Write-Host "Promptly plugin not found - retry this step"
  exit 1
}

Write-Host ""
Write-Host "Promptly installed for Codex"
Write-Host "  If you used the one-command setup, account connect runs next automatically."
Write-Host "  Otherwise finish step 1 on promptly-labs.com/integrations, then trust hooks (step 2)."
