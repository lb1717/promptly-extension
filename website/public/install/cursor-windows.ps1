$ErrorActionPreference = "Stop"

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.7" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$CursorPlugin = Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor"
$ZipPath = Join-Path $env:USERPROFILE "promptly.zip"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_ensure-node-windows.ps1" -UseBasicParsing).Content)
try {
  Invoke-Expression ((Invoke-WebRequest -Uri "$InstallBase/_install-common-windows.ps1" -UseBasicParsing).Content)
} catch { }
Ensure-NodeJs

Write-Host "-> Downloading Promptly plugin pack..."
Invoke-WebRequest -Uri $PluginPackUrl -OutFile $ZipPath
Promptly-UnzipPluginPack -ZipPath $ZipPath -Dest $env:USERPROFILE

$SourceCursor = Join-Path $Integrations "cursor"
Promptly-SyncTelemetryCli -PluginDir $SourceCursor
try { Promptly-SyncImproveCli -PluginDir $SourceCursor } catch { }
Promptly-CursorPluginReinstall -Integrations $Integrations
Promptly-SyncCursorCommandFiles -PluginDir $SourceCursor

Write-Host ""
Write-Host "Promptly installed for Cursor"
Write-Host "  Reload Cursor window, allow hooks if asked, then type: /promptly your draft here"
