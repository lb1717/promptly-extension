# Alias for setup-windows.ps1 — requires a pairing code.
param(
  [Parameter(Mandatory = $false)]
  [string]$Code = $env:PROMPTLY_PAIR_CODE
)

$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

function Promptly-ImportRemoteScript {
  param([Parameter(Mandatory)][string]$Uri)
  $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing
  $text = $response.Content
  if ($text -is [byte[]]) {
    $text = [System.Text.Encoding]::UTF8.GetString($text)
  }
  Invoke-Expression ([string]$text)
}

if (-not $Code) {
  Write-Host "Get a pairing code at https://promptly-labs.com/integrations, then run:"
  Write-Host "  irm ${InstallBase}/setup-windows.ps1 | iex; Setup-PromptlyAgents -Code YOUR_CODE"
  exit 1
}

Promptly-ImportRemoteScript -Uri "$InstallBase/setup-windows.ps1"
Setup-PromptlyAgents -Code $Code
