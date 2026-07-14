# One command: coding agents + stats tracking + Promptly desktop app (Windows).
# Usage: irm https://promptly-labs.com/install/full-setup-windows.ps1 | iex; Setup-PromptlyFull -Code YOUR_CODE
param(
  [Parameter(Mandatory = $false)]
  [string]$Code = $env:PROMPTLY_PAIR_CODE
)

$env:PROMPTLY_QUIET = if ($env:PROMPTLY_QUIET) { $env:PROMPTLY_QUIET } else { "1" }
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

$loaderRes = Invoke-WebRequest -Uri "$InstallBase/_load-helpers-windows.ps1" -UseBasicParsing
$loaderText = $loaderRes.Content
if ($loaderText -is [byte[]]) {
  $loaderText = [System.Text.Encoding]::UTF8.GetString($loaderText)
}
Invoke-Expression ([string]$loaderText.TrimStart([char]0xFEFF))

function Setup-PromptlyFull {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Code
  )

  if (-not $Code -or $Code.Trim().Length -lt 6) {
    Write-Host "Usage: irm ${InstallBase}/full-setup-windows.ps1 | iex; Setup-PromptlyFull -Code YOUR_CODE"
    Write-Host ""
    Write-Host "Get YOUR_CODE at https://promptly-labs.com/integrations while signed into the Promptly account you want."
    exit 1
  }

  Promptly-SetupAgents -PairCode $Code -SuppressSuccessLine
  Promptly-PrintInstallSuccess
}

if ($Code) {
  Setup-PromptlyFull -Code $Code
}
