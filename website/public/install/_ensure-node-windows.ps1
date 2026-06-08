function Ensure-NodeJs {
  Write-Host "-> Checking Node.js..."
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCmd) {
    $major = [int](node -p "parseInt(process.versions.node.split('.')[0], 10)")
    if ($major -ge 18) {
      node --version
      if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host "npm not found. Reinstall Node.js from https://nodejs.org/"
        exit 1
      }
      Write-Host "Node.js OK"
      return
    }
    Write-Host "  Found Node $(node --version) - need v18 or newer."
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

  if (-not (Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "  Trying Chocolatey..."
    try {
      choco install nodejs-lts -y
      Refresh-Path
    } catch {
      Write-Host "  Chocolatey install did not complete."
    }
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "Could not install Node.js automatically."
    Write-Host "1. Install Node.js 20 LTS from https://nodejs.org/"
    Write-Host "2. Close and reopen PowerShell"
    Write-Host "3. Rerun the Promptly install command"
    Start-Process "https://nodejs.org/"
    exit 1
  }

  $majorAfter = [int](node -p "parseInt(process.versions.node.split('.')[0], 10)")
  if ($majorAfter -lt 18) {
    Write-Host "Node.js $(node --version) is still too old. Install v18+ from https://nodejs.org/"
    exit 1
  }

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm not found after Node.js install."
    exit 1
  }

  node --version
  Write-Host "Node.js OK"
}
