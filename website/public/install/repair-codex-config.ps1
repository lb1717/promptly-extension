# Repair ~/.codex/config.toml when Promptly hook trust wrote invalid Windows path escapes.
# Usage: irm https://promptly-labs.com/install/repair-codex-config.ps1 | iex
$config = Join-Path $env:USERPROFILE ".codex\config.toml"
if (-not (Test-Path -LiteralPath $config)) {
  Write-Host "No config.toml at $config"
  exit 0
}
$lines = Get-Content -LiteralPath $config
$out = New-Object System.Collections.Generic.List[string]
$skip = $false
foreach ($line in $lines) {
  if ($line -match '^\[hooks\.state\.' -and ($line -match 'hooks\.json' -or $line -match 'promptly-codex')) {
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
Write-Host "Quit and reopen Codex, then rerun setup or: node `"`$env:USERPROFILE\integrations\packages\telemetry-cli\bin\promptly-telemetry.mjs`" codex-trust-hooks"
