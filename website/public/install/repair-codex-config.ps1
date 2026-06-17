# Repair ~/.codex/config.toml when Promptly hook trust wrote invalid Windows path escapes.
# Usage: irm https://promptly-labs.com/install/repair-codex-config.ps1 | iex
$config = Join-Path $env:USERPROFILE ".codex\config.toml"
$integrations = Join-Path $env:USERPROFILE "integrations"
$cli = Join-Path $integrations "packages\telemetry-cli\bin\promptly-telemetry.mjs"

if (Test-Path -LiteralPath $cli) {
  $node = if (Get-Command Promptly-GetNodeExe -ErrorAction SilentlyContinue) { Promptly-GetNodeExe } else { (Get-Command node -ErrorAction SilentlyContinue).Source }
  if ($node) {
    & $node $cli codex-repair-config
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Quit and reopen Codex, then rerun setup or: node `"$cli`" codex-trust-hooks"
      exit 0
    }
  }
}

if (-not (Test-Path -LiteralPath $config)) {
  Write-Host "No config.toml at $config"
  exit 0
}

$lines = Get-Content -LiteralPath $config
$out = New-Object System.Collections.Generic.List[string]
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
  $out.Add($line)
}
$text = ($out -join "`n").TrimEnd() + "`n"
[System.IO.File]::WriteAllText($config, $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "OK Repaired $config (removed broken Promptly hook trust entries)."
Write-Host "Quit and reopen Codex, then rerun setup or: node `"$cli`" codex-trust-hooks"
