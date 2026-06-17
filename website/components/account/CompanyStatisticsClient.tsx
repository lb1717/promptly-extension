"use client";

import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
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

type CompanyMember = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: "admin" | "member";
  label: string;
  totals: {
    prompts: number;
    screen_time_minutes: number;
    auto: number;
    manual: number;
    generated: number;
    plan_monthly_usd: number;
  };
};

type CompanyStatsPayload = {
  ok?: boolean;
  error?: string;
  range_days: number;
  company: { id: string; name: string; logo_url: string | null };
  members: CompanyMember[];
  totals: {
    prompts: number;
    screen_time_minutes: number;
    auto: number;
    manual: number;
    generated: number;
    plan_monthly_usd: number;
  };
  timeline: Array<{
    day: string;
    total_prompts: number;
    by_member: Record<string, { prompts: number; auto: number; manual: number; generated: number }>;
  }>;
  screen_time_timeline: Array<{
    day: string;
    total_screen_time_minutes: number;
    by_member: Record<string, number>;
  }>;
  plan_usage_timeline: Array<Record<string, number | string>>;
  subscription_profiles: Array<{
    member_id: string;
    member_label: string;
    provider: string;
    plan_display: string | null;
    plan_monthly_usd: number | null;
    primary_window: { utilization: number } | null;
    secondary_window: { utilization: number } | null;
  }>;
};

const RANGE_OPTIONS = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 }
];

function formatNumber(value: number) {
  return Intl.NumberFormat("en-US").format(Math.max(0, Math.round(Number(value || 0))));
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value >= 100 ? `$${Math.round(value)}` : `$${value.toFixed(2)}`;
}

