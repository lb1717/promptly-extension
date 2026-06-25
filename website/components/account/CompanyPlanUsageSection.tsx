"use client";

import {
  buildCompanyMultiMemberCycleChart,
  chartYTicks,
  formatChartXLabel,
  formatCycleBoundaryLabel,
  type CompanyMemberSeries,
  type PeriodNavState,
  type UsageHistoryPoint,
  type UsageWindow
} from "@/lib/companyPlanUsageCharts";
import { buildMemberColorLookup } from "@/lib/memberChartColors";
import { normalizeUtilizationPercent } from "@/lib/vendorPlanPricing";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const CHART_FONT_FAMILY = "var(--font-roboto-chart), Roboto, sans-serif";
const CHART_Y_TICK = { fill: "#5C5C5C", fontSize: 10, fontFamily: CHART_FONT_FAMILY };
const CHART_X_DATE_TICK = {
  fill: "#2a2a2a",
  fontSize: 11,
  fontWeight: 600 as const,
  fontFamily: CHART_FONT_FAMILY
};
const CHART_TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e8e8e8",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 11,
  color: "#111111",
  fontFamily: CHART_FONT_FAMILY,
  boxShadow: "0 2px 8px rgba(17, 17, 17, 0.08)"
};

type PlanUsageSubscription = {
  id: string;
  label: string;
  provider: string;
  plan_display: string | null;
  vendor_email: string | null;
  plan_monthly_usd: number | null;
  member_ids: string[];
};

type SubscriptionProfile = {
  member_id: string;
  subscription_id?: string;
  provider?: string;
  plan_monthly_usd: number | null;
  synced_at_ms?: number;
  primary_window: {
    utilization: number;
    resets_at?: string | null;
    window_seconds?: number | null;
  } | null;
  secondary_window: {
    utilization: number;
    resets_at?: string | null;
    window_seconds?: number | null;
  } | null;
  usage_history?: {
    primary: UsageHistoryPoint[];
    secondary: UsageHistoryPoint[];
  };
};

type SubscriptionChartModel = {
  subscription: PlanUsageSubscription;
  planName: string;
  accountCount: number;
  monthlyUsd: number | null;
  averageUtilization: number | null;
  memberSeries: CompanyMemberSeries[];
};

type CompanyPlanUsageProps = {
  members: Array<{ user_id: string; label: string }>;
  visibleMemberIds: string[];
  planUsageSubscriptions: PlanUsageSubscription[];
  subscriptionProfiles: SubscriptionProfile[];
  totalPlanMonthlyUsd: number;
  loading?: boolean;
};

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value >= 100 ? `$${Math.round(value)}` : `$${value.toFixed(2)}`;
}

function activeWindow(profile: SubscriptionProfile): UsageWindow | null {
  const window = profile.secondary_window || profile.primary_window;
  if (!window) return null;
  return {
    utilization: window.utilization,
    resets_at: window.resets_at ?? null,
    window_seconds: window.window_seconds ?? null
  };
}

function activeHistory(profile: SubscriptionProfile): UsageHistoryPoint[] {
  if (profile.secondary_window) return profile.usage_history?.secondary ?? [];
  return profile.usage_history?.primary ?? [];
}

function profileUtilization(profile: SubscriptionProfile): number | null {
  const window = activeWindow(profile);
  if (!window) return null;
  return normalizeUtilizationPercent(window.utilization);
}

function PeriodNavigator({
  state,
  onChange
}: {
  state: PeriodNavState;
  onChange: (offset: number) => void;
}) {
  const arrowClass = (enabled: boolean) =>
    `px-1 text-sm font-semibold transition-colors ${
      enabled ? "text-sky-700 hover:text-sky-900" : "cursor-default text-faint/45"
    }`;

  return (
    <div className="flex items-center justify-center gap-2 text-xs font-medium">
      <button
        type="button"
        aria-label="Previous period"
        disabled={!state.canGoBack || state.previousOffset == null}
        onClick={() => {
          if (state.previousOffset != null) onChange(state.previousOffset);
        }}
        className={arrowClass(state.canGoBack)}
      >
        &lt;
      </button>
      <span className="min-w-[6.25rem] text-center text-sky-700">{state.label}</span>
      <button
        type="button"
        aria-label="Next period"
        disabled={!state.canGoForward || state.nextOffset == null}
        onClick={() => {
          if (state.nextOffset != null) onChange(state.nextOffset);
        }}
        className={arrowClass(state.canGoForward)}
      >
        &gt;
      </button>
    </div>
  );
}

