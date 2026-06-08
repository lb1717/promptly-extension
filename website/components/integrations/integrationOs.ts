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

export const ALL_AGENTS_SCRIPT_SLUG = "all-agents";

export function allAgentsInstallScriptUrl(os: OsId): string {
  return os === "mac"
    ? `${INSTALL_BASE_URL}/${ALL_AGENTS_SCRIPT_SLUG}-mac.sh`
    : `${INSTALL_BASE_URL}/${ALL_AGENTS_SCRIPT_SLUG}-windows.ps1`;
}

export function allAgentsInstallCommands(os: OsId): string[] {
  const url = allAgentsInstallScriptUrl(os);
  if (os === "mac") {
    return [`curl -fsSL ${url} | bash`];
  }
  return [`irm ${url} | iex`];
}

export function verifyInstallCommands(os: OsId): string[] {
  const cli = telemetryCli(os);
  return [
    `${cli} status`,
    `${cli} status --tool claude_code`,
    `${cli} status --tool cursor`,
    `${cli} status --tool codex`
  ];
}

export function verifyInstallCommandsPowerShell(): string[] {
  const cli = telemetryCliPowerShell();
  return [
    `${cli} status`,
    `${cli} status --tool claude_code`,
    `${cli} status --tool cursor`,
    `${cli} status --tool codex`
  ];
}

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

export function statusCommand(os: OsId, tool: IdeToolId): string {
  return `${telemetryCli(os)} status --tool ${tool}`;
}

export function statusCommandPowerShell(tool: IdeToolId): string {
  return `${telemetryCliPowerShell()} status --tool ${tool}`;
}

export function connectCommands(os: OsId, tool: IdeToolId, code: string): string[] {
  const login = loginCommand(os, tool, code);
  const status = statusCommand(os, tool);
  return [`${login} && ${status}`];
}

export function connectCommandsPowerShell(tool: IdeToolId, code: string): string[] {
  const login = loginCommandPowerShell(tool, code);
  const status = statusCommandPowerShell(tool);
  return [`${login}; if ($LASTEXITCODE -eq 0) { ${status} }`];
}

export type AllAgentsPairCodes = Record<IdeToolId, string>;

const ALL_IDE_TOOLS: IdeToolId[] = ["claude_code", "cursor", "codex"];

/** One paste: fresh install all agents, pair all three, verify telemetry CLI. */
export function allAgentsFullSetupCommands(os: OsId, codes: AllAgentsPairCodes): string[] {
  const install = allAgentsInstallCommands(os)[0]!;
  if (os === "mac") {
    const parts = [
      install,
      ...ALL_IDE_TOOLS.map((tool) => loginCommand(os, tool, codes[tool])),
      ...ALL_IDE_TOOLS.map((tool) => statusCommand(os, tool))
    ];
    return [parts.join(" && ")];
  }
  let ps = `${install}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`;
  for (const tool of ALL_IDE_TOOLS) {
    ps += `; ${loginCommandPowerShell(tool, codes[tool])}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`;
  }
  for (const tool of ALL_IDE_TOOLS) {
    ps += `; ${statusCommandPowerShell(tool)}`;
  }
  return [ps];
}

export function allAgentsSetupValidationItems(): string[] {
  return [
    "Promptly all-agents install summary",
    '"Promptly installed for Cursor" (or skipped if Cursor files missing)',
    '"connected": true for claude_code, cursor, and codex in status output'
  ];
}

/** Install then connect in one paste — install must run first (creates the login CLI). */
export function fullSetupCommands(os: OsId, tool: IdeToolId, code: string): string[] {
  if (os === "mac") {
    const install = installCommands("mac", tool)[0];
    const connect = connectCommands("mac", tool, code)[0];
    return [`${install} && ${connect}`];
  }
  const install = installCommands("windows", tool)[0];
  const connect = connectCommandsPowerShell(tool, code)[0];
  return [`${install}; if ($LASTEXITCODE -eq 0) { ${connect} }`];
}

