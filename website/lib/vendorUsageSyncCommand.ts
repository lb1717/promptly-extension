import {
  subscriptionResyncCommand,
  type OsId
} from "@/components/integrations/integrationOs";

export type VendorUsageInstallOs = OsId;

export function detectVendorUsageInstallOs(): VendorUsageInstallOs {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  return "mac";
}

/** Re-sync subscription usage from Terminal (same command shown on /integrations). */
export function vendorUsageSyncCommand(os: VendorUsageInstallOs): string {
  return subscriptionResyncCommand(os);
}
