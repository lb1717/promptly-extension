"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type StatsResponse = {
  ok?: boolean;
  error?: string;
  totals?: {
    improved: number;
    auto: number;
    manual: number;
    generated: number;
    tokens: number;
  };
  timeline?: Array<{
    day: string;
    total: number;
    auto: number;
    manual: number;
    generated: number;
    tokens: number;
  }>;
};

type UsersResponse = {
  ok?: boolean;
  error?: string;
  users?: Array<{
    user_id: string;
    email?: string | null;
    avg_daily_token_usage: number;
    seven_day_max_daily_token_usage: number;
    all_time_max_daily_token_usage: number;
    daily_token_limit: number;
    today_tokens: number;
    prompts_improved: number;
  }>;
};

const SPANS = [7, 14, 30, 90] as const;

function compactHash(value: string) {
  if (!value) return "unknown";
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatNumber(value: number) {
  return Intl.NumberFormat("en-US").format(Math.max(0, Number(value || 0)));
}

export function AdminDashboardClient() {
  const [days, setDays] = useState<number>(14);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [users, setUsers] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!cancelled) {
        setLoading(true);
        setError("");
      }
      try {
        const [statsRes, usersRes] = await Promise.all([
          fetch(`/api/admin/stats?days=${days}`, { cache: "no-store" }),
          fetch(`/api/admin/users?days=${days}`, { cache: "no-store" })
        ]);
        const [statsData, usersData] = await Promise.all([statsRes.json(), usersRes.json()]);
        if (cancelled) return;
        setStats(statsData);
        setUsers(usersData);
        if (!statsRes.ok || !usersRes.ok) {
          setError(statsData.error || usersData.error || "Failed to load dashboard data.");
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e instanceof Error ? e.message : e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    const id = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [days]);

  const timeline = stats?.timeline || [];
  const maxDaily = useMemo(
    () => Math.max(1, ...timeline.map((d) => Number(d.total || 0))),
    [timeline]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-violet-200/70">
            Live Promptly usage metrics and user token monitoring.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/prompt-engineering"
            className="rounded-xl border border-violet-500/35 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/15"
          >
            Prompt engineering
          </Link>
          <div className="rounded-xl border border-violet-500/30 bg-[#221830]/60 p-1">
            {SPANS.map((span) => (
              <button
                key={span}
                type="button"
                onClick={() => setDays(span)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  days === span ? "bg-violet-600 text-white" : "text-violet-200 hover:bg-violet-500/10"
                }`}
              >
                {span}d
              </button>
            ))}
          </div>
          <AdminLogoutButton />
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-4">
          <p className="text-xs uppercase tracking-wider text-violet-300/80">Prompts Improved</p>
          <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(stats?.totals?.improved || 0)}</p>
        </div>
        <div className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-4">
          <p className="text-xs uppercase tracking-wider text-violet-300/80">Auto</p>
          <p className="mt-2 text-2xl font-semibold text-violet-100">{formatNumber(stats?.totals?.auto || 0)}</p>
        </div>
        <div className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-4">
          <p className="text-xs uppercase tracking-wider text-violet-300/80">Manual Improved</p>
          <p className="mt-2 text-2xl font-semibold text-violet-100">{formatNumber(stats?.totals?.manual || 0)}</p>
        </div>
        <div className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-4">
          <p className="text-xs uppercase tracking-wider text-violet-300/80">Generated</p>
          <p className="mt-2 text-2xl font-semibold text-violet-100">{formatNumber(stats?.totals?.generated || 0)}</p>
        </div>
        <div className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-4">
          <p className="text-xs uppercase tracking-wider text-violet-300/80">Tokens ({days}d)</p>
          <p className="mt-2 text-2xl font-semibold text-violet-100">{formatNumber(stats?.totals?.tokens || 0)}</p>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300/90">Improved prompts over time</h2>
          <span className="text-xs text-violet-200/70">{loading ? "Refreshing..." : "Live (15s)"}</span>
        </div>
        <div className="grid h-44 grid-cols-[repeat(auto-fit,minmax(18px,1fr))] items-end gap-1">
          {timeline.map((day) => {
            const total = Number(day.total || 0);
            const auto = Number(day.auto || 0);
            const manual = Number(day.manual || 0);
            const generated = Number(day.generated || 0);
            const h = `${Math.max(4, Math.round((total / maxDaily) * 100))}%`;
            const autoH = `${Math.max(0, Math.round((auto / Math.max(1, total)) * 100))}%`;
            const manualH = `${Math.max(0, Math.round((manual / Math.max(1, total)) * 100))}%`;
            const generatedH = `${Math.max(0, Math.round((generated / Math.max(1, total)) * 100))}%`;
            return (
              <div key={day.day} className="group relative flex h-full items-end">
                <div className="relative w-full overflow-hidden rounded-md bg-violet-950/60" style={{ height: h }}>
                  <div className="absolute bottom-0 left-0 w-full bg-violet-500/90" style={{ height: autoH }} />
                  <div className="absolute bottom-0 left-0 w-full bg-fuchsia-500/80" style={{ height: `${Number(autoH.replace("%", "")) + Number(manualH.replace("%", ""))}%` }} />
                  <div className="absolute bottom-0 left-0 w-full bg-cyan-400/80" style={{ height: `${Number(autoH.replace("%", "")) + Number(manualH.replace("%", "")) + Number(generatedH.replace("%", ""))}%` }} />
                </div>
                <div className="pointer-events-none absolute -top-14 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] text-white group-hover:block">
                  {day.day}: {formatNumber(total)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-violet-200/80">
          <span>■ Auto</span>
          <span>■ Manual Improved</span>
          <span>■ Generated</span>
        </div>
      </section>

      <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">User Monitor</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-violet-500/20 text-xs uppercase tracking-wider text-violet-300/80">
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Avg Daily Tokens</th>
                <th className="py-2 pr-4">7d Max Daily Tokens</th>
                <th className="py-2 pr-4">All-time Max Daily Tokens</th>
                <th className="py-2 pr-4">Daily Limit</th>
                <th className="py-2 pr-4">Today Tokens</th>
                <th className="py-2 pr-0">Prompts Improved</th>
              </tr>
            </thead>
            <tbody>
              {(users?.users || []).map((user) => (
                <tr
                  key={user.user_id}
                  className="border-b border-violet-500/10 text-violet-100/90 hover:bg-violet-500/5"
                >
                  <td className="py-2 pr-4 font-mono text-xs">
                    <Link
                      href={`/admin/users/${encodeURIComponent(user.user_id)}`}
                      className="text-violet-300 underline decoration-violet-500/40 underline-offset-2 hover:text-white"
                    >
                      {compactHash(user.user_id)}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-xs">{user.email || "—"}</td>
                  <td className="py-2 pr-4">{formatNumber(user.avg_daily_token_usage)}</td>
                  <td className="py-2 pr-4">{formatNumber(user.seven_day_max_daily_token_usage)}</td>
                  <td className="py-2 pr-4">{formatNumber(user.all_time_max_daily_token_usage)}</td>
                  <td className="py-2 pr-4">{formatNumber(user.daily_token_limit)}</td>
                  <td className="py-2 pr-4">{formatNumber(user.today_tokens)}</td>
                  <td className="py-2 pr-0">{formatNumber(user.prompts_improved)}</td>
                </tr>
              ))}
              {!loading && (users?.users || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-violet-200/70">
                    No user records yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
