import { PLUGIN_PACK_URL } from "@/components/integrations/integrationOs";

export type VendorUsageInstallOs = "mac" | "windows";

export function detectVendorUsageInstallOs(): VendorUsageInstallOs {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  return "mac";
}

/** One paste in Terminal — refreshes sync tool, then uploads Codex + Cursor + Claude (when signed in). */
export function vendorUsageSyncCommand(os: VendorUsageInstallOs): string {
  const cli =
    os === "windows"
      ? 'node "$env:USERPROFILE\\integrations\\packages\\telemetry-cli\\bin\\promptly-telemetry.mjs"'
      : 'node "$HOME/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs"';
  if (os === "mac") {
    return `curl -fsSL "${PLUGIN_PACK_URL}" -o /tmp/promptly-agents.zip && unzip -qo /tmp/promptly-agents.zip -d "$HOME" && ${cli} usage-sync --login-claude`;
  }
  return `${cli} usage-sync --login-claude`;
}
