function Promptly-UnzipPluginPack {
  param(
    [string]$ZipPath = (Join-Path $env:USERPROFILE "promptly.zip"),
    [string]$Dest = $env:USERPROFILE
  )
  Expand-Archive -Path $ZipPath -DestinationPath $Dest -Force
}

function Promptly-SyncImproveCli {
  param([string]$PluginDir)
  $src = Join-Path $env:USERPROFILE "integrations\packages\promptly-improve\bin\promptly-improve.mjs"
  if (Test-Path $src) {
    New-Item -ItemType Directory -Force -Path (Join-Path $PluginDir "bin") | Out-Null
    Copy-Item -Force $src (Join-Path $PluginDir "bin\promptly-improve.mjs")
    return
  }
  if (Test-Path (Join-Path $PluginDir "bin\promptly-improve.mjs")) { return }
  Write-Host "Missing promptly-improve.mjs - re-download the plugin pack"
  exit 1
}

function Promptly-SyncTelemetryCli {
  param([string]$PluginDir)
  $src = Join-Path $env:USERPROFILE "integrations\packages\telemetry-cli\bin\promptly-telemetry.mjs"
  if (Test-Path $src) {
    New-Item -ItemType Directory -Force -Path (Join-Path $PluginDir "bin") | Out-Null
    Copy-Item -Force $src (Join-Path $PluginDir "bin\promptly-telemetry.mjs")
    return
  }
  if (Test-Path (Join-Path $PluginDir "bin\promptly-telemetry.mjs")) { return }
  Write-Host "Missing promptly-telemetry.mjs - re-download the plugin pack"
  exit 1
}

function Promptly-WriteUtf8File {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Content
  )
  $dir = Split-Path $Path
  if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Promptly-GetNodeExe {
  $nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $nodeExe) {
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
  }
  if (-not $nodeExe) {
    Write-Host "X Node.js executable not found"
    exit 1
  }
  return $nodeExe
}

function Promptly-RunNode {
  param(
    [Parameter(Mandatory)][string[]]$Args,
    [switch]$AllowFailure
  )
  $nodeExe = Promptly-GetNodeExe
  & $nodeExe @Args 2>&1 | Write-Host
  if (-not $AllowFailure -and $LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  return $LASTEXITCODE
}

function Promptly-PatchHookNodeInFiles {
  param([string[]]$Paths = @())
  $nodeExe = Promptly-GetNodeExe
  $env:PROMPTLY_NODE_EXE = $nodeExe
  $installBase = if ($script:InstallBase) { $script:InstallBase } elseif ($InstallBase) { $InstallBase } elseif ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }
  $patchDir = Join-Path $env:TEMP "promptly-install"
  New-Item -ItemType Directory -Force -Path $patchDir | Out-Null
  $patchScript = Join-Path $patchDir "patch-windows-hooks.mjs"
  try {
    Invoke-WebRequest -Uri "$installBase/patch-windows-hooks.mjs" -OutFile $patchScript -UseBasicParsing
  } catch {
    $bundled = Join-Path $env:USERPROFILE "integrations\scripts\patch-windows-hooks.mjs"
    if (Test-Path -LiteralPath $bundled) {
      Copy-Item -Force $bundled $patchScript
    } else {
      Write-Host "WARN Could not download patch-windows-hooks.mjs"
      return
    }
  }
  if ($Paths -and $Paths.Count) {
    & $nodeExe $patchScript @Paths 2>&1 | Write-Host
  } else {
    & $nodeExe $patchScript 2>&1 | Write-Host
  }
}

function Promptly-TestHooksJsonOk {
  param(
    [Parameter(Mandatory)][string]$HooksPath,
    [string]$NodeExe
  )
  if (-not (Test-Path -LiteralPath $HooksPath)) { return $false }
  $nodeExe = if ($NodeExe) { $NodeExe } else { Promptly-GetNodeExe }
  try {
    $raw = [System.IO.File]::ReadAllText($HooksPath)
    if ($raw.TrimStart().StartsWith("#!")) { return $false }
    $null = $raw | ConvertFrom-Json
    $escaped = $nodeExe.Replace('\', '\\')
    if ($raw.Contains($nodeExe) -or $raw.Contains($escaped)) { return $true }
    return $raw.ToLower().Contains("node.exe")
  } catch {
    return $false
  }
}

function Promptly-EnsureHooksUseNodeExe {
  param([Parameter(Mandatory)][string]$HooksPath)
  $nodeExe = Promptly-GetNodeExe
  Promptly-PatchHookNodeInFiles -Paths @($HooksPath)
  if (Promptly-TestHooksJsonOk -HooksPath $HooksPath -NodeExe $nodeExe) {
    return $true
  }
  try {
    $raw = [System.IO.File]::ReadAllText($HooksPath)
    $jsonOk = $true
    try { $null = $raw | ConvertFrom-Json } catch { $jsonOk = $false }
    if ($env:PROMPTLY_INSTALL_DEBUG -eq "1") {
      Write-Host "  DEBUG hook check failed: json_valid=$jsonOk has_node_exe=$($raw.Contains($nodeExe))"
    }
  } catch {
    if ($env:PROMPTLY_INSTALL_DEBUG -eq "1") {
      Write-Host "  DEBUG could not read hooks file: $_"
    }
  }
  Write-Host "X Hooks must use full node.exe path: $HooksPath"
  return $false
}

function Promptly-CollectHookJsonPaths {
  param([string]$Integrations = (Join-Path $env:USERPROFILE "integrations"))
  $paths = [System.Collections.Generic.List[string]]::new()
  foreach ($candidate in @(
    (Join-Path $Integrations "codex\hooks\hooks.json"),
    (Join-Path $Integrations "cursor\hooks\hooks.json"),
    (Join-Path $Integrations "claude-code\hooks\hooks.json"),
    (Join-Path $env:USERPROFILE ".codex\hooks.json"),
    (Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor\hooks\hooks.json")
  )) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { [void]$paths.Add($candidate) }
  }
  foreach ($cacheRoot in @(
    (Join-Path $env:USERPROFILE ".codex\plugins\cache\promptly-labs\promptly-codex"),
    (Join-Path $env:USERPROFILE ".claude\plugins\cache\promptly-labs\promptly-claude-code")
  )) {
    if (-not (Test-Path -LiteralPath $cacheRoot)) { continue }
    Get-ChildItem -Path $cacheRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      foreach ($rel in @("hooks\hooks.json", "codex\hooks\hooks.json")) {
        $candidate = Join-Path $_.FullName $rel
        if (Test-Path -LiteralPath $candidate) { [void]$paths.Add($candidate) }
      }
    }
  }
  return ,$paths.ToArray()
}

