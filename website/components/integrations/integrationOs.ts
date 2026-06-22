export type OsId = "mac" | "windows";
export type IdeToolId = "claude_code" | "cursor" | "codex";

export const PLUGIN_PACK_VERSION = "1.4.14";
export const PLUGIN_PACK_URL = `https://promptly-labs.com/downloads/promptly-coding-agents.zip?v=${PLUGIN_PACK_VERSION}`;
export const INSTALL_BASE_URL = "https://promptly-labs.com/install";
export const NODE_INSTALL_URL = "https://nodejs.org/";

const INSTALL_SCRIPT_SLUG: Record<IdeToolId, string> = {
  claude_code: "claude-code",
  cursor: "cursor",
  codex: "codex"
};

export const ALL_AGENTS_SCRIPT_SLUG = "all-agents";
export const SETUP_SCRIPT_SLUG = "setup";
export const FULL_SETUP_SCRIPT_SLUG = "full-setup";
export const COMPANION_SCRIPT_SLUG = "companion";

export function quietEnvPrefix(os: OsId): string {
  return os === "mac" ? "PROMPTLY_QUIET=1 " : '$env:PROMPTLY_QUIET="1"; ';
}

export function setupScriptUrl(os: OsId): string {
  return os === "mac"
    ? `${INSTALL_BASE_URL}/${SETUP_SCRIPT_SLUG}-mac.sh`
    : `${INSTALL_BASE_URL}/${SETUP_SCRIPT_SLUG}-windows.ps1`;
}

/** Re-sync subscription usage after new logins or plan changes (integrations already installed). */
export function subscriptionResyncCommand(os: OsId): string {
  if (os === "mac") {
    return `${telemetryCli("mac")} sync-runtimes && ${telemetryCli("mac")} usage-sync --login-claude`;
  }
  const cli = telemetryCliPowerShell();
  return `${cli} sync-runtimes; if ($LASTEXITCODE -eq 0) { ${cli} usage-sync --login-claude }`;
}

/** One curl command: install + pair + merge stats + sync hooks + subscription usage. */
export function setupCurlCommand(os: OsId, code: string, options?: { quiet?: boolean }): string {
  const url = setupScriptUrl(os);
  const quiet = options?.quiet ? quietEnvPrefix(os) : "";
  if (os === "mac") {
    return `${quiet}curl -fsSL ${url} | bash -s -- ${code}`;
  }
  return `${quiet}irm ${url} | iex; Setup-PromptlyAgents -Code ${code}`;
}

export function setupCommands(os: OsId, code: string, options?: { quiet?: boolean }): string[] {
  return [setupCurlCommand(os, code, options)];
}

export function fullSetupOnboardingCommands(os: OsId, code: string): string[] {
  const url =
    os === "mac"
      ? `${INSTALL_BASE_URL}/${FULL_SETUP_SCRIPT_SLUG}-mac.sh`
      : `${INSTALL_BASE_URL}/${FULL_SETUP_SCRIPT_SLUG}-windows.ps1`;
  if (os === "mac") {
    return [`curl -fsSL ${url} | bash -s -- ${code}`];
  }
  return [`irm ${url} | iex; Setup-PromptlyFull -Code ${code}`];
}

export function companionInstallCommands(os: OsId): string[] {
  const url =
    os === "mac"
      ? `${INSTALL_BASE_URL}/${COMPANION_SCRIPT_SLUG}-mac.sh`
      : `${INSTALL_BASE_URL}/${COMPANION_SCRIPT_SLUG}-windows.ps1`;
  if (os === "mac") {
    return [`${quietEnvPrefix("mac")}curl -fsSL ${url} | bash`];
  }
  return [`${quietEnvPrefix("windows")}irm ${url} | iex`];
}

export const PROMPTLY_INSTALL_SUCCESS_LINE = "Promptly Successfully Installed";

export type OnboardingInstallMode = "combined" | "agents" | "desktop";

export function onboardingSetupValidationItems(_mode: OnboardingInstallMode): string[] {
  return [PROMPTLY_INSTALL_SUCCESS_LINE];
}

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

export function siblingLoginCommand(os: OsId, tool: IdeToolId): string {
  return `${telemetryCli(os)} login --tool ${tool} --from-sibling`;
}

export function siblingLoginCommandPowerShell(tool: IdeToolId): string {
  return `${telemetryCliPowerShell()} login --tool ${tool} --from-sibling`;
}

export function fixAccountScriptUrl(os: OsId): string {
  return os === "mac"
    ? `${INSTALL_BASE_URL}/fix-account-mac.sh`
    : `${INSTALL_BASE_URL}/fix-account-windows.ps1`;
}

/** One curl command: download latest CLI + fix split accounts with one pairing code. */
export function fixAccountCurlCommand(os: OsId, code: string): string {
  const url = fixAccountScriptUrl(os);
  if (os === "mac") {
    return `curl -fsSL ${url} | bash -s -- ${code}`;
  }
  return `irm ${url} | iex; Fix-PromptlyAccount -Code ${code}`;
}

export function fixAccountCommands(os: OsId, code: string): string[] {
  return [fixAccountCurlCommand(os, code)];
}

export function fixAccountLocalCommand(os: OsId, code: string): string {
  return `${telemetryCli(os)} fix-account ${code}`;
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

/** One paste: install all agents, pair, merge stats, sync live hooks, verify uploads. */
export function allAgentsFullSetupCommands(os: OsId, codes: AllAgentsPairCodes): string[] {
  return setupCommands(os, codes.claude_code);
}

export function allAgentsSetupValidationItems(): string[] {
  return onboardingSetupValidationItems("agents");
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

