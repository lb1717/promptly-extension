# Reset Promptly on this PC: one pairing code -> only account, all agents, merged stats.
# Usage: irm https://promptly-labs.com/install/fix-account-windows.ps1 | iex; Fix-PromptlyAccount -Code YOUR_CODE
param(
  [Parameter(Mandatory = $false)]
  [string]$Code = $env:PROMPTLY_PAIR_CODE
)

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.6" }
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

function Fix-PromptlyAccount {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Code
  )

  if (-not $Code -or $Code.Trim().Length -lt 6) {
    Write-Host "Usage: irm ${InstallBase}/fix-account-windows.ps1 | iex; Fix-PromptlyAccount -Code YOUR_CODE"
    Write-Host ""
    Write-Host "Get YOUR_CODE at https://promptly-labs.com/integrations while signed into the account you want."
    exit 1
  }

  $zipPath = Join-Path $env:TEMP "promptly-fix-account.zip"
  $extractRoot = Join-Path $env:TEMP "promptly-fix-account"
  Write-Host "-> Downloading latest Promptly telemetry CLI..."
  Invoke-WebRequest -Uri $PluginPackUrl -OutFile $zipPath -UseBasicParsing
  if (Test-Path $extractRoot) { Remove-Item -Recurse -Force $extractRoot }
  Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force

  $cliSrc = Join-Path $extractRoot "integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  if (-not (Test-Path $cliSrc)) {
    Write-Host "X Could not extract telemetry CLI from plugin pack."
    exit 1
  }

  $cliDest = Join-Path $env:USERPROFILE "integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  New-Item -ItemType Directory -Force -Path (Split-Path $cliDest) | Out-Null
  Copy-Item -Force $cliSrc $cliDest

  foreach ($agentBin in @(
      (Join-Path $env:USERPROFILE "integrations/claude-code/bin/promptly-telemetry.mjs"),
      (Join-Path $env:USERPROFILE "integrations/cursor/bin/promptly-telemetry.mjs"),
      (Join-Path $env:USERPROFILE "integrations/codex/bin/promptly-telemetry.mjs")
    )) {
    $dir = Split-Path $agentBin
    if (Test-Path $dir) { Copy-Item -Force $cliSrc $agentBin }
  }

  Write-Host "-> Fixing Promptly account on this computer..."
  node $cliDest fix-account $Code
}

if ($Code) {
  Fix-PromptlyAccount -Code $Code
}