function Promptly-ApplyWindowsHookPaths {
  param([string]$Integrations)
  Promptly-PatchHookNodeInFiles -Paths (Promptly-CollectHookJsonPaths -Integrations $Integrations)
}

function Promptly-PreparePluginPack {
  param([string]$Integrations)
  $syncScript = Join-Path $Integrations "scripts\sync-plugin-pack.mjs"
  $nodeExe = Promptly-GetNodeExe
  if ($syncScript -and (Test-Path $syncScript)) {
    Write-Host "-> Syncing plugin pack hooks and CLIs..."
    & $nodeExe $syncScript 2>&1 | Write-Host
  }
  Promptly-ApplyWindowsHookPaths -Integrations $Integrations
}

function Promptly-SyncClaudePluginCache {
  $src = Join-Path $env:USERPROFILE "integrations\packages\telemetry-cli\bin\promptly-telemetry.mjs"
  $hooksSrc = Join-Path $env:USERPROFILE "integrations\claude-code\hooks\hooks.json"
  if (-not (Test-Path $src)) { return 0 }
  $cacheRoot = Join-Path $env:USERPROFILE ".claude\plugins\cache\promptly-labs\promptly-claude-code"
  if (-not (Test-Path $cacheRoot)) {
    Write-Host "  Note: Claude plugin cache not created yet (open Claude Code once if hooks do not run)"
    return 0
  }
  $count = 0
  Get-ChildItem -Path $cacheRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $binDir = Join-Path $_.FullName "bin"
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    Copy-Item -Force $src (Join-Path $binDir "promptly-telemetry.mjs")
    if (Test-Path $hooksSrc) {
      $hooksDir = Join-Path $_.FullName "hooks"
      New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null
      Copy-Item -Force $hooksSrc (Join-Path $hooksDir "hooks.json")
    }
    $count++
    Write-Host "  Synced Claude Code plugin cache: $($_.FullName)"
  }
  Promptly-PatchHookNodeInFiles -Paths (Promptly-CollectHookJsonPaths)
  return $count
}

function Promptly-RepairCodexConfigToml {
  param([string]$Integrations = (Join-Path $env:USERPROFILE "integrations"))
  $config = Join-Path $env:USERPROFILE ".codex\config.toml"
  if (-not (Test-Path -LiteralPath $config)) { return $false }

  $cli = Join-Path $Integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"
  if (Test-Path -LiteralPath $cli) {
    $node = Promptly-GetNodeExe
    $out = & $node $cli codex-repair-config 2>&1 | Out-String
    if ($out -match '"repaired"\s*:\s*true') {
      Write-Host "  OK Repaired Codex config.toml (removed invalid Promptly hook entries)"
      return $true
    }
    if ($LASTEXITCODE -eq 0) { return $false }
  }

  $raw = Get-Content -LiteralPath $config -Raw
  if ($raw -notmatch '\[hooks\.state\..*(hooks\.json|promptly-codex|\\)') { return $false }

  Write-Host "-> Repairing broken Codex config.toml..."
  $lines = Get-Content -LiteralPath $config
  $outLines = New-Object System.Collections.Generic.List[string]
  $skip = $false
  foreach ($line in $lines) {
    if ($line -match '^\[hooks\.state\.' -and ($line -match 'hooks\.json' -or $line -match 'promptly-codex' -or $line -match '\\')) {
      $skip = $true
      continue
    }
    if ($skip) {
      if ($line -match '^trusted_hash\s*=') { $skip = $false }
      continue
    }
    $outLines.Add($line)
  }
  $text = ($outLines -join "`n").TrimEnd() + "`n"
  [System.IO.File]::WriteAllText($config, $text, [System.Text.UTF8Encoding]::new($false))
  Write-Host "  OK Repaired Codex config.toml"
  return $true
}

