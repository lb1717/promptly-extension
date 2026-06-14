export type VendorUsageInstallOs = "mac" | "windows";

export function detectVendorUsageInstallOs(): VendorUsageInstallOs {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  return "mac";
}

/** One paste in Terminal on the machine with Claude Code / Codex logins. */
export function vendorUsageSyncCommand(os: VendorUsageInstallOs): string {
  if (os === "windows") {
    return 'node "$env:USERPROFILE\\integrations\\packages\\telemetry-cli\\bin\\promptly-telemetry.mjs" usage-sync';
  }
  return 'node "$HOME/integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs" usage-sync';
}
