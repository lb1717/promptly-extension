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

/** Claude subscription quota is often stored as percent remaining — show percent used in charts. */
export function displayClaudeUtilizationAsUsedPercent(utilization: unknown): number {
  return normalizeUtilizationPercent(100 - normalizeUtilizationPercent(utilization));
}

export function displayVendorUtilizationAsUsedPercent(
  provider: string,
  utilization: unknown
): number {
  if (provider === "claude_code") {
    return displayClaudeUtilizationAsUsedPercent(utilization);
  }
  return normalizeUtilizationPercent(utilization);
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

/** True when a drop in stored values is a quota-window reset rather than wrong semantics. */
export function isLikelyClaudeQuotaCycleReset(
  prev: ClaudeUtilizationHistoryPoint,
  next: ClaudeUtilizationHistoryPoint,
  windowSeconds: number
): boolean {
  const drop = prev.utilization - next.utilization;
  if (drop < 12) return false;
  if (next.utilization <= 15 && prev.utilization >= drop + next.utilization - 8) return true;
  const gapMs = next.at_ms - prev.at_ms;
  if (windowSeconds > 0 && gapMs > windowSeconds * 1000 * 0.55 && drop >= 8) return true;
  return false;
}

/** Lower score = better fit for percent-used semantics (should climb within a quota window). */
export function scoreClaudeUsedPercentSeries(
  points: ClaudeUtilizationHistoryPoint[],
  windowSeconds: number
): number {
  if (!points.length) return 0;
  if (points.length === 1) {
    const value = normalizeUtilizationPercent(points[0].utilization);
    return value >= 55 ? 6 : 0;
  }

  let violations = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const next = points[i]!;
    const delta = next.utilization - prev.utilization;
    if (delta < -2 && !isLikelyClaudeQuotaCycleReset(prev, next, windowSeconds)) {
      violations += 1 + Math.min(6, Math.floor(Math.abs(delta) / 12));
    }
  }
  return violations;
}