function Promptly-TrustCodexHooks {
  param([string]$Integrations = (Join-Path $env:USERPROFILE "integrations"))
  $cli = Join-Path $Integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"
  if (-not (Test-Path -LiteralPath $cli)) {
    Write-Host "  WARN Codex hook trust skipped - telemetry CLI missing"
    return $false
  }
  $nodeExe = Promptly-GetNodeExe
  if ($nodeExe) { $env:PROMPTLY_NODE_EXE = $nodeExe }
  Write-Host "-> Installing Promptly hooks to ~/.codex/hooks.json (Codex Windows has no /hooks command)..."
  Promptly-RunNode -Args @($cli, "codex-trust-hooks") -AllowFailure
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Codex hooks installed and pre-trusted in config.toml"
    Promptly-StartCodexWatchDaemon -Integrations $Integrations | Out-Null
    Promptly-RegisterCodexWatchDaemonStartup -Integrations $Integrations | Out-Null
    Write-Host "  OK Codex transcript watcher started (tracks prompts without /hooks)"
    Write-Host "  Quit and reopen Codex, then send a test prompt"
    return $true
  }
  Write-Host "  WARN Codex hook install failed - rerun: node `"$cli`" codex-trust-hooks"
  return $false
}

function Promptly-StartCodexWatchDaemon {
  param([string]$Integrations = (Join-Path $env:USERPROFILE "integrations"))
  $cli = Join-Path $Integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"
  if (-not (Test-Path -LiteralPath $cli)) { return $false }
  $daemonFlag = Join-Path $env:USERPROFILE ".promptly\codex-watch-daemon.json"
  if (Test-Path -LiteralPath $daemonFlag) {
    try {
      $state = Get-Content -LiteralPath $daemonFlag -Raw | ConvertFrom-Json
      if ($state.pid -and $state.at -and (([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [int64]$state.at) -lt 300000)) {
        $proc = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
        if ($proc) { return $true }
      }
    } catch { }
  }
  $nodeExe = $env:PROMPTLY_NODE_EXE
  if (-not $nodeExe) {
    $nodeExe = Promptly-GetNodeExe
  }
  if (-not $nodeExe) { return $false }
  $env:PROMPTLY_NODE_EXE = $nodeExe
  Start-Process -FilePath $nodeExe -ArgumentList @($cli, "codex-watch-daemon") -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 2
  if (Test-Path -LiteralPath $daemonFlag) {
    try {
      $state = Get-Content -LiteralPath $daemonFlag -Raw | ConvertFrom-Json
      if ($state.pid -and (Get-Process -Id $state.pid -ErrorAction SilentlyContinue)) {
        return $true
      }
    } catch { }
  }
  return $false
}

function Promptly-RegisterCodexWatchDaemonStartup {
  param([string]$Integrations = (Join-Path $env:USERPROFILE "integrations"))
  $cli = Join-Path $Integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"
  if (-not (Test-Path -LiteralPath $cli)) { return $false }
  $nodeExe = $env:PROMPTLY_NODE_EXE
  if (-not $nodeExe) { $nodeExe = Promptly-GetNodeExe }
  if (-not $nodeExe) { return $false }
  $startup = [Environment]::GetFolderPath("Startup")
  if (-not $startup) { return $false }
  $vbsPath = Join-Path $startup "PromptlyCodexWatch.vbs"
  $escapedNode = $nodeExe.Replace('"', '""')
  $escapedCli = $cli.Replace('"', '""')
  $vbs = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """$escapedNode"" ""$escapedCli"" codex-watch-daemon", 0, False
"@
  Set-Content -LiteralPath $vbsPath -Value $vbs -Encoding ASCII
  return $true
}

function Promptly-SyncCodexPluginCache {
  $src = Join-Path $env:USERPROFILE "integrations\packages\telemetry-cli\bin\promptly-telemetry.mjs"
  $hooksSrc = Join-Path $env:USERPROFILE "integrations\codex\hooks\hooks.json"
  if (-not (Test-Path $src)) { return 0 }
  $cacheRoot = Join-Path $env:USERPROFILE ".codex\plugins\cache\promptly-labs\promptly-codex"
  if (-not (Test-Path $cacheRoot)) {
    Write-Host "  Note: Codex plugin cache not created yet (open Codex once, then rerun setup or sync-runtimes)"
    return 0
  }
  $count = 0
  Get-ChildItem -Path $cacheRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    foreach ($binRel in @("bin", "codex\bin")) {
      $binDir = Join-Path $_.FullName $binRel
      New-Item -ItemType Directory -Force -Path $binDir | Out-Null
      Copy-Item -Force $src (Join-Path $binDir "promptly-telemetry.mjs")
    }
    if (Test-Path $hooksSrc) {
      foreach ($hooksRel in @("hooks", "codex\hooks")) {
        $hooksDir = Join-Path $_.FullName $hooksRel
        New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null
        Copy-Item -Force $hooksSrc (Join-Path $hooksDir "hooks.json")
      }
    }
    $count++
    Write-Host "  Synced Codex plugin cache: $($_.FullName)"
  }
  Promptly-PatchHookNodeInFiles -Paths (Promptly-CollectHookJsonPaths)
  return $count
}

function Promptly-SyncAllAgentRuntimes {
  param([string]$Integrations = (Join-Path $env:USERPROFILE "integrations"))
  $cliSrc = Join-Path $env:USERPROFILE "integrations\packages\telemetry-cli\bin\promptly-telemetry.mjs"
  if (-not (Test-Path $cliSrc)) { return }

  Write-Host "-> Syncing telemetry CLI into agent plugin folders..."
  foreach ($plugin in @("claude-code", "cursor", "codex")) {
    $pluginDir = Join-Path $Integrations $plugin
    if (Test-Path $pluginDir) {
      Promptly-SyncTelemetryCli -PluginDir $pluginDir
    }
  }

  Promptly-SyncClaudePluginCache | Out-Null
  Promptly-SyncCodexPluginCache | Out-Null

  $cursorDest = Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor"
  $cursorSrc = Join-Path $Integrations "cursor"
  if (Test-Path $cursorSrc) {
    Write-Host "-> Refreshing local Cursor plugin copy..."
    if (Test-Path $cursorDest) { Remove-Item -Recurse -Force $cursorDest }
    New-Item -ItemType Directory -Force -Path (Split-Path $cursorDest) | Out-Null
    Copy-Item -Recurse -Force $cursorSrc $cursorDest
  }

  Promptly-ApplyWindowsHookPaths -Integrations $Integrations
  Promptly-RunNode -Args @($cliSrc, "sync-runtimes") -AllowFailure
  Promptly-TrustCodexHooks -Integrations $Integrations | Out-Null
  Write-Host "OK Synced live hooks + telemetry CLI for Claude Code, Cursor, and Codex"
}

function Promptly-PrintHookDiagnostics {
  param(
    [Parameter(Mandatory)][string]$CliPath,
    [Parameter(Mandatory)][string]$Tool,
    [Parameter(Mandatory)][string]$Label
  )
  Write-Host ""
  Write-Host "Hook diagnostics: $Label"
  Promptly-RunNode -Args @($CliPath, "diagnostics", "--tool", $Tool) -AllowFailure
}

function Promptly-PrintInstallSummary {
  param(
    [string[]]$Installed,
    [string[]]$Skipped,
    [string[]]$Failed
  )
  if ($env:PROMPTLY_QUIET -eq "1") {
    foreach ($label in $Installed) {
      Write-Host "✓ $label completed"
    }
    foreach ($label in $Skipped) {
      Write-Host "✓ $label skipped (CLI not installed)"
    }
    foreach ($label in $Failed) {
      Write-Host "X $label failed"
    }
    return
  }
  Write-Host ""
  Write-Host "========================================"
  Write-Host "Promptly all-agents install summary"
  if ($Installed.Count) { Write-Host "  OK Installed: $($Installed -join ', ')" }
  if ($Skipped.Count) { Write-Host "  WARN Skipped (CLI not available): $($Skipped -join ', ')" }
  if ($Failed.Count) { Write-Host "  X Failed: $($Failed -join ', ')" }
  Write-Host "========================================"
}

function Promptly-SyncSubscriptionUsage {
  param([string]$Integrations = (Join-Path $env:USERPROFILE "integrations"))
  $cli = Join-Path $Integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"
  if (-not (Test-Path $cli)) {
    if ($env:PROMPTLY_QUIET -ne "1") {
      Write-Host "WARN Subscription sync skipped - telemetry CLI missing."
    }
    return
  }
  if ($env:PROMPTLY_QUIET -eq "1") {
    Promptly-RunNode -Args @($cli, "usage-sync", "--login-claude") -AllowFailure | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "✓ Subscription usage synced"
    }
    return
  }
  Write-Host "-> Syncing AI subscription usage (Claude, Codex, Cursor)..."
  Write-Host "  First-time setup opens your browser once for claude.ai sign-in."
  Promptly-RunNode -Args @($cli, "usage-sync", "--login-claude") -AllowFailure
  if ($LASTEXITCODE -ne 0) {
    Write-Host "WARN Subscription sync incomplete - resync anytime at https://promptly-labs.com/integrations#resync-subscriptions"
  } else {
    Write-Host "OK Subscription usage synced - use Refresh on your stats page anytime."
  }
}

function Promptly-CoerceExitCode {
  param($Value)
  if ($Value -is [int]) { return $Value }
  foreach ($item in @($Value)) {
    if ($item -is [int]) { return $item }
  }
  return 1
}

function Promptly-InstallAllAgents {
  param([string]$Integrations)
  $installed = @()
  $skipped = @()
  $failed = @()

  foreach ($entry in @(
    @{ Label = "Cursor"; Fn = { Promptly-InstallForCursor -Integrations $Integrations } },
    @{ Label = "Claude Code"; Fn = { Promptly-InstallForClaudeCode -Integrations $Integrations } },
    @{ Label = "Codex"; Fn = { Promptly-InstallForCodex -Integrations $Integrations } }
  )) {
    $code = Promptly-CoerceExitCode (& $entry.Fn)
    if ($code -eq 0) { $installed += $entry.Label }
    elseif ($code -eq 2) { $skipped += $entry.Label }
    else { $failed += $entry.Label }
  }

  Promptly-PrintInstallSummary -Installed $installed -Skipped $skipped -Failed $failed
  if (-not $installed.Count) { return 1 }
  return 0
}

function Promptly-ValidateHookJson {
  param([string]$Integrations = (Join-Path $env:USERPROFILE "integrations"))
  Write-Host "-> Validating and patching Windows hook JSON..."
  Promptly-PatchHookNodeInFiles
}

function Promptly-PrintInstallDebugReport {
  param(
    [string]$Integrations = (Join-Path $env:USERPROFILE "integrations"),
    [string]$PairCode = "",
    [hashtable]$InstallSummary = @{}
  )
  $nodeExe = Promptly-GetNodeExe
  $env:PROMPTLY_NODE_EXE = $nodeExe
  $installBase = if ($script:InstallBase) { $script:InstallBase } elseif ($InstallBase) { $InstallBase } else { "https://promptly-labs.com/install" }
  $debugDir = Join-Path $env:TEMP "promptly-install"
  New-Item -ItemType Directory -Force -Path $debugDir | Out-Null
  $debugScript = Join-Path $debugDir "windows-install-debug.mjs"
  $cli = Join-Path $Integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"

  Write-Host ""
  Write-Host "################################################################################"
  Write-Host "# PROMPTLY WINDOWS INSTALL DEBUG REPORT (temporary - copy everything below)   #"
  Write-Host "################################################################################"
  Write-Host ""
  Write-Host "generated_at: $((Get-Date).ToUniversalTime().ToString('o'))"
  Write-Host "pair_code_used: $(if ($PairCode) { $PairCode.Substring(0, [Math]::Min(4, $PairCode.Length)) + '****' } else { 'none' })"
  Write-Host "install_base: $installBase"
  Write-Host "userprofile: $env:USERPROFILE"
  Write-Host "node_exe: $nodeExe"
  Write-Host "node_version: $(& $nodeExe -v 2>&1 | Out-String | ForEach-Object { $_.Trim() })"
  Write-Host "powershell_version: $($PSVersionTable.PSVersion)"
  if ($InstallSummary.Count) {
    Write-Host "install_summary_installed: $($InstallSummary.Installed -join ', ')"
    Write-Host "install_summary_skipped: $($InstallSummary.Skipped -join ', ')"
    Write-Host "install_summary_failed: $($InstallSummary.Failed -join ', ')"
  }
  Write-Host ""

  Write-Host "--- hook_files (quick scan) ---"
  foreach ($hooksPath in (Promptly-CollectHookJsonPaths -Integrations $Integrations)) {
    $label = $hooksPath.Replace($env:USERPROFILE, '~')
    if (-not (Test-Path -LiteralPath $hooksPath)) {
      Write-Host "  [MISSING] $label"
      continue
    }
    $ok = Promptly-TestHooksJsonOk -HooksPath $hooksPath -NodeExe $nodeExe
    $bareNode = Select-String -Path $hooksPath -Pattern 'node \\"\$\{' -Quiet
    $status = if ($ok) { "OK" } else { "FAIL" }
    Write-Host "  [$status] $label (bare_node=$bareNode json=$ok)"
  }
  Write-Host ""

  try {
    Invoke-WebRequest -Uri "$installBase/windows-install-debug.mjs" -OutFile $debugScript -UseBasicParsing
    Write-Host "--- full_analytics_json (copy from next line through END PROMPTLY DEBUG) ---"
    & $nodeExe $debugScript $Integrations 2>&1 | Write-Host
  } catch {
    Write-Host "WARN Could not run windows-install-debug.mjs: $_"
    if (Test-Path -LiteralPath $cli) {
      Write-Host "--- fallback: per-tool diagnostics ---"
      foreach ($tool in @("claude_code", "cursor", "codex")) {
        Write-Host "== diagnostics --tool $tool =="
        & $nodeExe $cli diagnostics --tool $tool 2>&1 | Write-Host
        Write-Host "== status --tool $tool =="
        & $nodeExe $cli status --tool $tool 2>&1 | Write-Host
      }
    }
  }

  Write-Host ""
  Write-Host "################################################################################"
  Write-Host "# END PROMPTLY DEBUG - send this block if install or live tracking still fails  #"
  Write-Host "################################################################################"
  Write-Host ""
}

function Promptly-FinalizeWithPairCodeAndDebug {
  param(
    [Parameter(Mandatory)][string]$Code,
    [string]$Integrations = (Join-Path $env:USERPROFILE "integrations"),
    [hashtable]$InstallSummary = @{}
  )
  Promptly-FinalizeWithPairCode -Code $Code -Integrations $Integrations
  if ($env:PROMPTLY_INSTALL_DEBUG -eq "1") {
    Promptly-PrintInstallDebugReport -Integrations $Integrations -PairCode $Code -InstallSummary $InstallSummary
  }
}

function Promptly-InstallAllAgentsWithSummary {
  param([string]$Integrations)
  $installed = @()
  $skipped = @()
  $failed = @()

  foreach ($entry in @(
    @{ Label = "Cursor"; Fn = { Promptly-InstallForCursor -Integrations $Integrations } },
    @{ Label = "Claude Code"; Fn = { Promptly-InstallForClaudeCode -Integrations $Integrations } },
    @{ Label = "Codex"; Fn = { Promptly-InstallForCodex -Integrations $Integrations } }
  )) {
    $code = Promptly-CoerceExitCode (& $entry.Fn)
    if ($code -eq 0) { $installed += $entry.Label }
    elseif ($code -eq 2) { $skipped += $entry.Label }
    else { $failed += $entry.Label }
  }

  Promptly-PrintInstallSummary -Installed $installed -Skipped $skipped -Failed $failed
  return @{
    Installed = $installed
    Skipped = $skipped
    Failed = $failed
    ExitCode = if ($installed.Count) { 0 } else { 1 }
  }
}

function Promptly-SetupAgents {
  param(
    [Parameter(Mandatory)][string]$PairCode,
    [string]$PluginPackUrl = $(if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.4.12" }),
    [string]$Integrations = (Join-Path $env:USERPROFILE "integrations"),
    [switch]$SuppressSuccessLine
  )

  $normalizedCode = [string]$PairCode
  if ($normalizedCode.Trim().Length -lt 6) {
    Write-Host "Get YOUR_CODE at https://promptly-labs.com/integrations while signed into the Promptly account you want."
    exit 1
  }

  if (-not (Get-Command Ensure-NodeJs -ErrorAction SilentlyContinue)) {
    Write-Host "X Install helpers are missing. Re-run the setup command from promptly-labs.com/get-started."
    exit 1
  }

  Ensure-NodeJs

  $zipPath = Join-Path $env:USERPROFILE "promptly.zip"
  Write-Host "-> Downloading Promptly plugin pack (Claude Code, Cursor, Codex)..."
  Invoke-WebRequest -Uri $PluginPackUrl -OutFile $zipPath -UseBasicParsing
  Promptly-UnzipPluginPack -ZipPath $zipPath -Dest $env:USERPROFILE
  if (-not (Promptly-VerifyPluginPack -Integrations $Integrations)) {
    if ($env:PROMPTLY_INSTALL_DEBUG -eq "1") {
      Promptly-PrintInstallDebugReport -Integrations $Integrations -PairCode $normalizedCode
    }
    exit 1
  }

  $summary = Promptly-InstallAllAgentsWithSummary -Integrations $Integrations
  Promptly-FinalizeWithPairCodeAndDebug -Code $normalizedCode -Integrations $Integrations -InstallSummary $summary

  if (-not $SuppressSuccessLine) {
    Write-Host "Promptly Successfully Installed"
  }
}

function Promptly-FinalizeWithPairCode {
  param(
    [Parameter(Mandatory)][string]$Code,
    [string]$Integrations = (Join-Path $env:USERPROFILE "integrations")
  )
  $cli = Join-Path $Integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"
  if (-not (Test-Path $cli)) {
    Write-Host "X Could not install telemetry CLI from plugin pack."
    exit 1
  }

  $quiet = $env:PROMPTLY_QUIET -eq "1"
  if ($quiet) {
    Promptly-RunNode -Args @($cli, "fix-account", "--quiet", $Code)
  } else {
    Promptly-RunNode -Args @($cli, "fix-account", $Code)
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Host "X Pairing failed - get a fresh code at https://promptly-labs.com/integrations"
    exit 1
  }
  if ($quiet) {
    Promptly-SyncAllAgentRuntimes -Integrations $Integrations | Out-Null
    Promptly-SyncSubscriptionUsage -Integrations $Integrations | Out-Null
    return
  }

  Write-Host "-> Pairing all agents, merging stats, and verifying live uploads..."
  Write-Host "-> Syncing hooks + telemetry into Claude Code, Cursor, and Codex runtimes..."
  Promptly-SyncAllAgentRuntimes -Integrations $Integrations
  Promptly-ValidateHookJson -Integrations $Integrations

  foreach ($tool in @("codex", "claude_code", "cursor")) {
    Promptly-RunNode -Args @($cli, "test-send", "--tool", $tool) -AllowFailure | Out-Null
  }

  Promptly-SyncSubscriptionUsage -Integrations $Integrations

  Write-Host ""
  Write-Host "OK All set. Restart Claude Code, Cursor, and Codex if they were open, then send a test prompt."
  Write-Host ""
  Write-Host "Hooks:"
  Write-Host "  Codex: hooks pre-trusted in ~/.codex/config.toml — quit and reopen Codex (no /hooks command on Windows)"
  Write-Host "  Cursor: reload the window and allow hooks when prompted"
  Write-Host "  Claude Code: run /reload-plugins once"
  Write-Host ""
  Write-Host "Stats: https://promptly-labs.com/account/statistics"
}

function Promptly-InstallCompanionWindows {
  param(
    [switch]$SkipLaunch
  )

  $apiUrl = "https://promptly-labs.com/api/companion/download"
  $fallback = "https://github.com/lb1717/promptly-extension/releases/download/companion-v0.2.0/Promptly-Companion-0.2.0-win.exe"
  $exeUrl = $null
  if ($env:PROMPTLY_COMPANION_WIN_URL) {
    $exeUrl = $env:PROMPTLY_COMPANION_WIN_URL
  } else {
    try {
      $json = Invoke-RestMethod -Uri $apiUrl -Method Get
      if ($json.winUrl) { $exeUrl = [string]$json.winUrl }
    } catch {}
  }
  if (-not $exeUrl) { $exeUrl = $fallback }

  $exePath = Join-Path $env:TEMP "Promptly-Companion-setup.exe"
  Invoke-WebRequest -Uri $exeUrl -OutFile $exePath -UseBasicParsing
  Unblock-File -LiteralPath $exePath -ErrorAction SilentlyContinue
  Start-Process -FilePath $exePath -ArgumentList "/S" -Wait
  Remove-Item $exePath -Force -ErrorAction SilentlyContinue
  Write-Host "✓ Desktop app installed"

  $shouldLaunch = -not $SkipLaunch -and $env:PROMPTLY_QUIET -ne "1" -and $env:PROMPTLY_SKIP_COMPANION_LAUNCH -ne "1"
  if (-not $shouldLaunch) {
    if ($env:PROMPTLY_QUIET -eq "1") {
      Write-Host "✓ Open Promptly Companion from the Start menu when you are ready"
    }
    return
  }

  $launchCandidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Promptly Companion\Promptly Companion.exe"),
    (Join-Path $env:ProgramFiles "Promptly Companion\Promptly Companion.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Promptly Companion\Promptly Companion.exe")
  )
  foreach ($launchPath in $launchCandidates) {
    if (Test-Path $launchPath) {
      Unblock-File -LiteralPath $launchPath -ErrorAction SilentlyContinue
      Start-Process -FilePath $launchPath | Out-Null
      Write-Host "✓ Desktop app opened"
      return
    }
  }

  $startMenuShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Promptly Companion.lnk"
  if (Test-Path $startMenuShortcut) {
    Start-Process -FilePath $startMenuShortcut | Out-Null
    Write-Host "✓ Desktop app opened"
  }
}

function Promptly-ClaudeMarketplaceRefresh {
  param([string]$IntegrationsPath)
  $claude = Promptly-GetAgentCliPath -Name claude
  if (-not $claude) {
    Write-Host "Claude Code CLI not found"
    exit 1
  }
  $out = & $claude plugin marketplace add $IntegrationsPath 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -and $out -notmatch 'already installed|already exists') {
    Write-Host "Failed to add marketplace: $out"
    exit 1
  }
  & $claude plugin marketplace update promptly-labs 2>$null | Out-Null
  Write-Host "Marketplace refreshed"
}

function Promptly-ClaudePluginReinstall {
  $claude = Promptly-GetAgentCliPath -Name claude
  if (-not $claude) {
    Write-Host "Claude Code CLI not found"
    exit 1
  }
  if ((& $claude plugin list 2>&1 | Out-String) -match 'promptly-claude-code') {
    Write-Host "-> Removing previous Promptly Claude Code plugin..."
    & $claude plugin uninstall promptly-claude-code@promptly-labs 2>$null
  }
  Write-Host "-> Installing fresh Promptly plugin..."
  & $claude plugin install promptly-claude-code@promptly-labs 2>&1 | Write-Host
}

function Promptly-CodexMarketplaceAdd {
  param([string]$IntegrationsPath)
  $null = Promptly-RepairCodexConfigToml -Integrations $IntegrationsPath
  $codex = Promptly-GetAgentCliPath -Name codex
  if (-not $codex) {
    Write-Host "Codex CLI not found"
    exit 1
  }
  $out = & $codex plugin marketplace add $IntegrationsPath 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { return }
  if ($out -match 'already installed|already exists') { return }
  if ($out -match 'TOML parse error|failed to parse user config|unicode value digits') {
    Write-Host "  Codex config.toml is invalid - repairing and retrying..."
    Promptly-RepairCodexConfigToml -Integrations $IntegrationsPath | Out-Null
    $out = & $codex plugin marketplace add $IntegrationsPath 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) { return }
    if ($out -match 'already installed|already exists') { return }
  }
  Write-Host "Failed to add marketplace: $out"
  exit 1
}

function Promptly-CodexPluginReinstall {
  $codex = Promptly-GetAgentCliPath -Name codex
  if (-not $codex) {
    Write-Host "Codex CLI not found"
    exit 1
  }
  if ((& $codex plugin list 2>&1 | Out-String) -match 'promptly-codex') {
    Write-Host "-> Removing previous Promptly Codex plugin..."
    & $codex plugin remove promptly-codex@promptly-labs 2>$null
  }
  Write-Host "-> Installing fresh Promptly plugin..."
  & $codex plugin add promptly-codex@promptly-labs 2>&1 | Write-Host
  if ($LASTEXITCODE -ne 0) { & $codex plugin install promptly-codex@promptly-labs 2>&1 | Write-Host }
}

function Promptly-SyncClaudeCodeCommandFiles {
  param([string]$PluginDir)
  $src = Join-Path $PluginDir "user-commands\promptly.md"
  if (-not (Test-Path $src)) {
    Write-Host "Missing Claude Code /promptly command — re-download the plugin pack"
    exit 1
  }
  $dest = Join-Path $env:USERPROFILE ".claude\commands\promptly.md"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -Force $src $dest
  $skillSrc = Join-Path $PluginDir "skill\SKILL.md"
  if (Test-Path $skillSrc) {
    $skillDestDir = Join-Path $env:USERPROFILE ".claude\skills\promptly"
    New-Item -ItemType Directory -Force -Path $skillDestDir | Out-Null
    Copy-Item -Force $skillSrc (Join-Path $skillDestDir "SKILL.md")
  }
  Write-Host "Installed /promptly for Claude Code"
}

function Promptly-SyncCursorCommandFiles {
  param([string]$PluginDir)
  $src = Join-Path $PluginDir "user-commands\promptly.md"
  if (-not (Test-Path $src)) {
    Write-Host "Missing Cursor /promptly command — re-download the plugin pack"
    exit 1
  }
  $dest = Join-Path $env:USERPROFILE ".cursor\commands\promptly.md"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -Force $src $dest
  $pluginCmd = Join-Path $PluginDir "commands\promptly.md"
  New-Item -ItemType Directory -Force -Path (Split-Path $pluginCmd) | Out-Null
  Copy-Item -Force $src $pluginCmd
  Write-Host "Installed /promptly for Cursor"
}

function Promptly-InstallCodexSkill {
  param([string]$PluginDir)
  $src = Join-Path $PluginDir "skill\SKILL.md"
  if (-not (Test-Path $src)) {
    Write-Host "Missing Codex skill file - re-download the plugin pack"
    exit 1
  }
  $destDir = Join-Path $env:USERPROFILE ".codex\skills\promptly"
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -Force $src (Join-Path $destDir "SKILL.md")
  Write-Host "Installed /promptly for Codex"
}

function Promptly-CursorPluginReinstall {
  param([string]$Integrations)
  $dest = Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor"
  Write-Host "-> Removing previous Promptly Cursor plugin..."
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE ".cursor\plugins\local") | Out-Null
  Copy-Item -Recurse -Force (Join-Path $Integrations "cursor") $dest
}

function Promptly-EnsureClaudeCli {
  return Promptly-EnsureAgentCli -Name claude -NpmPackage "@anthropic-ai/claude-code" -DisplayName "Claude Code"
}

function Promptly-EnsureCodexCli {
  return Promptly-EnsureAgentCli -Name codex -NpmPackage "@openai/codex" -DisplayName "Codex"
}

function Promptly-VerifyPluginPack {
  param([string]$Integrations)
  if (-not (Test-Path (Join-Path $Integrations ".claude-plugin\marketplace.json"))) {
    Write-Host "Plugin pack failed - retry download"
    return $false
  }
  if (-not (Test-Path (Join-Path $Integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"))) {
    Write-Host "Plugin pack missing telemetry CLI"
    return $false
  }
  if (-not (Test-Path (Join-Path $Integrations "packages\promptly-improve\bin\promptly-improve.mjs"))) {
    Write-Host "Plugin pack missing improve CLI"
    return $false
  }
  Promptly-PreparePluginPack -Integrations $Integrations
  Write-Host "Plugin pack OK"
  return $true
}

function Promptly-InstallForCursor {
  param([string]$Integrations)
  Write-Host ""
  Write-Host "=== Cursor ==="
  $source = Join-Path $Integrations "cursor"
  if (-not (Test-Path $source)) { Write-Host "Cursor plugin files missing"; return 1 }
  Promptly-PreparePluginPack -Integrations $Integrations
  Promptly-SyncTelemetryCli -PluginDir $source
  try { Promptly-SyncImproveCli -PluginDir $source } catch { }
  Promptly-CursorPluginReinstall -Integrations $Integrations
  Promptly-SyncCursorCommandFiles -PluginDir $source
  $plugin = Join-Path $env:USERPROFILE ".cursor\plugins\local\promptly-cursor"
  $hooksPath = Join-Path $plugin "hooks\hooks.json"
  if (-not (Select-String -Path $hooksPath -Pattern 'afterAgentResponse' -Quiet)) {
    Write-Host "Cursor hooks missing afterAgentResponse"
    return 1
  }
  if (-not (Select-String -Path $hooksPath -Pattern 'hook --tool cursor' -Quiet)) {
    Write-Host "Hooks not configured for Cursor"
    return 1
  }
  if (-not (Select-String -Path $hooksPath -Pattern 'CURSOR_PLUGIN_ROOT' -Quiet)) {
    Write-Host "Cursor hooks must use `${CURSOR_PLUGIN_ROOT}/bin"
    return 1
  }
  if (-not (Promptly-EnsureHooksUseNodeExe -HooksPath $hooksPath)) {
    Write-Host "X Cursor hooks must use full node.exe path"
    return 1
  }
  Write-Host "OK Promptly installed for Cursor"
  return 0
}

