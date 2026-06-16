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
  & $npmCmd @Args
  return $LASTEXITCODE
}

function Promptly-RefreshNpmPath {
  $npmCmd = Promptly-GetNpmCmdPath
  if (-not $npmCmd) { return }
  $nodeDir = Split-Path $npmCmd -Parent
  $globalPrefix = (& $npmCmd prefix -g 2>&1 | Select-Object -Last 1).ToString().Trim()
  if ($globalPrefix -and (Test-Path -LiteralPath $globalPrefix)) {
    $env:Path = "$globalPrefix;$nodeDir;$env:Path"
    return
  }
  $env:Path = "$nodeDir;$env:Path"
}

function Promptly-GetGlobalCliPath {
  param([Parameter(Mandatory)][string]$Name)
  Promptly-RefreshNpmPath
  $candidates = @()
  $npmCmd = Promptly-GetNpmCmdPath
  if ($npmCmd) {
    $globalPrefix = (& $npmCmd prefix -g 2>&1 | Select-Object -Last 1).ToString().Trim()
    if ($globalPrefix) {
      $candidates += (Join-Path $globalPrefix "$Name.cmd")
    }
  }
  $candidates += (Join-Path $env:APPDATA "npm\$Name.cmd")
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  return $null
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
