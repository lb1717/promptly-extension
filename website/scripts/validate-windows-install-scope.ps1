# Smoke-test that Windows install helpers load into session scope (run on Windows PowerShell).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File website/scripts/validate-windows-install-scope.ps1
$ErrorActionPreference = "Stop"

$installDir = (Resolve-Path (Join-Path $PSScriptRoot "..\public\install")).Path

Invoke-Expression (Get-Content -Raw -Path (Join-Path $installDir "_ensure-node-windows.ps1"))
Invoke-Expression (Get-Content -Raw -Path (Join-Path $installDir "_install-common-windows.ps1"))

if (-not (Get-Command Ensure-NodeJs -ErrorAction SilentlyContinue)) {
  throw "Ensure-NodeJs was not defined in session scope"
}
if (-not (Get-Command Promptly-UnzipPluginPack -ErrorAction SilentlyContinue)) {
  throw "Promptly-UnzipPluginPack was not defined in session scope"
}
if (-not (Get-Command Promptly-InstallForCursor -ErrorAction SilentlyContinue)) {
  throw "Promptly-InstallForCursor was not defined in session scope"
}
if (-not (Get-Command Promptly-FinalizeWithPairCode -ErrorAction SilentlyContinue)) {
  throw "Promptly-FinalizeWithPairCode was not defined in session scope"
}
if (-not (Get-Command Promptly-InstallAllAgents -ErrorAction SilentlyContinue)) {
  throw "Promptly-InstallAllAgents was not defined in session scope"
}

$setupText = Get-Content -Raw -Path (Join-Path $installDir "setup-windows.ps1")
if ($setupText -notmatch '_load-helpers-windows\.ps1') {
  throw "setup-windows.ps1 must load helpers at script scope"
}
if ($setupText -match 'function Setup-PromptlyAgents[\s\S]*Invoke-Expression[\s\S]*_ensure-node-windows') {
  throw "setup-windows.ps1 must not load remote helpers inside Setup-PromptlyAgents"
}

Write-Host "OK Windows install scope checks passed."