export function splitClaudeUtilizationHistorySegments(
  points: ClaudeUtilizationHistoryPoint[],
  windowSeconds: number | null | undefined
): ClaudeUtilizationHistoryPoint[][] {
  if (!points.length) return [];
  const windowSec = windowSeconds ?? 5 * 3600;
  const windowMs = windowSec * 1000;
  const sorted = [...points].sort((a, b) => a.at_ms - b.at_ms);
  const segments: ClaudeUtilizationHistoryPoint[][] = [];
  let current: ClaudeUtilizationHistoryPoint[] = [];
  for (const point of sorted) {
    const prev = current[current.length - 1];
    if (
      prev &&
      (point.at_ms - prev.at_ms > windowMs * 0.6 ||
        isLikelyClaudeQuotaCycleReset(prev, point, windowSec))
    ) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

/** Pick whether stored raw values are percent-remaining vs percent-used from trend shape. */
export function inferClaudeStoredSeriesSemantics(
  points: ClaudeUtilizationHistoryPoint[],
  windowSeconds: number | null | undefined
): boolean {
  if (!points.length) return true;
  const windowSec = windowSeconds ?? 5 * 3600;
  const asUsed = points.map((point) => ({
    at_ms: point.at_ms,
    utilization: normalizeUtilizationPercent(point.utilization)
  }));
  const asUsedFromRemaining = points.map((point) => ({
    at_ms: point.at_ms,
    utilization: normalizeClaudeStoredUtilizationToUsed(point.utilization, true)
  }));
  const usedScore = scoreClaudeUsedPercentSeries(asUsed, windowSec);
  const remainingScore = scoreClaudeUsedPercentSeries(asUsedFromRemaining, windowSec);
  if (remainingScore < usedScore) return true;
  if (usedScore < remainingScore) return false;
  if (points.length === 1) {
    return normalizeUtilizationPercent(points[0].utilization) >= 45;
  }
  return claudeUtilizationSeriesUsesRemainingByTrend(points);
}

function claudeUtilizationSeriesUsesRemainingByTrend(points: ClaudeUtilizationHistoryPoint[]): boolean {
  let decreasing = 0;
  let increasing = 0;
  for (let i = 1; i < points.length; i += 1) {
    const delta = points[i]!.utilization - points[i - 1]!.utilization;
    if (delta < -0.5) decreasing += 1;
    if (delta > 0.5) increasing += 1;
  }
  if (decreasing === 0 && increasing === 0) {
    return normalizeUtilizationPercent(points[0]!.utilization) >= 45;
  }
  return decreasing >= increasing;
}

function enforceMonotonicClaudeUsedSeries(
  points: ClaudeUtilizationHistoryPoint[]
): ClaudeUtilizationHistoryPoint[] {
  let floor = 0;
  return points.map((point) => {
    const utilization = Math.max(floor, normalizeUtilizationPercent(point.utilization));
    floor = utilization;
    return { at_ms: point.at_ms, utilization };
  });
}

/** Reconcile one quota segment; live refresh trusts the newest reading as percent-used. */
export function normalizeClaudeHistorySegment(
  segment: ClaudeUtilizationHistoryPoint[],
  windowSeconds: number | null | undefined,
  opts: { trustLatestUsed?: boolean } = {}
): ClaudeUtilizationHistoryPoint[] {
  if (!segment.length) return [];
  const windowSec = windowSeconds ?? 5 * 3600;

  if (opts.trustLatestUsed && segment.length >= 2) {
    const latest = segment[segment.length - 1]!;
    const priors = segment.slice(0, -1);
    const latestUsed = normalizeUtilizationPercent(latest.utilization);
    let ceiling = latestUsed;
    const converted: ClaudeUtilizationHistoryPoint[] = [{ at_ms: latest.at_ms, utilization: latestUsed }];

    for (let i = priors.length - 1; i >= 0; i -= 1) {
      const raw = normalizeUtilizationPercent(priors[i]!.utilization);
      const candidates = [raw, normalizeUtilizationPercent(100 - raw)].filter((value) => value <= ceiling + 3);
      const pick =
        candidates.length === 0
          ? raw <= ceiling + 3
            ? raw
            : normalizeUtilizationPercent(100 - raw)
          : candidates.reduce((best, value) =>
              Math.abs(value - ceiling) < Math.abs(best - ceiling) ? value : best
            );
      ceiling = Math.min(ceiling, pick);
      converted.unshift({ at_ms: priors[i]!.at_ms, utilization: pick });
    }

    const trusted = enforceMonotonicClaudeUsedSeries(converted);
    const uniformUsed = segment.map((point) => ({
      at_ms: point.at_ms,
      utilization: normalizeUtilizationPercent(point.utilization)
    }));
    const uniformRemaining = segment.map((point) => ({
      at_ms: point.at_ms,
      utilization: normalizeClaudeStoredUtilizationToUsed(point.utilization, true)
    }));
    const trustedScore = scoreClaudeUsedPercentSeries(trusted, windowSec);
    const usedScore = scoreClaudeUsedPercentSeries(uniformUsed, windowSec);
    const remainingScore = scoreClaudeUsedPercentSeries(uniformRemaining, windowSec);
    const bestScore = Math.min(trustedScore, usedScore, remainingScore);
    if (bestScore === trustedScore) return trusted;
    if (bestScore === remainingScore) return enforceMonotonicClaudeUsedSeries(uniformRemaining);
    return enforceMonotonicClaudeUsedSeries(uniformUsed);
  }

  const usesRemaining = inferClaudeStoredSeriesSemantics(segment, windowSec);
  return enforceMonotonicClaudeUsedSeries(
    segment.map((point) => ({
      at_ms: point.at_ms,
      utilization: normalizeClaudeStoredUtilizationToUsed(point.utilization, usesRemaining)
    }))
  );
}

/** True when stored Claude points look like percent-remaining (decreases as quota is consumed). */
export function claudeUtilizationSeriesUsesRemainingSemantics(
  points: ClaudeUtilizationHistoryPoint[]
): boolean {
  return inferClaudeStoredSeriesSemantics(points, null);
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
  windowSeconds: number | null | undefined,
  opts: { trustLatestAtMs?: number } = {}
): ClaudeUtilizationHistoryPoint[] {
  if (!points.length) return [];
  const segments = splitClaudeUtilizationHistorySegments(points, windowSeconds);
  const out: ClaudeUtilizationHistoryPoint[] = [];
  for (const segment of segments) {
    const latestAtMs = segment[segment.length - 1]?.at_ms;
    out.push(
      ...normalizeClaudeHistorySegment(segment, windowSeconds, {
        trustLatestUsed: opts.trustLatestAtMs != null && latestAtMs === opts.trustLatestAtMs
      })
    );
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

function dayKeyToMs(dayKey: string): number {
  return Date.parse(`${dayKey}T12:00:00.000Z`);
}

/** Fill every day in dayKeys with linear interpolation between known readings. */
export function interpolateDailyUtilizationMap(
  sparse: Map<string, number>,
  dayKeys: string[],
  opts?: {
    anchorStartDay?: string;
    anchorStartUtil?: number;
    exactEndDay?: string;
    exactEndUtil?: number | null;
  }
): Map<string, number> {
  if (!dayKeys.length) return new Map();

  const known = new Map(sparse);
  if (opts?.anchorStartDay != null && opts.anchorStartUtil != null) {
    known.set(opts.anchorStartDay, normalizeUtilizationPercent(opts.anchorStartUtil));
  }
  if (opts?.exactEndDay && opts.exactEndUtil != null) {
    known.set(opts.exactEndDay, normalizeUtilizationPercent(opts.exactEndUtil));
  }

  const sortedKnownDays = dayKeys.filter((day) => known.has(day)).sort();
  if (!sortedKnownDays.length) {
    const out = new Map<string, number>();
    for (const day of dayKeys) out.set(day, 0);
    return out;
  }

  const valueForDay = (day: string): number => {
    if (known.has(day)) return known.get(day)!;
    const dayMs = dayKeyToMs(day);
    let prevDay = sortedKnownDays[0];
    let nextDay = sortedKnownDays[sortedKnownDays.length - 1];
    for (const candidate of sortedKnownDays) {
      if (dayKeyToMs(candidate) <= dayMs) prevDay = candidate;
      if (dayKeyToMs(candidate) >= dayMs) {
        nextDay = candidate;
        break;
      }
    }
    const prevUtil = known.get(prevDay)!;
    const nextUtil = known.get(nextDay)!;
    const prevMs = dayKeyToMs(prevDay);
    const nextMs = dayKeyToMs(nextDay);
    if (prevMs === nextMs) return prevUtil;
    const t = (dayMs - prevMs) / (nextMs - prevMs);
    return normalizeUtilizationPercent(prevUtil + t * (nextUtil - prevUtil));
  };

  const out = new Map<string, number>();
  for (const day of dayKeys) {
    out.set(day, Math.max(0, valueForDay(day)));
  }
  return out;
}
