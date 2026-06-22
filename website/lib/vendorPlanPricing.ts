/** Public list prices for vendor AI plans (USD / month). Verified manually — not live-scraped. */
export type VendorPlanPricing = {
  key: string;
  vendor: "anthropic" | "openai" | "cursor";
  displayName: string;
  monthlyUsd: number;
  aliases: string[];
};

export const VENDOR_PLAN_PRICING: VendorPlanPricing[] = [
  { key: "claude_pro", vendor: "anthropic", displayName: "Claude Pro", monthlyUsd: 20, aliases: ["pro", "claude_pro"] },
  { key: "claude_max_5x", vendor: "anthropic", displayName: "Claude Max (5×)", monthlyUsd: 100, aliases: ["max", "max_5x", "max-5x", "claude_max"] },
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

function normalizePlanSlug(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function resolveVendorPlanPricing(
  vendor: "anthropic" | "openai" | "cursor",
  planSlug: string | null | undefined,
  planDisplay: string | null | undefined
): VendorPlanPricing | null {
  const slug = normalizePlanSlug(planSlug);
  const display = (planDisplay || "").trim().toLowerCase();
  const candidates = VENDOR_PLAN_PRICING.filter((row) => row.vendor === vendor);
  if (!slug && !display) return null;

  if (slug) {
    for (const row of candidates) {
      if (row.aliases.some((alias) => normalizePlanSlug(alias) === slug)) return row;
      if (row.key === `${vendor}_${slug}` || row.key.endsWith(`_${slug}`)) return row;
    }
  }

  const raw = `${slug.replace(/_/g, " ")} ${display}`.trim();
  const aliasMatches = candidates.flatMap((row) =>
    row.aliases.map((alias) => ({
      row,
      alias,
      normalized: alias.replace(/_/g, " ")
    }))
  );
  aliasMatches.sort((a, b) => b.alias.length - a.alias.length);
  for (const { row, alias, normalized } of aliasMatches) {
    if (slug === normalizePlanSlug(alias) || raw.includes(normalized) || raw.includes(alias)) {
      return row;
    }
  }

  for (const row of candidates) {
    if (raw.includes(row.key.replace(/_/g, " "))) return row;
  }
  return null;
}

export function normalizeUtilizationPercent(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

export type VendorWindowUsedPercentContext = {
  limitReached?: boolean;
  previousUtilization?: number | null;
  previousResetsAt?: string | null;
  resetsAt?: string | null;
  windowSeconds?: number | null;
};

/** @deprecated use VendorWindowUsedPercentContext */
export type CodexWindowUsedPercentContext = VendorWindowUsedPercentContext;

export function parseVendorResetsAtIso(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 1_000_000_000) {
    const ms = raw < 1_000_000_000_000 ? raw * 1000 : raw;
    return new Date(ms).toISOString();
  }
  return null;
}

function resetsAtElapsedRatio(resetsAt: string | null | undefined, windowSeconds: number): number | null {
  if (!resetsAt || windowSeconds <= 0) return null;
  const resetMs = Date.parse(resetsAt);
  if (!Number.isFinite(resetMs)) return null;
  const remainingMs = resetMs - Date.now();
  if (remainingMs < 0) return 1;
  return Math.max(0, Math.min(1, 1 - remainingMs / (windowSeconds * 1000)));
}

function windowElapsedRatio(
  window: Record<string, unknown>,
  windowSecondsFallback: number
): number | null {
  const windowSeconds = Number(window.limit_window_seconds ?? windowSecondsFallback) || windowSecondsFallback;
  if (windowSeconds <= 0) return null;

  const resetAfter = Number(window.reset_after_seconds ?? 0);
  if (resetAfter > 0) {
    return Math.max(0, Math.min(1, 1 - resetAfter / windowSeconds));
  }

  const resetsAt = parseVendorResetsAtIso(window.resets_at ?? window.resetsAt);
  return resetsAtElapsedRatio(resetsAt, windowSeconds);
}

/** When weekly Claude utilization stopped being inverted (commit 397035b). @deprecated v3 migration supersedes date gates */
export const CLAUDE_WEEKLY_UTIL_FIX_MS = Date.parse("2026-06-17T14:41:04.000Z");

/** When five-hour Claude utilization stopped being inverted. @deprecated v3 migration supersedes date gates */
export const CLAUDE_FIVE_HOUR_UTIL_FIX_MS = Date.parse("2026-06-18T00:00:00.000Z");

export type ClaudeUtilizationHistoryPoint = { at_ms: number; utilization: number };

/** Anthropic oauth `utilization` is percent remaining; used/remaining explicit fields override when present. */
export function resolveClaudeWindowUsedPercent(
  window: Record<string, unknown> | null | undefined,
  _context: VendorWindowUsedPercentContext = {}
): number {
  if (!window || typeof window !== "object") return 0;

  const usedExplicit = window.used_percentage ?? window.used_percent;
  if (usedExplicit != null && Number.isFinite(Number(usedExplicit))) {
    return normalizeUtilizationPercent(usedExplicit);
  }

  const remainingRaw =
    window.remaining_percentage ??
    window.percent_left ??
    window.remaining_percent ??
    window.percent_remaining;
  if (remainingRaw != null && Number.isFinite(Number(remainingRaw))) {
    return normalizeUtilizationPercent(100 - Number(remainingRaw));
  }

  const utilRaw = window.utilization;
  if (utilRaw == null || !Number.isFinite(Number(utilRaw))) return 0;

  let pct = Number(utilRaw);
  if (pct > 0 && pct <= 1) pct *= 100;
  pct = Math.max(0, Math.min(100, pct));

  return normalizeUtilizationPercent(100 - pct);
}

/** True when stored Claude points look like percent-remaining (decreases as quota is consumed). */
export function claudeUtilizationSeriesUsesRemainingSemantics(
  points: ClaudeUtilizationHistoryPoint[]
): boolean {
  if (!points.length) return true;
  if (points.length === 1) {
    return normalizeUtilizationPercent(points[0].utilization) >= 45;
  }
  let decreasing = 0;
  let increasing = 0;
  for (let i = 1; i < points.length; i += 1) {
    const delta = points[i].utilization - points[i - 1].utilization;
    if (delta < -0.5) decreasing += 1;
    if (delta > 0.5) increasing += 1;
  }
  if (decreasing === 0 && increasing === 0) {
    return normalizeUtilizationPercent(points[0].utilization) >= 45;
  }
  return decreasing >= increasing;
}

export function normalizeClaudeStoredUtilizationToUsed(
  utilization: number,
  usesRemainingSemantics: boolean
): number {
  const util = normalizeUtilizationPercent(utilization);
  return usesRemainingSemantics ? normalizeUtilizationPercent(100 - util) : util;
}

/** Coerce mixed legacy Claude history (remaining vs used) into percent-used series. */
export function migrateClaudeUtilizationHistoryToUsed(
  points: ClaudeUtilizationHistoryPoint[],
  windowSeconds: number | null | undefined
): ClaudeUtilizationHistoryPoint[] {
  if (!points.length) return [];
  const windowMs = (windowSeconds ?? 5 * 3600) * 1000;
  const sorted = [...points].sort((a, b) => a.at_ms - b.at_ms);
  const segments: ClaudeUtilizationHistoryPoint[][] = [];
  let current: ClaudeUtilizationHistoryPoint[] = [];
  for (const point of sorted) {
    const prev = current[current.length - 1];
    if (prev && point.at_ms - prev.at_ms > windowMs * 0.6) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) segments.push(current);

  const out: ClaudeUtilizationHistoryPoint[] = [];
  for (const segment of segments) {
    const remainingSemantics = claudeUtilizationSeriesUsesRemainingSemantics(segment);
    for (const point of segment) {
      out.push({
        at_ms: point.at_ms,
        utilization: normalizeClaudeStoredUtilizationToUsed(point.utilization, remainingSemantics)
      });
    }
  }
  return out.sort((a, b) => a.at_ms - b.at_ms);
}

/** Undo mistaken remaining-as-used Claude snapshots before v3 normalization. */
export function correctLegacyClaudeStoredUtilization(
  utilization: number,
  _windowSeconds: number | null | undefined,
  _recordedAtMs: number
): number {
  return normalizeClaudeStoredUtilizationToUsed(utilization, true);
}

/** Normalize vendor quota windows (Claude, Codex, Cursor) to percent used — not remaining. */
export function resolveVendorWindowUsedPercent(
  window: Record<string, unknown> | null | undefined,
  context: VendorWindowUsedPercentContext = {}
): number {
  if (!window || typeof window !== "object") return 0;

  const remainingRaw =
    window.percent_left ?? window.remaining_percent ?? window.percent_remaining;
  if (remainingRaw != null && Number.isFinite(Number(remainingRaw))) {
    return normalizeUtilizationPercent(100 - Number(remainingRaw));
  }

  const usedRaw = window.used_percent ?? window.utilization ?? window.apiPercentUsed ?? window.totalPercentUsed;
  if (usedRaw == null || !Number.isFinite(Number(usedRaw))) return 0;

  let pct = Number(usedRaw);
  if (pct > 0 && pct <= 1) pct *= 100;
  pct = Math.max(0, Math.min(100, pct));

  const windowSeconds = Number(window.limit_window_seconds ?? context.windowSeconds ?? 0);
  const elapsed = windowElapsedRatio(window, windowSeconds || Number(context.windowSeconds ?? 0));
  if (elapsed != null && elapsed <= 0.12 && pct >= 80) {
    return normalizeUtilizationPercent(100 - pct);
  }

  const asUsed = normalizeUtilizationPercent(pct);

  if (context.limitReached) {
    if (pct <= 10) return 100;
    if (pct >= 90) return asUsed;
  }

  if (
    context.previousUtilization != null &&
    context.previousResetsAt &&
    context.resetsAt &&
    context.previousResetsAt === context.resetsAt &&
    asUsed < context.previousUtilization - 1
  ) {
    return normalizeUtilizationPercent(100 - pct);
  }

  return asUsed;
}

/** @deprecated use resolveVendorWindowUsedPercent */
export function resolveCodexWindowUsedPercent(
  window: Record<string, unknown> | null | undefined,
  context: CodexWindowUsedPercentContext = {}
): number {
  return resolveVendorWindowUsedPercent(window, context);
}

export function dollarsUsedFromUtilization(monthlyUsd: number, utilizationPercent: number, windowSeconds: number | null): number {
  const util = normalizeUtilizationPercent(utilizationPercent);
  const monthSeconds = 30 * 86400;
  const window = windowSeconds && windowSeconds > 0 ? windowSeconds : 7 * 86400;
  const proratedPlan = monthlyUsd * (window / monthSeconds);
  return Math.round((util / 100) * proratedPlan * 100) / 100;
}

export function dollarsUnusedFromUtilization(monthlyUsd: number, utilizationPercent: number, windowSeconds: number | null): number {
  const util = normalizeUtilizationPercent(utilizationPercent);
  const monthSeconds = 30 * 86400;
  const window = windowSeconds && windowSeconds > 0 ? windowSeconds : 7 * 86400;
  const proratedPlan = monthlyUsd * (window / monthSeconds);
  return Math.round(((100 - util) / 100) * proratedPlan * 100) / 100;
}
