"use client";

import type { User } from "firebase/auth";
import { buildMemberColorLookup } from "@/lib/memberChartColors";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatisticsClient, type CompanyStatisticsConfig } from "@/components/account/StatisticsClient";
import { CompanyPlanUsageSection } from "@/components/account/CompanyPlanUsageSection";

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
  plan_usage_timeline: Array<Record<string, number | string>>;
  plan_usage_series?: Array<{
    key: string;
    label: string;
    member_id: string;
    subscription_id: string;
    subscription_label: string;
  }>;
  plan_usage_subscriptions?: Array<{
    id: string;
    label: string;
    provider: string;
    plan_display: string | null;
    vendor_email: string | null;
    plan_monthly_usd: number | null;
    member_ids: string[];
  }>;
  subscription_profiles: Array<{
    member_id: string;
    member_label: string;
    subscription_id?: string;
    provider: string;
    profile_id?: string;
    vendor_email?: string | null;
    plan_display: string | null;
    plan_monthly_usd: number | null;
    synced_at_ms?: number;
    primary_window: { utilization: number; resets_at?: string | null; window_seconds?: number | null } | null;
    secondary_window: { utilization: number; resets_at?: string | null; window_seconds?: number | null } | null;
    usage_history?: {
      primary: Array<{ at_ms: number; utilization: number }>;
      secondary: Array<{ at_ms: number; utilization: number }>;
    };
  }>;
};

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

function providerLabel(provider: string) {
  if (provider === "claude_code") return "Claude";
  if (provider === "codex") return "Codex";
  if (provider === "cursor") return "Cursor";
  return provider;
}

function resolveVisibleMemberIds(allMembers: CompanyMember[], selectedMemberIds: string[]): string[] {
  if (!allMembers.length) return [];
  if (!selectedMemberIds.length) return allMembers.map((member) => member.user_id);
  const allowed = new Set(allMembers.map((member) => member.user_id));
  const filtered = selectedMemberIds.filter((id) => allowed.has(id));
  return filtered.length ? filtered : allMembers.map((member) => member.user_id);
}

export function CompanyStatisticsClient({ user }: { user: User | null }) {
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<CompanyStatsPayload | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");

  const members = overview?.members ?? [];
  const visibleMemberIds = useMemo(
    () => resolveVisibleMemberIds(members, selectedMemberIds),
    [members, selectedMemberIds]
  );
  const multiMemberView = visibleMemberIds.length !== 1;

  const memberColorById = useMemo(() => buildMemberColorLookup(members), [members]);

  const loadOverview = useCallback(async () => {
    if (!user) return;
    setOverviewLoading(true);
    setOverviewError("");
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
      setOverview(json);
      setSelectedMemberIds((prev) => {
        if (!prev.length) return [];
        const allowed = new Set(json.members.map((member) => member.user_id));
        const next = prev.filter((id) => allowed.has(id));
        return next.length ? next : [];
      });
    } catch (e) {
      setOverview(null);
      setOverviewError(String(e instanceof Error ? e.message : e));
    } finally {
      setOverviewLoading(false);
    }
  }, [days, user]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const toggleMember = useCallback((memberId: string) => {
    setSelectedMemberIds((prev) => {
      const allIds = members.map((member) => member.user_id);
      const current = prev.length ? prev : allIds;
      const next = new Set(current);
      if (next.has(memberId)) {
        if (next.size <= 1) return current;
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return [...next];
    });
  }, [members]);

  const selectAllMembers = useCallback(() => {
    setSelectedMemberIds([]);
  }, []);

  const companyStatistics = useMemo((): CompanyStatisticsConfig | undefined => {
    if (!user || !members.length) return undefined;
    return {
      user,
      memberIds: visibleMemberIds,
      memberOptions: members.map((member) => ({ user_id: member.user_id, label: member.label })),
      multiMemberView,
      days,
      onDaysChange: setDays,
      onOverviewRefresh: () => void loadOverview(),
      planUsageSection: (
        <CompanyPlanUsageSection
          members={members}
          visibleMemberIds={visibleMemberIds}
          planUsageSubscriptions={overview?.plan_usage_subscriptions ?? []}
          subscriptionProfiles={overview?.subscription_profiles ?? []}
          totalPlanMonthlyUsd={overview?.totals.plan_monthly_usd ?? 0}
          loading={overviewLoading}
        />
      )
    };
  }, [user, members, visibleMemberIds, multiMemberView, days, loadOverview, overview, overviewLoading]);

  const visibleMembersForTable = useMemo(() => {
    const allowed = new Set(visibleMemberIds);
    return members.filter((member) => allowed.has(member.user_id));
  }, [members, visibleMemberIds]);

  if (!user) {
    return (
      <p className="rounded-2xl border border-line bg-cream p-6 text-sm text-muted">
        Sign in to view company statistics.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-cream p-5 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            {overview?.company.logo_url ? (
              <img src={overview.company.logo_url} alt="" className="h-12 w-12 rounded-xl object-contain" />
            ) : null}
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                {overview?.company.name || "Company Statistics"}
              </h2>
              <p className="mt-1 text-sm text-faint">
                {members.length ? `${members.length} people` : overviewLoading ? "Loading team…" : "No members yet"}
              </p>
            </div>
          </div>
          <div className="min-w-[16rem] flex-1 lg:max-w-xl">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">People</p>
              <button
                type="button"
                onClick={selectAllMembers}
                className="text-xs font-medium text-muted hover:text-ink"
              >
                Select all
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {members.map((member) => {
                const active =
                  !selectedMemberIds.length || selectedMemberIds.includes(member.user_id);
                const memberColor = memberColorById.get(member.user_id) ?? "#64748b";
                return (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => toggleMember(member.user_id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "text-cream"
                        : "border-line bg-white text-muted hover:bg-cream-dark"
                    }`}
                    style={
                      active
                        ? { backgroundColor: memberColor, borderColor: memberColor }
                        : { borderColor: memberColor, color: memberColor }
                    }
                  >
                    {member.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-faint">
              {multiMemberView
                ? "Charts group by person. Select exactly one person to filter by service or model."
                : "One person selected — use the filters below to group by service or model."}
            </p>
          </div>
        </div>
        {overviewError ? (
          <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700">
            {overviewError}
          </p>
        ) : null}
      </section>

      {companyStatistics ? (
        <StatisticsClient embedded companyStatistics={companyStatistics} />
      ) : overviewLoading ? (
        <p className="rounded-2xl border border-line bg-cream p-6 text-sm text-muted">Loading statistics…</p>
      ) : null}

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
              {visibleMembersForTable.map((member) => {
                const plans = (overview?.subscription_profiles || []).filter(
                  (profile) => profile.member_id === member.user_id
                );
                return (
                  <tr key={member.user_id} className="border-b border-line/80">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink">{member.label}</p>
                      <p className="text-xs text-faint">{member.email || member.user_id}</p>
                    </td>
                    <td className="py-3 pr-4 capitalize">{member.role === "admin" ? "Admin" : "Normal"}</td>
                    <td className="py-3 pr-4 tabular-nums">{formatNumber(member.totals.prompts)}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatScreenTimeMinutes(member.totals.screen_time_minutes)}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {plans.length
                        ? plans
                            .map((profile) =>
                              `${providerLabel(profile.provider)} ${profile.plan_display || ""}`.trim()
                            )
                            .join(" · ")
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
