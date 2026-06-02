export type OsId = "mac" | "windows";
export type IdeToolId = "claude_code" | "cursor" | "codex";

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

export function npmPathFix(os: OsId): string {
  if (os === "mac") {
    return 'export PATH="$(npm prefix -g)/bin:$PATH"';
  }
  return 'for /f "delims=" %i in (\'npm prefix -g\') do @set "PATH=%i\\bin;%PATH%"';
}

export function npmPathFixPowerShell(): string {
  return '$env:Path = "$(npm prefix -g)\\bin;" + $env:Path';
}

export function nodeCheckCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      "node --version 2>/dev/null || { echo \"Install Node.js 18+ from " + NODE_INSTALL_URL + '\"; exit 1; }',
      'echo "✓ Node.js OK"'
    ];
  }
  return [
    "node --version >nul 2>&1 || (echo Install Node.js 18+ from " + NODE_INSTALL_URL + " & exit /b 1)",
    "echo Node.js OK"
  ];
}

export function nodeCheckPowerShell(): string[] {
  return [
    "if (-not (Get-Command node -ErrorAction SilentlyContinue)) {",
    `  Write-Host "Install Node.js 18+ from ${NODE_INSTALL_URL}"`,
    "  exit 1",
    "}",
    'node --version; "Node.js OK"'
  ];
}

export function codexCliSetupCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      ...nodeCheckCommands("mac"),
      npmPathFix("mac"),
      "command -v codex >/dev/null 2>&1 || npm install -g @openai/codex",
      npmPathFix("mac"),
      "codex --version",
      'echo "✓ Codex CLI ready — continue to step 2"'
    ];
  }
  return [
    ...nodeCheckCommands("windows"),
    npmPathFix("windows"),
    "where codex >nul 2>&1 || npm install -g @openai/codex",
    npmPathFix("windows"),
    "codex --version",
    "echo Codex CLI ready"
  ];
}

export function codexCliSetupPowerShell(): string[] {
  return [
    ...nodeCheckPowerShell(),
    npmPathFixPowerShell(),
    "if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { npm install -g @openai/codex }",
    npmPathFixPowerShell(),
    "codex --version",
    '"Codex CLI ready"'
  ];
}

export function claudeCliSetupCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      ...nodeCheckCommands("mac"),
      npmPathFix("mac"),
      "command -v claude >/dev/null 2>&1 || npm install -g @anthropic-ai/claude-code",
      npmPathFix("mac"),
      "claude --version",
      'echo "✓ Claude Code CLI ready — continue to step 2"'
    ];
  }
  return [
    ...nodeCheckCommands("windows"),
    npmPathFix("windows"),
    "where claude >nul 2>&1 || npm install -g @anthropic-ai/claude-code",
    npmPathFix("windows"),
    "claude --version",
    "echo Claude Code CLI ready"
  ];
}

export function claudeCliSetupPowerShell(): string[] {
  return [
    ...nodeCheckPowerShell(),
    npmPathFixPowerShell(),
    "if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { npm install -g @anthropic-ai/claude-code }",
    npmPathFixPowerShell(),
    "claude --version",
    '"Claude Code CLI ready"'
  ];
}

export function downloadCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      `curl -L -o "$HOME/promptly.zip" ${PLUGIN_PACK_URL}`,
      'unzip -o "$HOME/promptly.zip" -d "$HOME"',
      'test -f "$HOME/integrations/.claude-plugin/marketplace.json" && echo "✓ Plugin pack OK" || echo "✗ Failed — retry download"'
    ];
  }
  return [
    `curl -L -o "%USERPROFILE%\\promptly.zip" ${PLUGIN_PACK_URL}`,
    'tar -xf "%USERPROFILE%\\promptly.zip" -C "%USERPROFILE%"',
    'if exist "%USERPROFILE%\\integrations\\.claude-plugin\\marketplace.json" (echo Plugin pack OK) else (echo Failed - retry download)'
  ];
}

export function downloadCommandsPowerShell(): string[] {
  return [
    `Invoke-WebRequest -Uri "${PLUGIN_PACK_URL}" -OutFile "$env:USERPROFILE\\promptly.zip"`,
    'Expand-Archive -Path "$env:USERPROFILE\\promptly.zip" -DestinationPath "$env:USERPROFILE" -Force',
    'if (Test-Path "$env:USERPROFILE\\integrations\\.claude-plugin\\marketplace.json") { "Plugin pack OK" } else { "Failed - retry download" }'
  ];
}

