/** Public list prices for vendor AI plans (USD / month). Verified manually — not live-scraped. */
export type VendorPlanPricing = {
  key: string;
  vendor: "anthropic" | "openai" | "cursor";
  displayName: string;
  monthlyUsd: number;
  aliases: string[];
};

export const VENDOR_PLAN_PRICING: VendorPlanPricing[] = [
  { key: "claude_pro", vendor: "anthropic", displayName: "Claude Pro", monthlyUsd: 20, aliases: ["pro"] },
  { key: "claude_max_5x", vendor: "anthropic", displayName: "Claude Max (5×)", monthlyUsd: 100, aliases: ["max", "max_5x", "max-5x"] },
  { key: "claude_max_20x", vendor: "anthropic", displayName: "Claude Max (20×)", monthlyUsd: 200, aliases: ["max_20x", "max-20x", "max 20x"] },
  { key: "chatgpt_plus", vendor: "openai", displayName: "ChatGPT Plus", monthlyUsd: 20, aliases: ["plus"] },
  { key: "chatgpt_pro", vendor: "openai", displayName: "ChatGPT Pro", monthlyUsd: 200, aliases: ["pro"] },
  { key: "chatgpt_pro_5x", vendor: "openai", displayName: "ChatGPT Pro (5×)", monthlyUsd: 200, aliases: ["pro_5x"] },
  { key: "chatgpt_team", vendor: "openai", displayName: "ChatGPT Team", monthlyUsd: 25, aliases: ["team"] },
  { key: "chatgpt_go", vendor: "openai", displayName: "ChatGPT Go", monthlyUsd: 8, aliases: ["go"] },
  { key: "cursor_pro", vendor: "cursor", displayName: "Cursor Pro", monthlyUsd: 20, aliases: ["pro"] },
  { key: "cursor_pro_plus", vendor: "cursor", displayName: "Cursor Pro+", monthlyUsd: 60, aliases: ["pro_plus", "pro plus", "pro+"] },
  { key: "cursor_ultra", vendor: "cursor", displayName: "Cursor Ultra", monthlyUsd: 200, aliases: ["ultra"] },
  { key: "cursor_business", vendor: "cursor", displayName: "Cursor Business", monthlyUsd: 40, aliases: ["business", "team"] }
];

export function resolveVendorPlanPricing(
  vendor: "anthropic" | "openai" | "cursor",
  planSlug: string | null | undefined,
  planDisplay: string | null | undefined
): VendorPlanPricing | null {
  const raw = `${planSlug || ""} ${planDisplay || ""}`.trim().toLowerCase();
  if (!raw) return null;
  for (const row of VENDOR_PLAN_PRICING) {
    if (row.vendor !== vendor) continue;
    if (row.aliases.some((alias) => raw.includes(alias.replace(/_/g, " ")) || raw.includes(alias))) {
      return row;
    }
    if (raw.includes(row.key.replace(/_/g, " "))) return row;
  }
  return null;
}

export function dollarsUsedFromUtilization(monthlyUsd: number, utilizationPercent: number, windowSeconds: number | null): number {
  const util = Math.max(0, Math.min(100, utilizationPercent));
  const monthSeconds = 30 * 86400;
  const window = windowSeconds && windowSeconds > 0 ? windowSeconds : 7 * 86400;
  const proratedPlan = monthlyUsd * (window / monthSeconds);
  return Math.round((util / 100) * proratedPlan * 100) / 100;
}

export function dollarsUnusedFromUtilization(monthlyUsd: number, utilizationPercent: number, windowSeconds: number | null): number {
  const util = Math.max(0, Math.min(100, utilizationPercent));
  const monthSeconds = 30 * 86400;
  const window = windowSeconds && windowSeconds > 0 ? windowSeconds : 7 * 86400;
  const proratedPlan = monthlyUsd * (window / monthSeconds);
  return Math.round(((100 - util) / 100) * proratedPlan * 100) / 100;
}
