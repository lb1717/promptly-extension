"use client";

import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import { dollarsUsedFromUtilization } from "@/lib/vendorPlanPricing";
import {
  detectVendorUsageInstallOs,
  vendorUsageSyncCommand,
  type VendorUsageInstallOs
} from "@/lib/vendorUsageSyncCommand";

const VENDOR_USAGE_PASSWORD = "oat123";
const UNLOCK_KEY = "promptly_vendor_usage_unlocked";
const MIN_PERIODS_WHEN_RANGE_SHORT = 5;

const CHART_FONT_FAMILY = "var(--font-roboto-chart), Roboto, sans-serif";
const CHART_Y_TICK = { fill: "#5C5C5C", fontSize: 10, fontFamily: CHART_FONT_FAMILY };
const CHART_X_DATE_TICK = {
  fill: "#2a2a2a",
  fontSize: 11,
  fontWeight: 600 as const,
  fontFamily: CHART_FONT_FAMILY
};
const CHART_X_DATE_STROKE = "#525252";
const CHART_GRID_STROKE = "rgba(0,0,0,0.06)";
const CHART_TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e8e8e8",
  borderRadius: 6,
  padding: "5px 7px",
  fontSize: 10,
  lineHeight: 1.3,
  color: "#111111",
  fontFamily: CHART_FONT_FAMILY,
  boxShadow: "0 2px 8px rgba(17, 17, 17, 0.08)"
};

type UsageWindow = {
  utilization: number;
  resets_at: string | null;
  window_seconds: number | null;
};

type UsageHistoryPoint = {
  at_ms: number;
  utilization: number;
};

type VendorProfile = {
  provider: "claude_code" | "codex" | "cursor";
  profile_id: string;
  profile_label: string;
  config_dir: string | null;
  vendor_email: string | null;
  plan_slug: string | null;
  plan_display: string | null;
  primary_window: UsageWindow | null;
  secondary_window: UsageWindow | null;
  sync_error: string | null;
  synced_at_ms: number;
  plan_monthly_usd: number | null;
  primary_dollars_used: number | null;
  secondary_dollars_used: number | null;
  usage_history?: {
    primary: UsageHistoryPoint[];
    secondary: UsageHistoryPoint[];
  };
};

type VendorUsagePayload = {
  ok?: boolean;
  settings: {
    claude_code: { enabled: boolean; extra_profile_dirs: string[] };
    codex: { enabled: boolean; extra_profile_dirs: string[] };
    cursor: { enabled: boolean; extra_profile_dirs: string[] };
  };
  profiles: VendorProfile[];
  last_sync_diagnostics?: {
    at_ms: number;
    skipped: Array<"claude_code" | "codex" | "cursor">;
    skip_details?: Partial<Record<"claude_code" | "codex" | "cursor", string>>;
  } | null;
  can_live_refresh?: boolean;
  live_refresh_hint?: string | null;
  account_email_mismatch?: boolean;
  vendor_tokens_device_email?: string | null;
};

type WindowKind = "primary" | "secondary";

const PROVIDER_ORDER: VendorProfile["provider"][] = ["claude_code", "codex", "cursor"];

const PROVIDER_LABEL: Record<VendorProfile["provider"], string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  cursor: "Cursor"
};

