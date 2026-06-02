export type OsId = "mac" | "windows";

export const PLUGIN_PACK_URL = "https://promptly-labs.com/downloads/promptly-coding-agents.zip";

export function integrationsDir(os: OsId): string {
  return os === "mac" ? "$HOME/integrations" : "%USERPROFILE%\\integrations";
}

export function telemetryCli(os: OsId): string {
  if (os === "mac") {
    return "node $HOME/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs";
  }
  return "node %USERPROFILE%\\integrations\\packages\\telemetry-cli\\bin\\promptly-telemetry.mjs";
}

export function downloadCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      `curl -L -o "$HOME/promptly.zip" ${PLUGIN_PACK_URL}`,
      'unzip -o "$HOME/promptly.zip" -d "$HOME"',
      'test -f "$HOME/integrations/.claude-plugin/marketplace.json" && echo "Download OK"'
    ];
  }
  return [
    `curl -L -o "%USERPROFILE%\\promptly.zip" ${PLUGIN_PACK_URL}`,
    'tar -xf "%USERPROFILE%\\promptly.zip" -C "%USERPROFILE%"',
    'if exist "%USERPROFILE%\\integrations\\.claude-plugin\\marketplace.json" echo Download OK'
  ];
}

export function downloadCommandsPowerShell(): string[] {
  return [
    `Invoke-WebRequest -Uri "${PLUGIN_PACK_URL}" -OutFile "$env:USERPROFILE\\promptly.zip"`,
    'Expand-Archive -Path "$env:USERPROFILE\\promptly.zip" -DestinationPath "$env:USERPROFILE" -Force',
    'Test-Path "$env:USERPROFILE\\integrations\\.claude-plugin\\marketplace.json"'
  ];
}

export function marketplacePath(os: OsId): string {
  return os === "mac" ? "$HOME/integrations" : "%USERPROFILE%\\integrations";
}

export function claudeMarketplaceCommand(os: OsId): string {
  return os === "mac"
    ? "/plugin marketplace add $HOME/integrations"
    : "/plugin marketplace add %USERPROFILE%/integrations";
}

export function cursorInstallCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      "mkdir -p ~/.cursor/plugins/local",
      'cp -R "$HOME/integrations/cursor" ~/.cursor/plugins/local/promptly-cursor'
    ];
  }
  return [
    'mkdir "%USERPROFILE%\\.cursor\\plugins\\local" 2>nul',
    'xcopy /E /I /Y "%USERPROFILE%\\integrations\\cursor" "%USERPROFILE%\\.cursor\\plugins\\local\\promptly-cursor"'
  ];
}

export function cursorInstallCommandsPowerShell(): string[] {
  return [
    'New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.cursor\\plugins\\local" | Out-Null',
    'Copy-Item -Recurse -Force "$env:USERPROFILE\\integrations\\cursor" "$env:USERPROFILE\\.cursor\\plugins\\local\\promptly-cursor"'
  ];
}
