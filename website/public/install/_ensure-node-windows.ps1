function Promptly-GetNpmCmdPath {
  $fromPath = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($fromPath) { return $fromPath.Source }

  $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  }
  if ($nodeCmd) {
    $npmCmd = Join-Path (Split-Path $nodeCmd.Source -Parent) "npm.cmd"
    if (Test-Path -LiteralPath $npmCmd) { return $npmCmd }
  }
  return $null
}

function Promptly-TestNpmAvailable {
  return [bool](Promptly-GetNpmCmdPath)
}

function Promptly-InvokeNpm {
  param([Parameter(Mandatory)][string[]]$Args)
  $npmCmd = Promptly-GetNpmCmdPath
  if (-not $npmCmd) { return 127 }
  & $npmCmd @Args 2>&1 | Write-Host
  return $LASTEXITCODE
}

function Promptly-RefreshNpmPath {
  Promptly-RefreshAgentPaths
}

function Promptly-RefreshAgentPaths {
  $npmCmd = Promptly-GetNpmCmdPath
  if ($npmCmd) {
    $nodeDir = Split-Path $npmCmd -Parent
    $globalPrefix = (& $npmCmd prefix -g 2>&1 | Select-Object -Last 1).ToString().Trim()
    $globalBin = (& $npmCmd bin -g 2>&1 | Select-Object -Last 1).ToString().Trim()
    $pathParts = @()
    if ($globalBin) { $pathParts += $globalBin }
    if ($globalPrefix) { $pathParts += $globalPrefix }
    if ($nodeDir) { $pathParts += $nodeDir }
    if ($pathParts.Count) {
      $env:Path = ($pathParts -join ";") + ";" + $env:Path
    }
  }

  foreach ($extra in @(
    (Join-Path $env:USERPROFILE ".local\bin"),
    (Join-Path $env:APPDATA "npm"),
    (Join-Path $env:LOCALAPPDATA "Programs\OpenAI\Codex\bin"),
    (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin"),
    (Join-Path $env:USERPROFILE ".codex\packages\standalone\current\bin")
  )) {
    if ($extra -and (Test-Path -LiteralPath $extra)) {
      $env:Path = "$extra;$env:Path"
    }
  }
}

function Promptly-IsClaudeDesktopAlias {
  param([string]$Path)
  return ($Path -like "*\Microsoft\WindowsApps\Claude.exe")
}

function Promptly-GetCliCandidatePaths {
  param([Parameter(Mandatory)][string]$Name)

  $paths = [System.Collections.Generic.List[string]]::new()
  $add = {
    param([string]$Candidate)
    if ($Candidate -and -not $paths.Contains($Candidate)) {
      [void]$paths.Add($Candidate)
    }
  }

  & $add (Join-Path $env:USERPROFILE ".local\bin\$Name.exe")
  & $add (Join-Path $env:USERPROFILE ".local\bin\$Name.cmd")

  $npmCmd = Promptly-GetNpmCmdPath
  if ($npmCmd) {
    $globalPrefix = (& $npmCmd prefix -g 2>&1 | Select-Object -Last 1).ToString().Trim()
    $globalBin = (& $npmCmd bin -g 2>&1 | Select-Object -Last 1).ToString().Trim()
    foreach ($root in @($globalBin, $globalPrefix, (Join-Path $env:APPDATA "npm"))) {
      if (-not $root) { continue }
      & $add (Join-Path $root "$Name.cmd")
      & $add (Join-Path $root "$Name.exe")
      & $add (Join-Path $root $Name)
    }
    $npmRoot = (& $npmCmd root -g 2>&1 | Select-Object -Last 1).ToString().Trim()
    if ($npmRoot -and (Test-Path -LiteralPath $npmRoot)) {
      Get-ChildItem -Path $npmRoot -Recurse -Filter "$Name.exe" -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName |
        ForEach-Object { & $add $_ }
      Get-ChildItem -Path $npmRoot -Recurse -Filter "$Name.cmd" -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName |
        ForEach-Object { & $add $_ }
    }
  }

  if ($Name -eq "codex") {
    foreach ($candidate in @(
      (Join-Path $env:LOCALAPPDATA "Programs\OpenAI\Codex\bin\codex.exe"),
      (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin\codex.exe"),
      (Join-Path $env:USERPROFILE ".codex\packages\standalone\current\bin\codex.exe")
    )) {
      & $add $candidate
    }
    $releases = Join-Path $env:USERPROFILE ".codex\packages\standalone\releases"
    if (Test-Path -LiteralPath $releases) {
      Get-ChildItem -Path $releases -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { & $add (Join-Path $_.FullName "bin\codex.exe") }
    }
  }

  return ,$paths.ToArray()
}

function Promptly-TestAgentCli {
  param(
    [Parameter(Mandatory)][string]$CliPath,
    [Parameter(Mandatory)][string]$Name
  )
  if (Promptly-IsClaudeDesktopAlias -Path $CliPath) { return $false }
  if (-not $CliPath -or -not (Test-Path -LiteralPath $CliPath)) { return $false }

  $out = & $CliPath --version 2>&1 | Out-String
  $exit = $LASTEXITCODE
  if ($exit -eq -1073741515) {
    Write-Host "  $Name needs the Microsoft Visual C++ runtime."
    Write-Host "  Install: winget install --id Microsoft.VCRedist.2015+.x64 --exact --source winget --accept-package-agreements --accept-source-agreements"
    return $false
  }
  if ($exit -ne 0) { return $false }

  if ($Name -eq "claude") {
    return $out -match 'claude|Claude Code|anthropic'
  }
  if ($Name -eq "codex") {
    return $out -match 'codex|Codex'
  }
  return $true
}

function Promptly-GetAgentCliPath {
  param([Parameter(Mandatory)][string]$Name)
  Promptly-RefreshAgentPaths

  foreach ($candidate in (Promptly-GetCliCandidatePaths -Name $Name)) {
    if (Promptly-TestAgentCli -CliPath $candidate -Name $Name) {
      return $candidate
    }
  }

  $whereHits = @(where.exe $Name 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  foreach ($hit in $whereHits) {
    if (Promptly-TestAgentCli -CliPath $hit -Name $Name) {
      return $hit
    }
  }

  return $null
}

function Promptly-GetGlobalCliPath {
  param([Parameter(Mandatory)][string]$Name)
  return Promptly-GetAgentCliPath -Name $Name
}

function Promptly-EnsureAgentCli {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$NpmPackage,
    [string]$DisplayName = $Name
  )

  $cli = Promptly-GetAgentCliPath -Name $Name
  if ($cli) {
    Write-Host "-> Found $DisplayName CLI at $cli"
    & $cli --version 2>&1 | Write-Host
    return $true
  }

  if ($Name -eq "claude" -and (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\Claude.exe"))) {
    Write-Host "-> Claude Desktop is installed, but Promptly needs the Claude Code terminal CLI."
    Write-Host "   Turn OFF the desktop alias: Settings > Apps > Advanced app settings > App execution aliases > Claude"
    Write-Host "   Then install the CLI with npm (this script will try that next)."
  } elseif ($Name -eq "codex" -and (
    (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA "OpenAI\Codex")) -or
    (Test-Path -LiteralPath (Join-Path $env:USERPROFILE ".codex"))
  )) {
    Write-Host "-> Codex desktop app data was found, but the terminal CLI is not on PATH yet."
    Write-Host "   Close and reopen PowerShell after installing Codex, or let this script install the CLI via npm."
  } else {
    Write-Host "-> $DisplayName CLI not found; installing $NpmPackage..."
  }

  if (-not (Promptly-TestNpmAvailable)) {
    Write-Host "Warning: Could not install $DisplayName CLI because npm is unavailable."
    return $false
  }

  $exitCode = Promptly-InvokeNpm -Args @("install", "-g", $NpmPackage)
  Promptly-RefreshAgentPaths
  $cli = Promptly-GetAgentCliPath -Name $Name
  if ($cli) {
    Write-Host "-> Installed $DisplayName CLI at $cli"
    & $cli --version 2>&1 | Write-Host
    return $true
  }

  if ($exitCode -ne 0) {
    Write-Host "Warning: Could not install $DisplayName CLI (npm exit $exitCode)."
  } else {
    Write-Host "Warning: npm finished but $DisplayName CLI was still not found."
    Write-Host "   Close and reopen PowerShell, then rerun the Promptly install command."
  }
  return $false
}

function Promptly-GetHookNodePrefix {
  $nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $nodeExe) {
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
  }
  if ($nodeExe) {
    return "`"$nodeExe`""
  }
  return "node"
}

function Ensure-NodeJs {
  Write-Host "-> Checking Node.js..."
  $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  }
  if ($nodeCmd) {
    $major = [int](& $nodeCmd.Source -p "parseInt(process.versions.node.split('.')[0], 10)")
    if ($major -ge 18) {
      & $nodeCmd.Source --version
      if (-not (Promptly-TestNpmAvailable)) {
        Write-Host "npm not found. Reinstall Node.js from https://nodejs.org/"
        exit 1
      }
      Promptly-RefreshNpmPath
      Write-Host "Node.js OK"
      return
    }
    Write-Host "  Found Node $(& $nodeCmd.Source --version) - need v18 or newer."
  } else {
    Write-Host "  Node.js not found on this PC."
  }

  Write-Host "-> Installing Node.js (required for Promptly hooks)..."

  $refreshed = $false
  function Refresh-Path {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
  }

  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "  Trying winget..."
    try {
      winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --disable-interactivity
      $refreshed = $true
    } catch {
      Write-Host "  winget install did not complete."
    }
  }

  if ($refreshed) { Refresh-Path }

  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -and (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "  Trying Chocolatey..."
    try {
      choco install nodejs-lts -y
      Refresh-Path
    } catch {
      Write-Host "  Chocolatey install did not complete."
    }
  }

  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "Could not install Node.js automatically."
    Write-Host "1. Install Node.js 20 LTS from https://nodejs.org/"
    Write-Host "2. Close and reopen PowerShell"
    Write-Host "3. Rerun the Promptly install command"
    Start-Process "https://nodejs.org/"
    exit 1
  }

  $nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $nodeExe) {
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
  }
  $majorAfter = [int](& $nodeExe -p "parseInt(process.versions.node.split('.')[0], 10)")
  if ($majorAfter -lt 18) {
    Write-Host "Node.js $(& $nodeExe --version) is still too old. Install v18+ from https://nodejs.org/"
    exit 1
  }

  if (-not (Promptly-TestNpmAvailable)) {
    Write-Host "npm not found after Node.js install."
    exit 1
  }

  Promptly-RefreshNpmPath
  & $nodeExe --version
  & $nodeExe -e "process.exit(0)" 2>$null | Out-Null
  if (-not $?) {
    Write-Host "Node.js installed but not runnable - close PowerShell, reopen, and retry."
    exit 1
  }
  Write-Host "Node.js OK"
}