function formatResetCountdown(resetsAt: string | null): string {
  if (!resetsAt) return "—";
  const ms = Date.parse(resetsAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "soon";
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 48) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatChartTime(atMs: number): string {
  return new Date(atMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function windowCycleMs(windowSeconds: number | null): number {
  if (windowSeconds && windowSeconds > 0) return windowSeconds * 1000;
  return 7 * 86400 * 1000;
}

function resolveChartLookbackMs(rangeDays: number, windowSeconds: number | null): number {
  const cycleMs = windowCycleMs(windowSeconds);
  const rangeMs = rangeDays * 86400 * 1000;
  if (rangeMs <= cycleMs) {
    return MIN_PERIODS_WHEN_RANGE_SHORT * cycleMs;
  }
  return rangeMs;
}

function formatChartXLabel(atMs: number, spanMs: number, windowSeconds: number | null): string {
  const date = new Date(atMs);
  const cycleMs = windowCycleMs(windowSeconds);
  if (cycleMs <= 6 * 3600 * 1000 || spanMs <= 3 * 86400 * 1000) {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type ChartRow = {
  at_ms: number;
  label: string;
  utilization: number;
  isReading: boolean;
};

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value >= 100 ? `$${Math.round(value)}` : `$${value.toFixed(2)}`;
}

function activeUsageWindow(profile: VendorProfile): {
  window: UsageWindow;
  history: UsageHistoryPoint[];
  dollarsUsed: number;
} | null {
  if (profile.secondary_window && profile.secondary_dollars_used != null) {
    return {
      window: profile.secondary_window,
      history: profile.usage_history?.secondary ?? [],
      dollarsUsed: profile.secondary_dollars_used
    };
  }
  if (profile.primary_window && profile.primary_dollars_used != null) {
    return {
      window: profile.primary_window,
      history: profile.usage_history?.primary ?? [],
      dollarsUsed: profile.primary_dollars_used
    };
  }
  return null;
}

function windowElapsedDays(window: UsageWindow, nowMs: number): number {
  const windowSeconds = window.window_seconds ?? 7 * 86400;
  const resetMs = window.resets_at ? Date.parse(window.resets_at) : NaN;
  if (Number.isFinite(resetMs)) {
    const startMs = resetMs - windowSeconds * 1000;
    return Math.max(1 / 24, (nowMs - startMs) / 86400000);
  }
  return Math.max(1, 1);
}

type MonthlyExpenditureSummary = {
  totalMonthlyUsd: number;
  inUseUsd: number;
  predictedUsagePercent: number | null;
  predictedLossUsd: number | null;
};

function computeMonthlyExpenditureSummary(
  profiles: VendorProfile[],
  rangeDays: number,
  nowMs = Date.now()
): MonthlyExpenditureSummary | null {
  let totalMonthlyUsd = 0;
  let inUseUsd = 0;
  let predictedSpendUsd = 0;
  let pricedProfiles = 0;

  for (const profile of profiles) {
    const monthly = profile.plan_monthly_usd;
    if (monthly == null || monthly <= 0) continue;

    const active = activeUsageWindow(profile);
    if (!active) continue;

    const { window, history, dollarsUsed } = active;
    const windowSeconds = window.window_seconds ?? 7 * 86400;
    const lookbackMs = resolveChartLookbackMs(rangeDays, windowSeconds);
    const startMs = nowMs - lookbackMs;

    const points = [...history]
      .filter((point) => point.at_ms >= startMs && point.at_ms <= nowMs)
      .sort((a, b) => a.at_ms - b.at_ms);

    let dailyRate = dollarsUsed / windowElapsedDays(window, nowMs);

    if (points.length >= 2) {
      const first = points[0];
      const last = points[points.length - 1];
      const spanDays = Math.max(1 / 24, (last.at_ms - first.at_ms) / 86400000);
      const firstDollars = dollarsUsedFromUtilization(monthly, first.utilization, windowSeconds);
      const lastDollars = dollarsUsedFromUtilization(monthly, last.utilization, windowSeconds);
      const delta = lastDollars - firstDollars;
      if (delta >= 0) {
        dailyRate = delta / spanDays;
      } else {
        dailyRate = lastDollars / spanDays;
      }
    } else if (points.length === 1) {
      const spanDays = Math.max(1 / 24, (nowMs - points[0].at_ms) / 86400000);
      dailyRate = dollarsUsed / spanDays;
    }

    const predictedMonthlySpend = dailyRate * 30;

    totalMonthlyUsd += monthly;
    inUseUsd += dollarsUsed;
    predictedSpendUsd += predictedMonthlySpend;
    pricedProfiles += 1;
  }

  if (pricedProfiles === 0) return null;

  const predictedUsagePercent =
    totalMonthlyUsd > 0 ? Math.round((predictedSpendUsd / totalMonthlyUsd) * 1000) / 10 : null;
  const roundedPredictedSpend = Math.round(predictedSpendUsd * 100) / 100;

  return {
    totalMonthlyUsd: Math.round(totalMonthlyUsd * 100) / 100,
    inUseUsd: Math.round(inUseUsd * 100) / 100,
    predictedUsagePercent,
    predictedLossUsd:
      predictedUsagePercent != null && predictedUsagePercent < 100
        ? Math.max(0, Math.round((totalMonthlyUsd - roundedPredictedSpend) * 100) / 100)
        : null
  };
}

function ExpenditureStat({
  label,
  value,
  valueClassName
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums leading-none text-ink ${valueClassName ?? ""}`}>
        {value}
      </p>
    </div>
  );
}

function MonthlyExpenditureStats({ summary }: { summary: MonthlyExpenditureSummary }) {
  return (
    <div className="flex flex-wrap items-end justify-end gap-4 sm:gap-5">
      <ExpenditureStat label="Monthly cost" value={`${formatUsd(summary.totalMonthlyUsd)}/mo`} />
      <ExpenditureStat label="Value used this month" value={formatUsd(summary.inUseUsd)} />
      <ExpenditureStat
        label="Predicted use"
        value={summary.predictedUsagePercent != null ? `${summary.predictedUsagePercent}%` : "—"}
      />
      {summary.predictedLossUsd != null ? (
        <ExpenditureStat
          label="Predicted loss"
          value={formatUsd(summary.predictedLossUsd)}
          valueClassName="text-red-600"
        />
      ) : null}
    </div>
  );
}

function windowLabels(provider: VendorProfile["provider"]): { primary: string; secondary: string } {
  if (provider === "cursor") {
    return { primary: "5-hour", secondary: "Billing cycle" };
  }
  return { primary: "5-hour", secondary: "Weekly" };
}

function buildChartRows(
  history: UsageHistoryPoint[],
  currentWindow: UsageWindow | null,
  syncedAtMs: number,
  rangeDays: number,
  windowSeconds: number | null
): ChartRow[] {
  const nowMs = syncedAtMs || Date.now();
  const lookbackMs = resolveChartLookbackMs(rangeDays, windowSeconds);
  const startMs = nowMs - lookbackMs;

  const rows: ChartRow[] = history
    .filter((point) => point.at_ms >= startMs && point.at_ms <= nowMs + 60_000)
    .map((point) => ({
      at_ms: point.at_ms,
      label: formatChartXLabel(point.at_ms, lookbackMs, windowSeconds),
      utilization: Math.max(0, Math.min(100, point.utilization)),
      isReading: true
    }));

  if (rows.length === 0 && currentWindow) {
    rows.push({
      at_ms: nowMs,
      label: formatChartXLabel(nowMs, lookbackMs, windowSeconds),
      utilization: Math.max(0, Math.min(100, currentWindow.utilization)),
      isReading: true
    });
  } else if (currentWindow) {
    const latest = rows[rows.length - 1];
    if (!latest || nowMs - latest.at_ms > 60_000) {
      rows.push({
        at_ms: nowMs,
        label: formatChartXLabel(nowMs, lookbackMs, windowSeconds),
        utilization: Math.max(0, Math.min(100, currentWindow.utilization)),
        isReading: true
      });
    } else {
      latest.utilization = Math.max(0, Math.min(100, currentWindow.utilization));
      latest.label = formatChartXLabel(latest.at_ms, lookbackMs, windowSeconds);
    }
  }

  const sorted = rows.sort((a, b) => a.at_ms - b.at_ms);
  if (sorted.length === 1) {
    const point = sorted[0];
    const padMs = Math.min(Math.max(windowCycleMs(windowSeconds) * 0.35, 2 * 3600 * 1000), lookbackMs * 0.2);
    return [
      {
        at_ms: point.at_ms - padMs,
        label: formatChartXLabel(point.at_ms - padMs, lookbackMs, windowSeconds),
        utilization: point.utilization,
        isReading: false
      },
      point
    ];
  }
  return sorted;
}

function UsageTrendChart({
  rows,
  currentUtil,
  windowSeconds
}: {
  rows: ChartRow[];
  currentUtil: number;
  windowSeconds: number | null;
}) {
  const lineColor =
    currentUtil >= 75 ? "#059669" : currentUtil >= 40 ? "#d97706" : currentUtil >= 15 ? "#ea580c" : "#dc2626";
  const spanMs =
    rows.length >= 2 ? Math.max(rows[rows.length - 1].at_ms - rows[0].at_ms, windowCycleMs(windowSeconds)) : windowCycleMs(windowSeconds);

  return (
    <div className="h-52 w-full sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="at_ms"
            type="number"
            domain={["dataMin", "dataMax"]}
            stroke={CHART_X_DATE_STROKE}
            tick={CHART_X_DATE_TICK}
            minTickGap={28}
            tickFormatter={(value) => formatChartXLabel(Number(value), spanMs, windowSeconds)}
          />
          <YAxis
            domain={[0, 100]}
            stroke="#8A8A8A"
            allowDecimals={false}
            width={36}
            tick={CHART_Y_TICK}
            ticks={[0, 25, 50, 75, 100]}
            unit="%"
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [`${Math.round(value)}% used`, "Usage"]}
            labelFormatter={(_, payload) => {
              const atMs = payload?.[0]?.payload?.at_ms;
              return typeof atMs === "number" ? formatChartTime(atMs) : "";
            }}
          />
          <ReferenceLine y={100} stroke="#16a34a" strokeDasharray="4 4" strokeOpacity={0.75} />
          <ReferenceLine y={75} stroke="#86efac" strokeDasharray="3 6" strokeOpacity={0.35} />
          <ReferenceLine y={50} stroke="#d1d5db" strokeDasharray="3 6" strokeOpacity={0.35} />
          <ReferenceLine y={25} stroke="#fca5a5" strokeDasharray="3 6" strokeOpacity={0.35} />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.55} />
          <Line
            type="monotone"
            dataKey="utilization"
            stroke={lineColor}
            strokeWidth={2.75}
            dot={({ cx, cy, index }) => {
              const row = rows[index];
              if (!row?.isReading || cx == null || cy == null) {
                return <circle cx={cx ?? 0} cy={cy ?? 0} r={0} fill="transparent" />;
              }
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={3.5}
                  fill={lineColor}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              );
            }}
            activeDot={{ r: 5, fill: lineColor, stroke: "#ffffff", strokeWidth: 1.5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SubscriptionUsageRow({
  profile,
  rangeDays
}: {
  profile: VendorProfile;
  rangeDays: number;
}) {
  const labels = windowLabels(profile.provider);
  const hasPrimary = Boolean(profile.primary_window);
  const hasSecondary = Boolean(profile.secondary_window);
  const [windowKind, setWindowKind] = useState<WindowKind>(hasPrimary ? "primary" : "secondary");

  const activeWindow = windowKind === "primary" ? profile.primary_window : profile.secondary_window;
  const activeHistory =
    windowKind === "primary"
      ? profile.usage_history?.primary ?? []
      : profile.usage_history?.secondary ?? [];
  const dollarsUsed =
    windowKind === "primary" ? profile.primary_dollars_used : profile.secondary_dollars_used;
  const chartRows = useMemo(
    () =>
      buildChartRows(
        activeHistory,
        activeWindow,
        profile.synced_at_ms,
        rangeDays,
        activeWindow?.window_seconds ?? null
      ),
    [activeHistory, activeWindow, profile.synced_at_ms, rangeDays]
  );
  const currentUtil = activeWindow?.utilization ?? 0;
  const windowLabel = windowKind === "primary" ? labels.primary : labels.secondary;

  return (
    <article className="rounded-xl border border-line bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{PROVIDER_LABEL[profile.provider]}</p>
          <p className="mt-0.5 text-sm text-muted">
            {profile.plan_display || "Unknown plan"}
            {profile.plan_monthly_usd != null ? (
              <span className="text-faint"> · ${profile.plan_monthly_usd}/mo</span>
            ) : null}
          </p>
          {profile.vendor_email ? (
            <p className="mt-1 truncate text-xs text-faint">{profile.vendor_email}</p>
          ) : null}
        </div>
        {hasPrimary && hasSecondary ? (
          <div className="inline-flex shrink-0 rounded-lg border border-line bg-cream-dark p-0.5">
            <button
              type="button"
              onClick={() => setWindowKind("primary")}
              className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                windowKind === "primary" ? "bg-ink text-cream" : "text-faint hover:text-ink"
              }`}
            >
              {labels.primary}
            </button>
            <button
              type="button"
              onClick={() => setWindowKind("secondary")}
              className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                windowKind === "secondary" ? "bg-ink text-cream" : "text-faint hover:text-ink"
              }`}
            >
              {labels.secondary}
            </button>
          </div>
        ) : null}
      </div>

      {activeWindow ? (
        <>
          <p className="mb-3 text-sm text-muted">
            {dollarsUsed != null ? (
              <>
                About <span className="font-semibold tabular-nums text-ink">${dollarsUsed.toFixed(2)}</span> of your{" "}
                {windowLabel.toLowerCase()} plan value used
              </>
            ) : (
              <>
                <span className="font-semibold tabular-nums text-ink">{Math.round(currentUtil)}%</span> of your{" "}
                {windowLabel.toLowerCase()} limit used
              </>
            )}
            {" · resets in "}
            {formatResetCountdown(activeWindow.resets_at)}
          </p>
          <UsageTrendChart
            rows={chartRows}
            currentUtil={currentUtil}
            windowSeconds={activeWindow.window_seconds}
          />
        </>
      ) : (
        <p className="text-sm text-muted">No usage window available for this subscription yet.</p>
      )}
    </article>
  );
}

export default function VendorUsageSection({
  user,
  rangeDays = 30
}: {
  user: User | null;
  rangeDays?: number;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [data, setData] = useState<VendorUsagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncOs, setSyncOs] = useState<VendorUsageInstallOs>("mac");
  const [showCommand, setShowCommand] = useState(false);
  const [syncCopied, setSyncCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUnlocked(window.sessionStorage.getItem(UNLOCK_KEY) === "1");
    setSyncOs(detectVendorUsageInstallOs());
  }, []);

  const syncCommand = useMemo(() => vendorUsageSyncCommand(syncOs), [syncOs]);

  const load = useCallback(async ({ live = false }: { live?: boolean } = {}) => {
    if (!user) {
      setData(null);
      setError("Sign in to load vendor usage.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken(false);
      if (live) {
        const res = await fetch("/api/account/vendor-usage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ refresh: true })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error || body.message || `HTTP ${res.status}`);
        }
        setData(body as VendorUsagePayload);
        const refreshError = (body as { live_refresh?: { error?: string } }).live_refresh?.error;
        if (refreshError === "no_tokens" || refreshError === "tokens_unreadable") {
          setError(body.live_refresh_hint || "Re-run the sync command from Terminal to enable live Refresh.");
        } else if (body.live_refresh_hint) {
          setError(body.live_refresh_hint);
        } else {
          setError(null);
        }
        return;
      }
      const res = await fetch("/api/account/vendor-usage", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body as VendorUsagePayload);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (unlocked && user) void load();
  }, [unlocked, user, load]);

  const enableSyncAndPatch = useCallback(async () => {
    if (!user) throw new Error("Sign in to sync subscriptions.");
    const token = await user.getIdToken(false);
    const res = await fetch("/api/account/vendor-usage", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        claude_code: { enabled: true },
        codex: { enabled: true },
        cursor: { enabled: true }
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    setData(body as VendorUsagePayload);
  }, [user]);

  const handleSyncClick = useCallback(async () => {
    setSyncBusy(true);
    setError(null);
    setSyncCopied(false);
    try {
      await enableSyncAndPatch();
      await navigator.clipboard.writeText(syncCommand);
      setShowCommand(true);
      setSyncCopied(true);
      window.setTimeout(() => setSyncCopied(false), 3000);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSyncBusy(false);
    }
  }, [enableSyncAndPatch, syncCommand]);

  const profiles = useMemo(() => {
    const rows = (data?.profiles ?? []).filter((p) => !p.sync_error);
    return [...rows].sort(
      (a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider)
    );
  }, [data]);

  const errorProfiles = useMemo(() => (data?.profiles ?? []).filter((p) => p.sync_error), [data]);
  const hasCursor = profiles.some((p) => p.provider === "cursor");
  const hasCodex = profiles.some((p) => p.provider === "codex");
  const hasClaude = profiles.some((p) => p.provider === "claude_code");

  const expenditureSummary = useMemo(
    () => computeMonthlyExpenditureSummary(profiles, rangeDays),
    [profiles, rangeDays]
  );

  if (!unlocked) {
    return (
      <section className="mb-8 w-full rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">AI plan usage</h2>
        <p className="mt-2 text-sm text-muted">Enter the preview password to view subscription usage.</p>
        <form
          className="mt-4 flex max-w-sm flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordInput === VENDOR_USAGE_PASSWORD) {
              window.sessionStorage.setItem(UNLOCK_KEY, "1");
              setUnlocked(true);
              setPasswordError(null);
            } else {
              setPasswordError("Incorrect password.");
            }
          }}
        >
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Password"
            className="min-w-[10rem] flex-1 rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink"
          />
          <button type="submit" className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-cream hover:bg-neutral-800">
            Unlock
          </button>
        </form>
        {passwordError ? <p className="mt-2 text-xs text-red-700">{passwordError}</p> : null}
      </section>
    );
  }

  return (
    <section className="mb-8 w-full rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">AI plan usage</h2>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-4 sm:gap-5">
          {expenditureSummary ? <MonthlyExpenditureStats summary={expenditureSummary} /> : null}
          <button
            type="button"
            disabled={loading}
            onClick={() => void load({ live: true })}
            className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream-dark disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={syncBusy || !user}
          onClick={() => void handleSyncClick()}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
        >
          {syncBusy ? "Preparing…" : syncCopied ? "Command copied" : "Sync subscriptions"}
        </button>
        <div className="flex gap-1">
          {(["mac", "windows"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSyncOs(id)}
              className={`rounded-md border px-2 py-1 text-[10px] font-medium ${
                syncOs === id ? "border-ink bg-ink text-cream" : "border-line text-muted hover:text-ink"
              }`}
            >
              {id === "mac" ? "Mac" : "Windows"}
            </button>
          ))}
        </div>
      </div>

      {syncCopied ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900">
          Command copied — paste in {syncOs === "mac" ? "Terminal.app" : "PowerShell"}, press Enter once, then use{" "}
          <span className="font-medium">Refresh</span> to update live usage.
        </div>
      ) : null}

      {showCommand && !hasClaude ? (
        <div className="mb-4 rounded-xl border border-line bg-white/70 px-3 py-2 text-xs text-muted">
          First-time Claude sync opens your browser once to connect claude.ai.
        </div>
      ) : null}

      {showCommand ? <CopyBlock lines={[syncCommand]} label={syncOs === "mac" ? "Terminal" : "PowerShell"} /> : null}

      {error ? <p className="mb-4 mt-4 text-sm text-red-700">{error}</p> : null}

      {profiles.length > 0 ? (
        <div className="mt-5 space-y-4">
          {profiles.map((profile) => (
            <SubscriptionUsageRow
              key={`${profile.provider}-${profile.profile_id}`}
              profile={profile}
              rangeDays={rangeDays}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">
          No subscription data yet. Click <span className="font-medium text-ink">Sync subscriptions</span>, run the
          command on your computer, then Refresh.
        </p>
      )}

      {errorProfiles.map((profile) => (
        <p
          key={`err-${profile.provider}-${profile.profile_id}`}
          className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-xs text-amber-950"
        >
          {PROVIDER_LABEL[profile.provider]}: {profile.sync_error}
        </p>
      ))}

      {profiles.length > 0 && (!hasCursor || !hasCodex || !hasClaude) ? (
        <div className="mt-4 space-y-2 text-xs text-muted">
          {!hasClaude ? (
            <p>
              Claude not synced —{" "}
              {data?.last_sync_diagnostics?.skip_details?.claude_code ||
                "run the sync command and complete browser sign-in, then click Refresh."}
            </p>
          ) : null}
          {!hasCursor ? <p>Cursor not synced — open Cursor, sign in, then sync again.</p> : null}
          {!hasCodex ? <p>Codex not synced — sign in with ChatGPT in the Codex app, then sync again.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