function formatScreenTimeMinutes(minutes: number) {
  const total = Math.max(0, Math.round(Number(minutes || 0)));
  if (total < 60) return `${formatNumber(total)} min`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function shortDate(day: string) {
  const d = new Date(`${day}T12:00:00.000Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function providerLabel(provider: string) {
  if (provider === "claude_code") return "Claude";
  if (provider === "codex") return "Codex";
  if (provider === "cursor") return "Cursor";
  return provider;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-cream p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

export function CompanyStatisticsClient({ user }: { user: User | null }) {
  const [days, setDays] = useState(30);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("all");
  const [data, setData] = useState<CompanyStatsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken(false);
      const res = await fetch(`/api/account/company/stats?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const json = (await res.json().catch(() => ({}))) as CompanyStatsPayload;
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      setData(json);
      if (selectedMemberId !== "all" && !json.members.some((member) => member.user_id === selectedMemberId)) {
        setSelectedMemberId("all");
      }
    } catch (e) {
      setData(null);
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [days, selectedMemberId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const members = data?.members || [];
  const visibleMembers = selectedMemberId === "all"
    ? members
    : members.filter((member) => member.user_id === selectedMemberId);

  const promptRows = useMemo(
    () =>
      (data?.timeline || []).map((row) => ({
        day: row.day,
        label: shortDate(row.day),
        ...Object.fromEntries(members.map((member) => [member.user_id, row.by_member[member.user_id]?.prompts || 0]))
      })),
    [data?.timeline, members]
  );

  const screenTimeRows = useMemo(
    () =>
      (data?.screen_time_timeline || []).map((row) => ({
        day: row.day,
        label: shortDate(row.day),
        ...Object.fromEntries(members.map((member) => [member.user_id, row.by_member[member.user_id] || 0]))
      })),
    [data?.screen_time_timeline, members]
  );

  const selectedMember = members.find((member) => member.user_id === selectedMemberId) || null;
  const selectedTotals =
    selectedMemberId === "all"
      ? data?.totals
      : selectedMember?.totals;

  if (!user) {
    return <p className="rounded-2xl border border-line bg-cream p-6 text-sm text-muted">Sign in to view company statistics.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-cream p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {data?.company.logo_url ? (
              <img src={data.company.logo_url} alt="" className="h-12 w-12 rounded-xl object-contain" />
            ) : null}
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                {data?.company.name || "Company Statistics"}
              </h2>
              <p className="mt-1 text-sm text-faint">
                {members.length ? `${members.length} people` : loading ? "Loading team…" : "No members yet"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
            >
              <option value="all">All people</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.label}
                </option>
              ))}
            </select>
            <div className="rounded-xl border border-line bg-white p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setDays(option.days)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    days === option.days ? "bg-ink text-cream" : "text-muted hover:bg-cream-dark"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="shrink-0 whitespace-nowrap rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-cream-dark disabled:opacity-60"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        {error ? <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Prompts" value={formatNumber(selectedTotals?.prompts || 0)} />
        <StatCard label="AI screen time" value={formatScreenTimeMinutes(selectedTotals?.screen_time_minutes || 0)} />
        <StatCard label="AI plan cost" value={`${formatCurrency(selectedTotals?.plan_monthly_usd || 0)}/mo`} />
        <StatCard label="Generated" value={formatNumber(selectedTotals?.generated || 0)} />
      </section>

      <section className="rounded-2xl border border-line bg-cream p-5 shadow-card">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Prompts by person</h3>
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={promptRows} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {visibleMembers.map((member, index) => (
                <Bar
                  key={member.user_id}
                  dataKey={member.user_id}
                  name={member.label}
                  stackId="people"
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                  maxBarSize={42}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-cream p-5 shadow-card">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">AI screen time by person</h3>
        <p className="mt-1 text-xs text-faint">Minutes spent drafting, waiting, and reading AI output in the IDE.</p>
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={screenTimeRows} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="m" />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number) => [`${formatNumber(value)} min`, ""]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {visibleMembers.map((member, index) => (
                <Bar
                  key={member.user_id}
                  dataKey={member.user_id}
                  name={member.label}
                  stackId="people"
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                  maxBarSize={42}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-cream p-5 shadow-card">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Subscription plan use</h3>
            <p className="mt-1 text-xs text-faint">Percent of AI plan used over time, one line per person.</p>
          </div>
          <p className="text-xs text-muted">{formatCurrency(data?.totals.plan_monthly_usd || 0)}/mo total plans</p>
        </div>
        <div className="mt-4 h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.plan_usage_timeline || []} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(value) => shortDate(String(value))} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {visibleMembers.map((member, index) => (
                <Line
                  key={member.user_id}
                  type="monotone"
                  dataKey={member.user_id}
                  name={member.label}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2.25}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-cream p-5 shadow-card">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">People and plans</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-faint">
              <tr>
                <th className="pb-3 pr-4 font-semibold">Person</th>
                <th className="pb-3 pr-4 font-semibold">Role</th>
                <th className="pb-3 pr-4 font-semibold">Prompts</th>
                <th className="pb-3 pr-4 font-semibold">Screen time</th>
                <th className="pb-3 pr-4 font-semibold">AI plans</th>
                <th className="pb-3 font-semibold">Monthly cost</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              {members.map((member) => {
                const plans = (data?.subscription_profiles || []).filter((profile) => profile.member_id === member.user_id);
                return (
                  <tr key={member.user_id} className="border-b border-line/80">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink">{member.label}</p>
                      <p className="text-xs text-faint">{member.email || member.user_id}</p>
                    </td>
                    <td className="py-3 pr-4 capitalize">{member.role === "admin" ? "Admin" : "Normal"}</td>
                    <td className="py-3 pr-4 tabular-nums">{formatNumber(member.totals.prompts)}</td>
                    <td className="py-3 pr-4 tabular-nums">{formatScreenTimeMinutes(member.totals.screen_time_minutes)}</td>
                    <td className="py-3 pr-4 text-xs">
                      {plans.length
                        ? plans.map((profile) => `${providerLabel(profile.provider)} ${profile.plan_display || ""}`.trim()).join(", ")
                        : "—"}
                    </td>
                    <td className="py-3 tabular-nums">{formatCurrency(member.totals.plan_monthly_usd)}/mo</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
