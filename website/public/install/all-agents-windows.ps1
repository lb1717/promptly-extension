# Alias for setup-windows.ps1 — requires a pairing code.
param(
  [Parameter(Mandatory = $false)]
  [string]$Code = $env:PROMPTLY_PAIR_CODE
)

$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

if (-not $Code) {
  Write-Host "Get a pairing code at https://promptly-labs.com/integrations, then run:"
  Write-Host "  irm ${InstallBase}/setup-windows.ps1 | iex; Setup-PromptlyAgents -Code YOUR_CODE"
  exit 1
}

$__setupRes = Invoke-WebRequest -Uri "$InstallBase/setup-windows.ps1" -UseBasicParsing
$__setupText = $__setupRes.Content
if ($__setupText -is [byte[]]) {
  $__setupText = [System.Text.Encoding]::UTF8.GetString($__setupText)
}
Invoke-Expression ([string]$__setupText.TrimStart([char]0xFEFF))

if (-not (Get-Command Setup-PromptlyAgents -ErrorAction SilentlyContinue)) {
  Write-Host "X Failed to load setup script from $InstallBase"
  exit 1
}

Setup-PromptlyAgents -Code $Code