function Promptly-InstallForClaudeCode {
  param([string]$Integrations)
  Write-Host ""
  Write-Host "=== Claude Code ==="
  if (-not (Promptly-EnsureClaudeCli)) { return 2 }
  $plugin = Join-Path $Integrations "claude-code"
  if (-not (Test-Path $plugin)) { Write-Host "Claude Code plugin files missing"; return 1 }
  Promptly-PreparePluginPack -Integrations $Integrations
  Promptly-SyncTelemetryCli -PluginDir $plugin
  try { Promptly-SyncImproveCli -PluginDir $plugin } catch { }
  Promptly-SyncClaudeCodeCommandFiles -PluginDir $plugin
  Promptly-ClaudeMarketplaceRefresh -IntegrationsPath $Integrations
  Promptly-ClaudePluginReinstall
  $null = Promptly-SyncClaudePluginCache
  $claude = Promptly-GetAgentCliPath -Name claude
  $pluginList = & $claude plugin list 2>&1 | Out-String
  if ($pluginList -notmatch "promptly-claude-code") {
    Write-Host "Promptly plugin not found in claude plugin list"
    return 1
  }
  $hooksPath = Join-Path $plugin "hooks\hooks.json"
  if (-not (Select-String -Path $hooksPath -Pattern 'hook --tool claude_code' -Quiet)) {
    Write-Host "Hooks not configured for Claude Code"
    return 1
  }
  if (-not (Promptly-EnsureHooksUseNodeExe -HooksPath $hooksPath)) {
    Write-Host "X Claude Code hooks must use full node.exe path"
    return 1
  }
  Write-Host "OK Promptly installed for Claude Code"
  return 0
}

