"use client";

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

const CHART_COLORS = [
  "#111827",
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#4f46e5",
  "#0f766e"
];

const CHART_TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e8e8e8",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 11,
  color: "#111111",
  boxShadow: "0 2px 8px rgba(17, 17, 17, 0.08)"
};

type PlanUsageSeries = { key: string; label: string; member_id: string };

type CompanyPlanUsageProps = {
  members: Array<{ user_id: string; label: string }>;
  visibleMemberIds: string[];
  planUsageTimeline: Array<Record<string, number | string>>;
  planUsageSeries: PlanUsageSeries[];
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

export function CompanyPlanUsageSection({
  members,
  visibleMemberIds,
  planUsageTimeline,
  planUsageSeries,
  totalPlanMonthlyUsd,
  loading = false
}: CompanyPlanUsageProps) {
  const visibleSet = useMemo(() => new Set(visibleMemberIds), [visibleMemberIds]);

  const chartsByMember = useMemo(() => {
    return members
      .filter((member) => visibleSet.has(member.user_id))
      .map((member, memberIndex) => {
        const series = planUsageSeries.filter((row) => row.member_id === member.user_id);
        const colorOffset = memberIndex * CHART_COLORS.length;
        return {
          member,
          series: series.map((row, index) => ({
            ...row,
            color: CHART_COLORS[(colorOffset + index) % CHART_COLORS.length]!
          }))
        };
      });
  }, [members, visibleSet, planUsageSeries]);

  if (loading) {
    return (
      <section className="mb-8 rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
        <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">Subscription plan use</h2>
        <p className="mt-3 text-sm text-muted">Loading plan usage…</p>
      </section>
    );
  }

  if (!chartsByMember.length) {
    return (
      <section className="mb-8 rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
        <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">Subscription plan use</h2>
        <p className="mt-3 text-sm text-muted">No subscription plan usage for the selected people yet.</p>
      </section>
    );
  }

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">Subscription plan use</h2>
          <p className="mt-1 text-xs text-faint">
            Percent of each AI plan used over time — one chart per person.
          </p>
        </div>
        <p className="text-xs text-muted">{formatCurrency(totalPlanMonthlyUsd)}/mo total plans</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {chartsByMember.map(({ member, series }) => (
          <div key={member.user_id} className="rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
            <h3 className="text-sm font-semibold text-ink">{member.label}</h3>
            <p className="mt-0.5 text-xs text-faint">
              {series.length
                ? `${series.length} plan${series.length === 1 ? "" : "s"} tracked`
                : "No plan sync data yet"}
            </p>
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
                        name={row.label.includes(" · ") ? row.label.split(" · ").slice(1).join(" · ") : row.label}
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