function SubscriptionPlanChart({ chart }: { chart: SubscriptionChartModel }) {
  const [periodOffset, setPeriodOffset] = useState(0);

  useEffect(() => {
    setPeriodOffset(0);
  }, [chart.subscription.id, chart.memberSeries.length]);

  const cycleChart = useMemo(
    () => buildCompanyMultiMemberCycleChart(chart.memberSeries, periodOffset),
    [chart.memberSeries, periodOffset]
  );

  useEffect(() => {
    if (cycleChart && cycleChart.periodNav.selectedOffset !== periodOffset) {
      setPeriodOffset(cycleChart.periodNav.selectedOffset);
    }
  }, [cycleChart, periodOffset]);

  const spanMs = cycleChart ? Math.max(cycleChart.cycleEndMs - cycleChart.cycleStartMs, 1) : 1;

  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink">{chart.planName}</h3>
          <p className="mt-1 text-sm text-muted">
            {chart.monthlyUsd != null ? (
              <>
                <span className="font-semibold tabular-nums text-ink">{formatCurrency(chart.monthlyUsd)}</span>
                /mo per account
              </>
            ) : (
              "Cost unavailable"
            )}
            <span className="mx-2 text-faint">·</span>
            <span className="font-semibold tabular-nums text-ink">{chart.accountCount}</span>{" "}
            {chart.accountCount === 1 ? "user" : "users"}
            {chart.averageUtilization != null ? (
              <>
                <span className="mx-2 text-faint">·</span>
                <span className="font-semibold tabular-nums text-ink">{chart.averageUtilization}%</span> avg used
              </>
            ) : null}
          </p>
        </div>
        {cycleChart ? <PeriodNavigator state={cycleChart.periodNav} onChange={setPeriodOffset} /> : null}
      </div>

      <div className="mt-5 h-80 w-full sm:h-96">
        {cycleChart && chart.memberSeries.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cycleChart.rows} margin={{ top: 12, right: 18, bottom: 8, left: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis
                dataKey="at_ms"
                type="number"
                domain={[cycleChart.cycleStartMs, cycleChart.cycleEndMs]}
                allowDataOverflow
                stroke="#525252"
                tick={CHART_X_DATE_TICK}
                minTickGap={28}
                tickFormatter={(value) =>
                  formatChartXLabel(Number(value), spanMs, cycleChart.windowSeconds)
                }
              />
              <YAxis
                domain={[0, cycleChart.yMax]}
                stroke="#8A8A8A"
                allowDecimals={false}
                width={52}
                tick={CHART_Y_TICK}
                ticks={chartYTicks(cycleChart.yMax)}
                unit="%"
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number, name) => {
                  const member = chart.memberSeries.find((row) => row.memberId === String(name));
                  return [`${Math.round(value)}% used`, member?.label ?? String(name)];
                }}
                labelFormatter={(_, payload) => {
                  const atMs = payload?.[0]?.payload?.at_ms;
                  return typeof atMs === "number"
                    ? new Date(atMs).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit"
                      })
                    : "";
                }}
              />
              <ReferenceLine
                x={cycleChart.cycleStartMs}
                stroke="#cbd5e1"
                strokeWidth={1}
                label={{
                  value: `Start · ${formatCycleBoundaryLabel(cycleChart.cycleStartMs)}`,
                  position: "insideTopLeft",
                  fill: "#64748b",
                  fontSize: 9
                }}
              />
              <ReferenceLine
                x={cycleChart.cycleEndMs}
                stroke="#cbd5e1"
                strokeWidth={1}
                label={{
                  value: `End · ${formatCycleBoundaryLabel(cycleChart.cycleEndMs)}`,
                  position: "insideTopRight",
                  fill: "#64748b",
                  fontSize: 9
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {chart.memberSeries.map((member) => (
                <Line
                  key={member.memberId}
                  type="linear"
                  dataKey={member.memberId}
                  name={member.label}
                  stroke={member.color}
                  strokeWidth={2.75}
                  connectNulls
                  dot={false}
                  activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 1.5 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted">No usage history yet.</p>
        )}
      </div>
    </div>
  );
}

export function CompanyPlanUsageSection({
  members,
  visibleMemberIds,
  planUsageSubscriptions,
  subscriptionProfiles,
  totalPlanMonthlyUsd,
  loading = false
}: CompanyPlanUsageProps) {
  const visibleSet = useMemo(() => new Set(visibleMemberIds), [visibleMemberIds]);
  const memberColorById = useMemo(() => buildMemberColorLookup(members), [members]);
  const memberLabelById = useMemo(
    () => new Map(members.map((member) => [member.user_id, member.label])),
    [members]
  );

  const chartsBySubscription = useMemo(() => {
    const profilesBySubscriptionMember = new Map<string, Map<string, SubscriptionProfile>>();
    for (const profile of subscriptionProfiles) {
      const subscriptionId = profile.subscription_id;
      if (!subscriptionId) continue;
      const byMember = profilesBySubscriptionMember.get(subscriptionId) || new Map<string, SubscriptionProfile>();
      byMember.set(profile.member_id, profile);
      profilesBySubscriptionMember.set(subscriptionId, byMember);
    }

    return planUsageSubscriptions
      .map((subscription) => {
        const visibleMemberIdsForSub = subscription.member_ids.filter((memberId) => visibleSet.has(memberId));
        if (!visibleMemberIdsForSub.length) return null;

        const profilesByMember = profilesBySubscriptionMember.get(subscription.id);
        const memberSeries: CompanyMemberSeries[] = visibleMemberIdsForSub
          .map((memberId) => {
            const profile = profilesByMember?.get(memberId);
            if (!profile) return null;
            return {
              memberId,
              label: memberLabelById.get(memberId) || memberId.slice(0, 8),
              color: memberColorById.get(memberId) ?? "#64748b",
              provider: profile.provider ?? subscription.provider,
              window: activeWindow(profile),
              history: activeHistory(profile),
              syncedAtMs: profile.synced_at_ms ?? Date.now()
            };
          })
          .filter((row): row is CompanyMemberSeries => row != null)
          .sort((a, b) => a.label.localeCompare(b.label));

        const utilizationValues = visibleMemberIdsForSub
          .map((memberId) => profilesByMember?.get(memberId))
          .filter((profile): profile is SubscriptionProfile => Boolean(profile))
          .map((profile) => profileUtilization(profile))
          .filter((value): value is number => value != null);

        const averageUtilization =
          utilizationValues.length > 0
            ? Math.round(utilizationValues.reduce((sum, value) => sum + value, 0) / utilizationValues.length)
            : null;

        return {
          subscription,
          planName: subscription.plan_display || subscription.label,
          accountCount: visibleMemberIdsForSub.length,
          monthlyUsd: subscription.plan_monthly_usd,
          averageUtilization,
          memberSeries
        } satisfies SubscriptionChartModel;
      })
      .filter((chart): chart is SubscriptionChartModel => chart != null)
      .sort((a, b) => a.planName.localeCompare(b.planName));
  }, [planUsageSubscriptions, subscriptionProfiles, visibleSet, memberColorById, memberLabelById]);

  const filteredTotalMonthlyUsd = useMemo(
    () => chartsBySubscription.reduce((sum, chart) => sum + (chart.monthlyUsd ?? 0), 0),
    [chartsBySubscription]
  );

  if (loading) {
    return (
      <section className="mb-8 rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
        <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">Subscription plan use</h2>
        <p className="mt-3 text-sm text-muted">Loading plan usage…</p>
      </section>
    );
  }

  if (!chartsBySubscription.length) {
    return (
      <section className="mb-8 rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
        <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">Subscription plan use</h2>
        <p className="mt-3 text-sm text-muted">No subscription plans for the selected people yet.</p>
      </section>
    );
  }

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">Subscription plan use</h2>
          <p className="mt-1 text-xs text-faint">
            One billing cycle at a time — one chart per subscription, one solid line per user.
          </p>
        </div>
        <p className="text-xs text-muted">
          {formatCurrency(filteredTotalMonthlyUsd || totalPlanMonthlyUsd)}/mo total plans
        </p>
      </div>
      <div className="space-y-6">
        {chartsBySubscription.map((chart) => (
          <SubscriptionPlanChart key={chart.subscription.id} chart={chart} />
        ))}
      </div>
    </section>
  );
}