function Promptly-InstallForCodex {
  param([string]$Integrations)
  Write-Host ""
  Write-Host "=== Codex ==="
  Promptly-RepairCodexConfigToml -Integrations $Integrations | Out-Null
  if (-not (Promptly-EnsureCodexCli)) { return 2 }
  $plugin = Join-Path $Integrations "codex"
  if (-not (Test-Path $plugin)) { Write-Host "Codex plugin files missing"; return 1 }
  Promptly-PreparePluginPack -Integrations $Integrations
  Promptly-SyncTelemetryCli -PluginDir $plugin
  try { Promptly-SyncImproveCli -PluginDir $plugin } catch { }
  Promptly-InstallCodexSkill -PluginDir $plugin
  Promptly-CodexMarketplaceAdd -IntegrationsPath $Integrations
  Promptly-CodexPluginReinstall
  $null = Promptly-SyncCodexPluginCache
  $codex = Promptly-GetAgentCliPath -Name codex
  $pluginList = & $codex plugin list 2>&1 | Out-String
  if ($pluginList -notmatch "promptly-codex") {
    Write-Host "Promptly plugin not found in codex plugin list"
    return 1
  }
  $hooksPath = Join-Path $plugin "hooks\hooks.json"
  if (-not (Select-String -Path $hooksPath -Pattern 'UserPromptSubmit' -Quiet)) {
    Write-Host "Codex hooks missing UserPromptSubmit"
    return 1
  }
  if (-not (Select-String -Path $hooksPath -Pattern 'PLUGIN_ROOT' -Quiet)) {
    Write-Host "Codex hooks must use `${PLUGIN_ROOT}/bin"
    return 1
  }
  if (-not (Promptly-EnsureHooksUseNodeExe -HooksPath $hooksPath)) {
    Write-Host "X Codex hooks must use full node.exe path (required for Codex Desktop)"
    return 1
  }
  Write-Host "OK Promptly installed for Codex"
  Write-Host "  Pair with a code via get-started or setup-windows.ps1 to enable live tracking"
  Write-Host "  Codex Windows has no /hooks command — install will pre-trust hooks and start a transcript watcher"
  return 0
}
