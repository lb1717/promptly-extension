export type OsId = "mac" | "windows";

export const PLUGIN_PACK_URL = "https://promptly-labs.com/downloads/promptly-coding-agents.zip";
export const NODE_INSTALL_URL = "https://nodejs.org/";

export function integrationsDir(os: OsId): string {
  return os === "mac" ? "$HOME/integrations" : "%USERPROFILE%\\integrations";
}

export function telemetryCli(os: OsId): string {
  if (os === "mac") {
    return "node $HOME/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs";
  }
  return "node %USERPROFILE%\\integrations\\packages\\telemetry-cli\\bin\\promptly-telemetry.mjs";
}

/** Ensures npm global binaries (codex, claude) are on PATH for this shell session. */
export function npmPathFix(os: OsId): string[] {
  if (os === "mac") {
    return ['export PATH="$(npm prefix -g)/bin:$PATH"'];
  }
  return ['for /f "delims=" %i in (\'npm prefix -g\') do @set "PATH=%i\\bin;%PATH%"'];
}

export function npmPathFixPowerShell(): string[] {
  return ['$env:Path = "$(npm prefix -g)\\bin;" + $env:Path'];
}

export function nodePrerequisiteCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      "if ! command -v node >/dev/null 2>&1; then",
      `  echo "Node.js not found. Install 18+ from ${NODE_INSTALL_URL} then run this again."`,
      "  exit 1",
      "fi",
      "node --version"
    ];
  }
  return [
    "node --version >nul 2>&1 || (",
    `  echo Install Node.js 18+ from ${NODE_INSTALL_URL}`,
    "  exit /b 1",
    ")",
    "node --version"
  ];
}

export function nodePrerequisitePowerShell(): string[] {
  return [
    "if (-not (Get-Command node -ErrorAction SilentlyContinue)) {",
    `  Write-Host "Install Node.js 18+ from ${NODE_INSTALL_URL}"`,
    "  exit 1",
    "}",
    "node --version"
  ];
}

export function codexPrerequisiteCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      ...nodePrerequisiteCommands("mac"),
      ...npmPathFix("mac"),
      "if ! command -v codex >/dev/null 2>&1; then",
      '  echo "Installing Codex CLI..."',
      "  npm install -g @openai/codex",
      '  export PATH="$(npm prefix -g)/bin:$PATH"',
      "fi",
      "if ! command -v codex >/dev/null 2>&1; then",
      '  echo "codex still not found. Add this line to ~/.zshrc, open a new terminal, and run step 1 again:"',
      '  echo "export PATH=\\"$(npm prefix -g)/bin:\\$PATH\\""',
      "  exit 1",
      "fi",
      "codex --version"
    ];
  }
  return [
    ...nodePrerequisiteCommands("windows"),
    ...npmPathFix("windows"),
    "where codex >nul 2>&1 || (",
    '  echo Installing Codex CLI...',
    "  npm install -g @openai/codex",
    '  for /f "delims=" %i in (\'npm prefix -g\') do @set "PATH=%i\\bin;%PATH%"',
    ")",
    "where codex >nul 2>&1 || (",
    "  echo codex still not found. Close this window, open a new Command Prompt, and run step 1 again.",
    "  exit /b 1",
    ")",
    "codex --version"
  ];
}

export function codexPrerequisitePowerShell(): string[] {
  return [
    ...nodePrerequisitePowerShell(),
    ...npmPathFixPowerShell(),
    "if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {",
    '  Write-Host "Installing Codex CLI..."',
    "  npm install -g @openai/codex",
    '  $env:Path = "$(npm prefix -g)\\bin;" + $env:Path',
    "}",
    "if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {",
    '  Write-Host "codex still not found. Close PowerShell, open a new window, and run step 1 again."',
    "  exit 1",
    "}",
    "codex --version"
  ];
}

export function claudePrerequisiteCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      ...nodePrerequisiteCommands("mac"),
      ...npmPathFix("mac"),
      "if ! command -v claude >/dev/null 2>&1; then",
      '  echo "Installing Claude Code CLI..."',
      "  npm install -g @anthropic-ai/claude-code",
      "fi",
      "claude --version"
    ];
  }
  return [
    ...nodePrerequisiteCommands("windows"),
    ...npmPathFix("windows"),
    "where claude >nul 2>&1 || npm install -g @anthropic-ai/claude-code",
    "claude --version"
  ];
}

export function claudePrerequisitePowerShell(): string[] {
  return [
    ...nodePrerequisitePowerShell(),
    ...npmPathFixPowerShell(),
    "if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {",
    '  Write-Host "Installing Claude Code CLI..."',
    "  npm install -g @anthropic-ai/claude-code",
    "}",
    "claude --version"
  ];
}

export function cursorPrerequisiteCommands(os: OsId): string[] {
  return nodePrerequisiteCommands(os);
}

export function cursorPrerequisitePowerShell(): string[] {
  return nodePrerequisitePowerShell();
}

