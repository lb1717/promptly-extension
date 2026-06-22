# Install Promptly Companion desktop app (Windows).
param()

$ErrorActionPreference = "Stop"
$env:PROMPTLY_QUIET = "1"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }
$ApiUrl = "https://promptly-labs.com/api/companion/download"
$Fallback = "https://github.com/lb1717/promptly-extension/releases/download/companion-v0.2.2/Promptly-Companion-0.2.2-win.exe"

$loaderRes = Invoke-WebRequest -Uri "$InstallBase/_load-helpers-windows.ps1" -UseBasicParsing
$loaderText = $loaderRes.Content
if ($loaderText -is [byte[]]) {
  $loaderText = [System.Text.Encoding]::UTF8.GetString($loaderText)
}
Invoke-Expression ([string]$loaderText.TrimStart([char]0xFEFF))

Promptly-InstallCompanionWindows
Write-Host "Promptly Successfully Installed"
