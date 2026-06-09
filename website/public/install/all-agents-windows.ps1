$ErrorActionPreference = "Stop"

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.1" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$ZipPath = Join-Path $env:USERPROFILE "promptly.zip"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_ensure-node-windows.ps1" -UseBasicParsing).Content)
try {
  Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_install-common-windows.ps1" -UseBasicParsing).Content)
} catch {
  Write-Host "Failed to load install helpers"
  exit 1
}
Ensure-NodeJs

Write-Host "-> Downloading Promptly plugin pack (Claude Code, Cursor, Codex)..."
Invoke-WebRequest -Uri $PluginPackUrl -OutFile $ZipPath
Promptly-UnzipPluginPack -ZipPath $ZipPath -Dest $env:USERPROFILE
if (-not (Promptly-VerifyPluginPack -Integrations $Integrations)) { exit 1 }

$installed = @()
$skipped = @()
$failed = @()

function Register-AgentResult {
  param([string]$Label, [int]$Code)
  if ($Code -eq 0) { $script:installed += $Label }
  elseif ($Code -eq 2) { $script:skipped += $Label }
  else { $script:failed += $Label }
}

Register-AgentResult "Cursor" (Promptly-InstallForCursor -Integrations $Integrations)
Register-AgentResult "Claude Code" (Promptly-InstallForClaudeCode -Integrations $Integrations)
Register-AgentResult "Codex" (Promptly-InstallForCodex -Integrations $Integrations)

Write-Host ""
Write-Host "Promptly all-agents install summary"
if ($installed.Count) { Write-Host "  Installed: $($installed -join ', ')" }
if ($skipped.Count) { Write-Host "  Skipped (CLI not available): $($skipped -join ', ')" }
if ($failed.Count) { Write-Host "  Failed: $($failed -join ', ')" }
Write-Host ""
Write-Host "Next: pair each agent on the integrations page (one pairing code per agent)."

if (-not $installed.Count) { exit 1 }