export function downloadCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      ...nodePrerequisiteCommands("mac"),
      `curl -L -o "$HOME/promptly.zip" ${PLUGIN_PACK_URL}`,
      'unzip -o "$HOME/promptly.zip" -d "$HOME"',
      'test -f "$HOME/integrations/.claude-plugin/marketplace.json" && echo "Plugin pack OK"'
    ];
  }
  return [
    ...nodePrerequisiteCommands("windows"),
    `curl -L -o "%USERPROFILE%\\promptly.zip" ${PLUGIN_PACK_URL}`,
    'tar -xf "%USERPROFILE%\\promptly.zip" -C "%USERPROFILE%"',
    'if exist "%USERPROFILE%\\integrations\\.claude-plugin\\marketplace.json" echo Plugin pack OK'
  ];
}

export function downloadCommandsPowerShell(): string[] {
  return [
    ...nodePrerequisitePowerShell(),
    `Invoke-WebRequest -Uri "${PLUGIN_PACK_URL}" -OutFile "$env:USERPROFILE\\promptly.zip"`,
    'Expand-Archive -Path "$env:USERPROFILE\\promptly.zip" -DestinationPath "$env:USERPROFILE" -Force',
    'if (Test-Path "$env:USERPROFILE\\integrations\\.claude-plugin\\marketplace.json") { "Plugin pack OK" }'
  ];
}

export function marketplacePath(os: OsId): string {
  return os === "mac" ? "$HOME/integrations" : "%USERPROFILE%\\integrations";
}

export function codexMarketplaceCommands(os: OsId): string[] {
  const mp = marketplacePath(os);
  if (os === "mac") {
    return [
      ...npmPathFix("mac"),
      `codex plugin marketplace add "${mp}"`,
      "codex plugin marketplace list"
    ];
  }
  return [
    ...npmPathFix("windows"),
    `codex plugin marketplace add "${mp}"`,
    "codex plugin marketplace list"
  ];
}

export function codexMarketplacePowerShell(): string[] {
  return [
    ...npmPathFixPowerShell(),
    'codex plugin marketplace add "$env:USERPROFILE\\integrations"',
    "codex plugin marketplace list"
  ];
}

export function codexPluginInstallCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      ...npmPathFix("mac"),
      "codex plugin add promptly-codex@promptly-labs || codex plugin install promptly-codex@promptly-labs",
      "codex plugin list"
    ];
  }
  return [
    ...npmPathFix("windows"),
    "codex plugin add promptly-codex@promptly-labs || codex plugin install promptly-codex@promptly-labs",
    "codex plugin list"
  ];
}

export function codexPluginInstallPowerShell(): string[] {
  return [
    ...npmPathFixPowerShell(),
    "codex plugin add promptly-codex@promptly-labs",
    "if ($LASTEXITCODE -ne 0) { codex plugin install promptly-codex@promptly-labs }",
    "codex plugin list"
  ];
}

export function telemetryCliPowerShell(): string {
  return 'node "$env:USERPROFILE\\integrations\\packages\\telemetry-cli\\bin\\promptly-telemetry.mjs"';
}

export function loginCommand(os: OsId, tool: string, code: string): string {
  return `${telemetryCli(os)} login ${code} --tool ${tool}`;
}

export function loginCommandPowerShell(tool: string, code: string): string {
  return `${telemetryCliPowerShell()} login ${code} --tool ${tool}`;
}

export function statusCommand(os: OsId): string {
  return `${telemetryCli(os)} status`;
}

export function statusCommandPowerShell(): string {
  return `${telemetryCliPowerShell()} status`;
}

export function connectCommands(os: OsId, tool: string, code: string): string[] {
  return [...nodePrerequisiteCommands(os), loginCommand(os, tool, code), statusCommand(os)];
}

export function connectCommandsPowerShell(tool: string, code: string): string[] {
  return [...nodePrerequisitePowerShell(), loginCommandPowerShell(tool, code), statusCommandPowerShell()];
}

export function claudeMarketplaceCommand(os: OsId): string {
  return os === "mac"
    ? "/plugin marketplace add $HOME/integrations"
    : "/plugin marketplace add %USERPROFILE%/integrations";
}

export function cursorInstallCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      ...nodePrerequisiteCommands("mac"),
      "mkdir -p ~/.cursor/plugins/local",
      'cp -R "$HOME/integrations/cursor" ~/.cursor/plugins/local/promptly-cursor',
      'test -d ~/.cursor/plugins/local/promptly-cursor/.cursor-plugin && echo "Cursor plugin OK"'
    ];
  }
  return [
    ...nodePrerequisiteCommands("windows"),
    'mkdir "%USERPROFILE%\\.cursor\\plugins\\local" 2>nul',
    'xcopy /E /I /Y "%USERPROFILE%\\integrations\\cursor" "%USERPROFILE%\\.cursor\\plugins\\local\\promptly-cursor"',
    'if exist "%USERPROFILE%\\.cursor\\plugins\\local\\promptly-cursor\\.cursor-plugin" echo Cursor plugin OK'
  ];
}

export function cursorInstallCommandsPowerShell(): string[] {
  return [
    ...nodePrerequisitePowerShell(),
    'New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.cursor\\plugins\\local" | Out-Null',
    'Copy-Item -Recurse -Force "$env:USERPROFILE\\integrations\\cursor" "$env:USERPROFILE\\.cursor\\plugins\\local\\promptly-cursor"',
    'if (Test-Path "$env:USERPROFILE\\.cursor\\plugins\\local\\promptly-cursor\\.cursor-plugin") { "Cursor plugin OK" }'
  ];
}
