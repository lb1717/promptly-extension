export type OsId = "mac" | "windows";
export type IdeToolId = "claude_code" | "cursor" | "codex";

export const PLUGIN_PACK_URL = "https://promptly-labs.com/downloads/promptly-coding-agents.zip";
export const INSTALL_BASE_URL = "https://promptly-labs.com/install";
export const NODE_INSTALL_URL = "https://nodejs.org/";

const INSTALL_SCRIPT_SLUG: Record<IdeToolId, string> = {
  claude_code: "claude-code",
  cursor: "cursor",
  codex: "codex"
};

export function integrationsDir(os: OsId): string {
  return os === "mac" ? "$HOME/integrations" : "%USERPROFILE%\\integrations";
}

export function installScriptUrl(os: OsId, tool: IdeToolId): string {
  const slug = INSTALL_SCRIPT_SLUG[tool];
  return os === "mac" ? `${INSTALL_BASE_URL}/${slug}-mac.sh` : `${INSTALL_BASE_URL}/${slug}-windows.ps1`;
}

export function installCommands(os: OsId, tool: IdeToolId): string[] {
  const url = installScriptUrl(os, tool);
  if (os === "mac") {
    return [`curl -fsSL ${url} | bash`];
  }
  return [`irm ${url} | iex`];
}

export function telemetryCli(os: OsId): string {
  if (os === "mac") {
    return "node $HOME/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs";
  }
  return "node %USERPROFILE%\\integrations\\packages\\telemetry-cli\\bin\\promptly-telemetry.mjs";
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

