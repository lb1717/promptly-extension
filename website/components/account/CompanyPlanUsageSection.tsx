"use client";

import { buildMemberColorLookup } from "@/lib/memberChartColors";
import { normalizeUtilizationPercent } from "@/lib/vendorPlanPricing";
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const CHART_TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e8e8e8",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 11,
  color: "#111111",
  boxShadow: "0 2px 8px rgba(17, 17, 17, 0.08)"
};

type PlanUsageSeries = {
  key: string;
  label: string;
  member_id: string;
  subscription_id: string;
  subscription_label: string;
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
  plan_monthly_usd: number | null;
  primary_window: { utilization: number } | null;
  secondary_window: { utilization: number } | null;
};

type CompanyPlanUsageProps = {
  members: Array<{ user_id: string; label: string }>;
  visibleMemberIds: string[];
  planUsageTimeline: Array<Record<string, number | string>>;
  planUsageSeries: PlanUsageSeries[];
  planUsageSubscriptions: PlanUsageSubscription[];
  subscriptionProfiles: SubscriptionProfile[];
  totalPlanMonthlyUsd: number;
  loading?: boolean;
};

function shortDate(day: string) {
  const d = new Date(`${day}T12:00:00.000Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value >= 100 ? `$${Math.round(value)}` : `$${value.toFixed(2)}`;
}

function profileUtilization(profile: SubscriptionProfile): number | null {
  const window = profile.secondary_window || profile.primary_window;
  if (!window) return null;
  return normalizeUtilizationPercent(window.utilization);
}

export function CompanyPlanUsageSection({
  members,
  visibleMemberIds,
  planUsageTimeline,
  planUsageSeries,
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
        const seriesByMember = new Map<string, PlanUsageSeries & { color: string }>();
        for (const row of planUsageSeries) {
          if (row.subscription_id !== subscription.id || !visibleSet.has(row.member_id)) continue;
          if (seriesByMember.has(row.member_id)) continue;
          seriesByMember.set(row.member_id, {
            ...row,
            label: memberLabelById.get(row.member_id) || row.label,
            color: memberColorById.get(row.member_id) ?? "#64748b"
          });
        }

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
          accountCount: visibleMemberIdsForSub.length,
          monthlyUsd: subscription.plan_monthly_usd,
          averageUtilization,
          series: [...seriesByMember.values()].sort((a, b) => a.label.localeCompare(b.label))
        };
      })
      .filter((chart): chart is NonNullable<typeof chart> => chart != null)
      .sort((a, b) => a.subscription.label.localeCompare(b.subscription.label));
  }, [
    planUsageSubscriptions,
    subscriptionProfiles,
    planUsageSeries,
    visibleSet,
    memberColorById,
    memberLabelById
  ]);

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
            Percent of each AI subscription used over time — one chart per subscription, one line per account.
          </p>
        </div>
        <p className="text-xs text-muted">
          {formatCurrency(filteredTotalMonthlyUsd || totalPlanMonthlyUsd)}/mo total plans
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {chartsBySubscription.map(({ subscription, accountCount, monthlyUsd, averageUtilization, series }) => (
          <div key={subscription.id} className="rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
            <h3 className="text-sm font-semibold text-ink">{subscription.label}</h3>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                <span className="font-semibold tabular-nums text-ink">{accountCount}</span>{" "}
                {accountCount === 1 ? "account" : "accounts"}
              </span>
              <span>
                <span className="font-semibold tabular-nums text-ink">
                  {monthlyUsd != null ? formatCurrency(monthlyUsd) : "—"}
                </span>
                /mo
              </span>
              <span>
                <span className="font-semibold tabular-nums text-ink">
                  {averageUtilization != null ? `${averageUtilization}%` : "—"}
                </span>{" "}
                avg used
              </span>
            </div>
            <div className="mt-4 h-64 w-full">
              {series.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={planUsageTimeline} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(value) => shortDate(String(value))} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {series.map((row) => (
                      <Line
                        key={row.key}
                        type="monotone"
                        dataKey={row.key}
                        name={row.label}
                        stroke={row.color}
                        strokeWidth={2.25}
                        dot={{ r: 2.5, strokeWidth: 0 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center justify-center text-sm text-muted">No usage history yet.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
