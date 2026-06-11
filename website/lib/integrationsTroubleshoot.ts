import type { OsId } from "@/components/integrations/integrationOs";
import {
  fixAccountCurlCommand,
  setupCurlCommand,
  telemetryCli,
  verifyInstallCommands
} from "@/components/integrations/integrationOs";

const PLACEHOLDER_CODE = "YOUR_CODE";

export function troubleshootStatusCommands(os: OsId): string[] {
  return verifyInstallCommands(os);
}

export function troubleshootReinstallCommand(os: OsId): string {
  return setupCurlCommand(os, PLACEHOLDER_CODE);
}

export function troubleshootFixAccountCommand(os: OsId): string {
  return fixAccountCurlCommand(os, PLACEHOLDER_CODE);
}

export function troubleshootUninstallCommands(os: OsId): string[] {
  if (os === "mac") {
    return [
      "claude plugin uninstall promptly-claude-code@promptly-labs",
      "codex plugin remove promptly-codex@promptly-labs"
    ];
  }
  return [
      "# Remove Promptly plugin folders if reinstall keeps failing",
      "Remove-Item -Recurse -Force \"$env:USERPROFILE\\integrations\" -ErrorAction SilentlyContinue"
    ];
}

export function troubleshootDiagnosticsCommand(os: OsId): string {
  const cli = telemetryCli(os);
  return `${cli} diagnostics --tool claude_code`;
}
