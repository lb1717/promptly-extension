import { normalizeUtilizationPercent } from "@/lib/vendorPlanPricing";

export type UsageWindow = {
  utilization: number;
  resets_at: string | null;
  window_seconds: number | null;
};

export type UsageHistoryPoint = {
  at_ms: number;
  utilization: number;
};

export type PeriodNavState = {
  offsets: number[];
  selectedOffset: number;
  label: string;
  canGoBack: boolean;
  canGoForward: boolean;
  previousOffset: number | null;
  nextOffset: number | null;
};

export type CompanyMemberSeries = {
  memberId: string;
  label: string;
  color: string;
  provider: string;
  window: UsageWindow | null;
  history: UsageHistoryPoint[];
  syncedAtMs: number;
};

export type CompanyMultiMemberCycleChart = {
  rows: Array<{ at_ms: number } & Record<string, number | null>>;
  cycleStartMs: number;
  cycleEndMs: number;
  nowMs: number;
  isCurrentPeriod: boolean;
  yMax: number;
  periodNav: PeriodNavState;
  windowSeconds: number | null;
};

const DAY_MS = 86_400_000;

function displayUtilization(_provider: string, raw: number): number {
  return normalizeUtilizationPercent(raw);
}

function resolveBillingCycleBounds(window: UsageWindow, referenceMs: number) {
  const windowSeconds = window.window_seconds ?? 7 * 86400;
  const cycleMs = windowSeconds * 1000;
  const resetMs = window.resets_at ? Date.parse(window.resets_at) : NaN;
  if (!Number.isFinite(resetMs)) {
    return {
      cycleStartMs: referenceMs - cycleMs,
      cycleEndMs: referenceMs,
      nowMs: referenceMs
    };
  }
  const cycleEndMs = resetMs;
  const cycleStartMs = resetMs - cycleMs;
  const nowMs = Math.min(Math.max(referenceMs, cycleStartMs), cycleEndMs);
  return { cycleStartMs, cycleEndMs, nowMs };
}

