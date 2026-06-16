# One command: install Promptly for Claude Code + Cursor + Codex, pair to your account, merge stats, verify live tracking.
# Usage: irm https://promptly-labs.com/install/setup-windows.ps1 | iex; Setup-PromptlyAgents -Code YOUR_CODE
param(
  [Parameter(Mandatory = $false)]
  [string]$Code = $env:PROMPTLY_PAIR_CODE
)

$PluginPackUrl = if ($env:PROMPTLY_PLUGIN_PACK_URL) { $env:PROMPTLY_PLUGIN_PACK_URL } else { "https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=1.6.8" }
$Integrations = Join-Path $env:USERPROFILE "integrations"
$InstallBase = if ($env:PROMPTLY_INSTALL_BASE) { $env:PROMPTLY_INSTALL_BASE } else { "https://promptly-labs.com/install" }

# Load shared helpers at script scope (must not run inside a function).
$__loaderRes = Invoke-WebRequest -Uri "$InstallBase/_load-helpers-windows.ps1" -UseBasicParsing
$__loaderText = $__loaderRes.Content
if ($__loaderText -is [byte[]]) {
  $__loaderText = [System.Text.Encoding]::UTF8.GetString($__loaderText)
}
Invoke-Expression ([string]$__loaderText.TrimStart([char]0xFEFF))
if (-not (Get-Command Promptly-UnzipPluginPack -ErrorAction SilentlyContinue)) {
  Write-Host "X Failed to load Promptly install helpers from $InstallBase"
  exit 1
}

function Sync-PromptlyAgentRuntimes {
  param([string]$CliSrc)
  Promptly-SyncAllAgentRuntimes
}

function Setup-PromptlyAgents {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Code
  )

  if (-not $Code -or $Code.Trim().Length -lt 6) {
    Write-Host "Usage: irm ${InstallBase}/setup-windows.ps1 | iex; Setup-PromptlyAgents -Code YOUR_CODE"
    Write-Host ""
    Write-Host "Get YOUR_CODE at https://promptly-labs.com/integrations while signed into the Promptly account you want."
    exit 1
  }

  if (-not (Get-Command Ensure-NodeJs -ErrorAction SilentlyContinue)) {
    Write-Host "X Install helpers are missing. Re-run: irm ${InstallBase}/setup-windows.ps1 | iex"
    exit 1
  }

  Ensure-NodeJs

  $zipPath = Join-Path $env:USERPROFILE "promptly.zip"
  Write-Host "-> Downloading Promptly plugin pack (Claude Code, Cursor, Codex)..."
  Invoke-WebRequest -Uri $PluginPackUrl -OutFile $zipPath -UseBasicParsing
  Promptly-UnzipPluginPack -ZipPath $zipPath -Dest $env:USERPROFILE
  if (-not (Promptly-VerifyPluginPack -Integrations $Integrations)) { exit 1 }

  $installed = @()
  $skipped = @()
  $failed = @()

  function Register-AgentResult {
    param([string]$Label, $ExitCode)
    $code = 1
    if ($ExitCode -is [int]) {
      $code = $ExitCode
    } else {
      foreach ($item in @($ExitCode)) {
        if ($item -is [int]) {
          $code = $item
          break
        }
      }
    }
    if ($code -eq 0) { $script:installed += $Label }
    elseif ($code -eq 2) { $script:skipped += $Label }
    else { $script:failed += $Label }
  }

  Register-AgentResult "Cursor" (Promptly-InstallForCursor -Integrations $Integrations)
  Register-AgentResult "Claude Code" (Promptly-InstallForClaudeCode -Integrations $Integrations)
  Register-AgentResult "Codex" (Promptly-InstallForCodex -Integrations $Integrations)

  Write-Host ""
  Write-Host "Promptly all-agents install summary"
  if ($installed.Count) { Write-Host "  Installed: $($installed -join ', ')" }
  if ($skipped.Count) { Write-Host "  Skipped (CLI not available): $($skipped -join ', ')" }
  if ($failed.Count) { Write-Host "  Failed: $($failed -join ', ')" }
  Write-Host ""

  if (-not $installed.Count) { exit 1 }

  $cliDest = Join-Path $env:USERPROFILE "integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"
  if (-not (Test-Path $cliDest)) {
    Write-Host "X Could not install telemetry CLI from plugin pack."
    exit 1
  }

  $nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $nodeExe) {
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
  }

  Write-Host "-> Pairing all agents, merging stats, and verifying live uploads..."
  & $nodeExe $cliDest fix-account $Code

  Write-Host "-> Syncing hooks + telemetry into Claude Code, Cursor, and Codex runtimes..."
  Sync-PromptlyAgentRuntimes -CliSrc $cliDest

  Write-Host "-> Verifying hook wiring..."
  & $nodeExe $cliDest status --tool codex 2>&1 | Write-Host
  & $nodeExe $cliDest status --tool claude_code 2>&1 | Write-Host
  & $nodeExe $cliDest status --tool cursor 2>&1 | Write-Host

  Write-Host "-> Syncing AI subscription usage (Claude, Codex, Cursor)..."
  Write-Host "  First-time setup opens your browser once for claude.ai sign-in."
  & $nodeExe $cliDest usage-sync --login-claude
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Subscription sync incomplete — resync anytime at https://promptly-labs.com/integrations#resync-subscriptions"
  } else {
    Write-Host "Subscription usage synced — use Refresh on your stats page anytime."
  }

  Write-Host ""
  Write-Host "OK. Restart Claude Code, Cursor, and Codex if they were open, then send a test prompt."
  Write-Host ""
  Write-Host "Enable hooks after reopening:"
  Write-Host "  Codex: open your project, type /hooks, and trust Promptly hooks"
  Write-Host "  Cursor: reload the window and allow hooks when prompted"
  Write-Host "  Claude Code: run /reload-plugins once, then send a prompt"
  Write-Host ""
  Write-Host "Stats: https://promptly-labs.com/account/statistics"
}

if ($Code) {
  Setup-PromptlyAgents -Code $Code
}
