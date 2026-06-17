# Loaded via Invoke-Expression at script scope (not inside a function).
# Defines Ensure-NodeJs and Promptly-* install helpers in the caller's session.
if (-not $InstallBase) {
  $InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }
}
$script:InstallBase = $InstallBase

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

function __Promptly-FetchScriptText {
  param([Parameter(Mandatory)][string]$Uri)
  $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing
  $text = $response.Content
  if ($text -is [byte[]]) {
    $text = [System.Text.Encoding]::UTF8.GetString($text)
  }
  return ([string]$text).TrimStart([char]0xFEFF)
}

if (-not (Get-Command Ensure-NodeJs -ErrorAction SilentlyContinue)) {
  Invoke-Expression (__Promptly-FetchScriptText -Uri "$InstallBase/_ensure-node-windows.ps1")
}

if (-not (Get-Command Promptly-UnzipPluginPack -ErrorAction SilentlyContinue)) {
  Invoke-Expression (__Promptly-FetchScriptText -Uri "$InstallBase/_install-common-windows.ps1")
}

if (-not (Get-Command Promptly-UnzipPluginPack -ErrorAction SilentlyContinue)) {
  Write-Host "X Failed to load Promptly install helpers from $InstallBase"
  exit 1
}