function startOfLocalDayMs(atMs: number): number {
  const d = new Date(atMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function localDayKey(atMs: number): string {
  const d = new Date(atMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayChartMs(atMs: number): number {
  return startOfLocalDayMs(atMs) + DAY_MS / 2;
}

function cycleDayIndex(cycleStartMs: number, atMs: number): number {
  const start = startOfLocalDayMs(cycleStartMs);
  const point = startOfLocalDayMs(atMs);
  return Math.max(1, Math.floor((point - start) / DAY_MS) + 1);
}

function totalCycleDays(cycleStartMs: number, cycleEndMs: number): number {
  return cycleDayIndex(cycleStartMs, Math.max(cycleStartMs, cycleEndMs - 1));
}

function periodBoundsForOffset(currentWindow: UsageWindow, referenceMs: number, periodOffset: number) {
  const { cycleStartMs, cycleEndMs, nowMs } = resolveBillingCycleBounds(currentWindow, referenceMs);
  const cycleMs = Math.max(cycleEndMs - cycleStartMs, 1);
  const periodStartMs = cycleStartMs + periodOffset * cycleMs;
  const periodEndMs = cycleEndMs + periodOffset * cycleMs;
  const periodNowMs = periodOffset === 0 ? nowMs : periodEndMs;
  return { cycleStartMs: periodStartMs, cycleEndMs: periodEndMs, nowMs: periodNowMs, cycleMs };
}

function shortTime(atMs: number): string {
  const date = new Date(atMs);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const h12 = hour % 12 || 12;
  const suffix = hour < 12 ? "a" : "p";
  return minute ? `${h12}:${String(minute).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

function shortMonthDay(atMs: number, includeSpace = true): string {
  const date = new Date(atMs);
  const month = date.toLocaleDateString(undefined, { month: "short" });
  return includeSpace ? `${month} ${date.getDate()}` : `${month}${date.getDate()}`;
}

function formatPeriodLabel(startMs: number, endMs: number, isCurrent: boolean): string {
  if (isCurrent) return "Current period";
  const duration = Math.max(endMs - startMs, 1);
  const endForLabel = Math.max(startMs, endMs - 1);
  const start = new Date(startMs);
  const end = new Date(endForLabel);
  if (duration <= DAY_MS) {
    return `${shortTime(startMs)}-${shortTime(endForLabel)}`.slice(0, 14);
  }
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${shortMonthDay(startMs)}-${end.getDate()}`.slice(0, 14);
  }
  return `${shortMonthDay(startMs, false)}-${shortMonthDay(endForLabel, false)}`.slice(0, 14);
}

function periodOffsetForPoint(cycleStartMs: number, cycleMs: number, atMs: number): number {
  return Math.floor((atMs - cycleStartMs) / cycleMs);
}

function buildAvailablePeriodOffsets(
  history: UsageHistoryPoint[],
  currentWindow: UsageWindow | null,
  syncedAtMs: number
): number[] {
  if (!currentWindow) return [0];
  const referenceMs = syncedAtMs || Date.now();
  const { cycleStartMs, cycleMs, nowMs } = periodBoundsForOffset(currentWindow, referenceMs, 0);
  const offsets = new Set<number>([0]);
  for (const point of history) {
    if (point.at_ms > nowMs) continue;
    const offset = periodOffsetForPoint(cycleStartMs, cycleMs, point.at_ms);
    if (offset <= 0 && offset >= -120) offsets.add(offset);
  }
  return [...offsets].sort((a, b) => a - b);
}

export function buildPeriodNavState(
  history: UsageHistoryPoint[],
  currentWindow: UsageWindow | null,
  syncedAtMs: number,
  selectedOffset: number
): PeriodNavState {
  const offsets = buildAvailablePeriodOffsets(history, currentWindow, syncedAtMs);
  const normalizedOffset = offsets.includes(selectedOffset) ? selectedOffset : 0;
  const idx = offsets.indexOf(normalizedOffset);
  const previousOffset = idx > 0 ? offsets[idx - 1] : null;
  const nextOffset = normalizedOffset < 0 ? offsets.find((offset) => offset > normalizedOffset) ?? 0 : null;

  let label = "Current period";
  if (currentWindow) {
    const referenceMs = syncedAtMs || Date.now();
    const { cycleStartMs, cycleEndMs } = periodBoundsForOffset(currentWindow, referenceMs, normalizedOffset);
    label = formatPeriodLabel(cycleStartMs, cycleEndMs, normalizedOffset === 0);
  }

  return {
    offsets,
    selectedOffset: normalizedOffset,
    label,
    canGoBack: previousOffset != null,
    canGoForward: nextOffset != null && normalizedOffset < 0,
    previousOffset,
    nextOffset
  };
}

function aggregateDailyUsagePoints(
  provider: string,
  history: UsageHistoryPoint[],
  currentUtil: number | null,
  cycleStartMs: number,
  nowMs: number
): { at_ms: number; utilization: number; dayIndex: number }[] {
  const byDay = new Map<string, { at_ms: number; utilization: number }>();

  const upsert = (atMs: number, utilization: number) => {
    if (atMs < cycleStartMs || atMs > nowMs) return;
    const key = localDayKey(atMs);
    const existing = byDay.get(key);
    if (!existing || atMs >= existing.at_ms) {
      byDay.set(key, { at_ms: atMs, utilization });
    }
  };

  for (const point of history) {
    upsert(point.at_ms, displayUtilization(provider, point.utilization));
  }
  if (currentUtil != null) {
    upsert(nowMs, currentUtil);
  }

  return [...byDay.values()]
    .sort((a, b) => a.at_ms - b.at_ms)
    .map((row) => ({
      at_ms: dayChartMs(row.at_ms),
      utilization: row.utilization,
      dayIndex: cycleDayIndex(cycleStartMs, row.at_ms)
    }));
}

function fillDailyUsagePointsWithInterpolation(
  sparsePoints: { at_ms: number; utilization: number; dayIndex: number }[],
  cycleStartMs: number,
  nowMs: number,
  lastDayIndex: number,
  exactLatestUtil: number | null
): { at_ms: number; utilization: number; dayIndex: number }[] {
  if (lastDayIndex <= 0) return sparsePoints;

  const knownByDay = new Map<number, number>();
  knownByDay.set(1, 0);
  for (const point of sparsePoints) {
    knownByDay.set(point.dayIndex, point.utilization);
  }
  if (exactLatestUtil != null) {
    knownByDay.set(lastDayIndex, exactLatestUtil);
  }

  const knownDays = [...knownByDay.keys()].sort((a, b) => a - b);
  const valueForDay = (dayIndex: number): number => {
    if (knownByDay.has(dayIndex)) return knownByDay.get(dayIndex)!;
    let prevDay = knownDays[0];
    let nextDay = knownDays[knownDays.length - 1];
    for (const day of knownDays) {
      if (day <= dayIndex) prevDay = day;
      if (day >= dayIndex) {
        nextDay = day;
        break;
      }
    }
    const prevUtil = knownByDay.get(prevDay)!;
    const nextUtil = knownByDay.get(nextDay)!;
    if (prevDay === nextDay) return prevUtil;
    const t = (dayIndex - prevDay) / (nextDay - prevDay);
    return prevUtil + t * (nextUtil - prevUtil);
  };

  const filled: { at_ms: number; utilization: number; dayIndex: number }[] = [];
  for (let dayIndex = 1; dayIndex <= lastDayIndex; dayIndex += 1) {
    const isLast = dayIndex === lastDayIndex;
    const dayMidMs = startOfLocalDayMs(cycleStartMs) + (dayIndex - 1) * DAY_MS + DAY_MS / 2;
    filled.push({
      at_ms: isLast && exactLatestUtil != null ? nowMs : dayMidMs,
      utilization: Math.max(0, valueForDay(dayIndex)),
      dayIndex
    });
  }
  return filled;
}

function sparseDailyLatestUtil(
  provider: string,
  history: UsageHistoryPoint[],
  cycleStartMs: number,
  cycleEndMs: number
): number | null {
  const points = history
    .filter((point) => point.at_ms >= cycleStartMs && point.at_ms <= cycleEndMs)
    .sort((a, b) => a.at_ms - b.at_ms);
  if (!points.length) return null;
  return displayUtilization(provider, points[points.length - 1].utilization);
}

function chartYDomainMax(values: number[]): number {
  const peak = values.reduce((max, value) => (Number.isFinite(value) ? Math.max(max, value) : max), 0);
  if (peak <= 100) return 100;
  return Math.ceil(peak / 10) * 10;
}

export function chartYTicks(yMax: number): number[] {
  const base = [0, 25, 50, 75, 100];
  if (yMax <= 100) return base;
  const extra = Math.ceil(yMax / 25) * 25;
  return extra > 100 ? [...base, extra] : base;
}

function windowCycleMs(windowSeconds: number | null): number {
  if (windowSeconds && windowSeconds > 0) return windowSeconds * 1000;
  return 7 * 86400 * 1000;
}

export function formatChartXLabel(atMs: number, spanMs: number, windowSeconds: number | null): string {
  const date = new Date(atMs);
  if (spanMs > 2 * DAY_MS) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  const cycleMs = windowCycleMs(windowSeconds);
  if (cycleMs <= 6 * 3600 * 1000 || spanMs <= 3 * DAY_MS) {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatCycleBoundaryLabel(atMs: number): string {
  return new Date(atMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function buildCompanyMultiMemberCycleChart(
  series: CompanyMemberSeries[],
  periodOffset: number
): CompanyMultiMemberCycleChart | null {
  const reference = series.find((member) => member.window != null);
  if (!reference?.window) return null;

  const combinedHistory = series.flatMap((member) => member.history);
  const periodNav = buildPeriodNavState(
    combinedHistory,
    reference.window,
    reference.syncedAtMs,
    periodOffset
  );
  const referenceMs = reference.syncedAtMs || Date.now();
  const isCurrentPeriod = periodNav.selectedOffset === 0;
  const { cycleStartMs, cycleEndMs, nowMs } = periodBoundsForOffset(
    reference.window,
    referenceMs,
    periodNav.selectedOffset
  );
  const periodEndMs = isCurrentPeriod ? nowMs : cycleEndMs;
  const lastDayIndex = isCurrentPeriod
    ? cycleDayIndex(cycleStartMs, nowMs)
    : totalCycleDays(cycleStartMs, cycleEndMs);

  const filledByMember = new Map<string, Map<number, { at_ms: number; utilization: number }>>();
  const allValues: number[] = [0];

  for (const member of series) {
    if (!member.window) continue;
    const currentUtil = isCurrentPeriod ? displayUtilization(member.provider, member.window.utilization) : null;
    const exactLatestUtil =
      isCurrentPeriod
        ? currentUtil
        : sparseDailyLatestUtil(member.provider, member.history, cycleStartMs, cycleEndMs);
    const sparse = aggregateDailyUsagePoints(
      member.provider,
      member.history,
      currentUtil,
      cycleStartMs,
      periodEndMs
    );
    const filled = fillDailyUsagePointsWithInterpolation(
      sparse,
      cycleStartMs,
      periodEndMs,
      lastDayIndex,
      exactLatestUtil
    );
    filledByMember.set(
      member.memberId,
      new Map(filled.map((point) => [point.dayIndex, point]))
    );
    for (const point of filled) allValues.push(point.utilization);
  }

  const rows: Array<{ at_ms: number } & Record<string, number | null>> = [];
  for (let dayIndex = 1; dayIndex <= lastDayIndex; dayIndex += 1) {
    const isLast = dayIndex === lastDayIndex;
    const dayMidMs = startOfLocalDayMs(cycleStartMs) + (dayIndex - 1) * DAY_MS + DAY_MS / 2;
    const row: { at_ms: number } & Record<string, number | null> = {
      at_ms: isLast && isCurrentPeriod ? nowMs : dayMidMs
    };
    for (const member of series) {
      const point = filledByMember.get(member.memberId)?.get(dayIndex);
      row[member.memberId] = point?.utilization ?? null;
      if (point) allValues.push(point.utilization);
    }
    rows.push(row);
  }

  return {
    rows,
    cycleStartMs,
    cycleEndMs,
    nowMs,
    isCurrentPeriod,
    yMax: chartYDomainMax(allValues),
    periodNav,
    windowSeconds: reference.window.window_seconds ?? null
  };
}