export function marketplacePath(os: OsId): string {
  return os === "mac" ? "$HOME/integrations" : "%USERPROFILE%\\integrations";
}

export function codexPluginSetupCommands(os: OsId): string[] {
  const mp = marketplacePath(os);
  if (os === "mac") {
    return [
      npmPathFix("mac"),
      `codex plugin marketplace add "${mp}"`,
      "codex plugin add promptly-codex@promptly-labs || codex plugin install promptly-codex@promptly-labs",
      "codex plugin list",
      'codex plugin list 2>/dev/null | grep -q promptly-codex && echo "✓ Promptly plugin installed" || echo "✗ Not found — retry this step"'
    ];
  }
  return [
    npmPathFix("windows"),
    `codex plugin marketplace add "${mp}"`,
    "codex plugin add promptly-codex@promptly-labs || codex plugin install promptly-codex@promptly-labs",
    "codex plugin list",
    "codex plugin list | findstr promptly-codex >nul && echo Promptly plugin installed || echo Not found - retry"
  ];
}

export function codexPluginSetupPowerShell(): string[] {
  return [
    npmPathFixPowerShell(),
    'codex plugin marketplace add "$env:USERPROFILE\\integrations"',
    "codex plugin add promptly-codex@promptly-labs",
    "if ($LASTEXITCODE -ne 0) { codex plugin install promptly-codex@promptly-labs }",
    "codex plugin list",
    'if ((codex plugin list) -match "promptly-codex") { "Promptly plugin installed" } else { "Not found - retry" }'
  ];
}

export function telemetryCliPowerShell(): string {
  return 'node "$env:USERPROFILE\\integrations\\packages\\telemetry-cli\\bin\\promptly-telemetry.mjs"';
}

export function loginCommand(os: OsId, tool: string, code: string): string {
  return `${telemetryCli(os)} login --tool ${tool} ${code}`;
}

export function loginCommandPowerShell(tool: string, code: string): string {
  return `${telemetryCliPowerShell()} login --tool ${tool} ${code}`;
}

export function statusCommand(os: OsId): string {
  return `${telemetryCli(os)} status`;
}

export function statusCommandPowerShell(): string {
  return `${telemetryCliPowerShell()} status`;
}

export function connectCommands(os: OsId, tool: string, code: string): string[] {
  const login = loginCommand(os, tool, code);
  const status = statusCommand(os);
  return [`${login} && ${status}`];
}

export function connectCommandsPowerShell(tool: string, code: string): string[] {
  const login = loginCommandPowerShell(tool, code);
  const status = statusCommandPowerShell();
  return [`${login}; if ($LASTEXITCODE -eq 0) { ${status} }`];
}

export function verifyConnectionCommands(os: OsId): string[] {
  return [statusCommand(os)];
}

export function verifyConnectionPowerShell(): string[] {
  return [statusCommandPowerShell()];
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
      'cp -R "$HOME/integrations/cursor" ~/.cursor/plugins/local/promptly-cursor',
      'test -d ~/.cursor/plugins/local/promptly-cursor/.cursor-plugin && echo "✓ Cursor plugin OK" || echo "✗ Copy failed — retry"'
    ];
  }
  return [
    'mkdir "%USERPROFILE%\\.cursor\\plugins\\local" 2>nul',
    'xcopy /E /I /Y "%USERPROFILE%\\integrations\\cursor" "%USERPROFILE%\\.cursor\\plugins\\local\\promptly-cursor"',
    'if exist "%USERPROFILE%\\.cursor\\plugins\\local\\promptly-cursor\\.cursor-plugin" (echo Cursor plugin OK) else (echo Copy failed - retry)'
  ];
}

export function cursorInstallCommandsPowerShell(): string[] {
  return [
    'New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.cursor\\plugins\\local" | Out-Null',
    'Copy-Item -Recurse -Force "$env:USERPROFILE\\integrations\\cursor" "$env:USERPROFILE\\.cursor\\plugins\\local\\promptly-cursor"',
    'if (Test-Path "$env:USERPROFILE\\.cursor\\plugins\\local\\promptly-cursor\\.cursor-plugin") { "Cursor plugin OK" } else { "Copy failed - retry" }'
  ];
}
