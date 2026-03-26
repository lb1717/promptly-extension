"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DetailResponse = {
  ok?: boolean;
  error?: string;
  range_days?: number;
  user?: {
    user_id: string;
    email: string | null;
    plan: string;
    daily_token_limit: number;
    prompts_improved: number;
    all_time_max_daily_token_usage: number;
    provider: string | null;
    google_sub: string | null;
    created_at: string | null;
    updated_at: string | null;
    last_seen_at: string | null;
  };
  today?: {
    day: string;
    used: number;
    prompts_improved: number;
    auto: number;
    manual: number;
    generated: number;
  };
  usage_by_day?: Array<{
    day: string;
    used: number;
    prompts_improved: number;
    auto: number;
    manual: number;
    generated: number;
    limit: number;
  }>;
};

const SPANS = [7, 14, 30, 90] as const;

function formatNumber(value: number) {
  return Intl.NumberFormat("en-US").format(Math.max(0, Number(value || 0)));
}

export function AdminUserDetailClient({ userId }: { userId: string }) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}?days=${days}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as DetailResponse;
      if (!res.ok) {
        setData(null);
        setError(String(json.error || res.statusText));
        return;
      }
      setData(json);
      if (json.user?.daily_token_limit != null) {
        setLimitInput(String(json.user.daily_token_limit));
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [userId, days]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 12000);
    return () => window.clearInterval(id);
  }, [load]);

  async function saveLimit() {
    const next = Math.floor(Number(limitInput));
    if (!Number.isFinite(next) || next < 1) {
      setMessage("");
      setError("Enter a positive number for the daily limit.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_token_limit: next })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(json.error || "Save failed"));
        return;
      }
      setMessage(`Saved. New daily limit: ${formatNumber(json.daily_token_limit ?? next)} tokens (UTC day).`);
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  const u = data?.user;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/admin"
            className="text-sm text-violet-300 hover:text-white"
          >
            ← All users
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-white">User detail</h1>
          <p className="mt-1 font-mono text-xs text-violet-200/80 break-all">{userId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
      {message ? (
        <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      {loading && !u ? (
        <p className="text-violet-200/70">Loading…</p>
      ) : u ? (
        <>
          <section className="mb-8 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">
              Throttle abuse — daily token limit
            </h2>
            <p className="mb-4 text-xs text-violet-200/70">
              Same units as OpenAI <code className="text-violet-100">usage.total_tokens</code>. Resets at UTC
              midnight. Extension and API pick this up on the next request.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1 text-xs text-violet-200/90">
                Daily limit (tokens / UTC day)
                <input
                  type="number"
                  min={1}
                  className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-sm text-white"
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => saveLimit()}
                disabled={saving}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Apply limit"}
              </button>
            </div>
          </section>

          <section className="mb-8 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">Profile</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-violet-400/80">Email</dt>
                <dd className="text-violet-100">{u.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-violet-400/80">Plan</dt>
                <dd className="text-violet-100">{u.plan}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-violet-400/80">Provider</dt>
                <dd className="text-violet-100">{u.provider || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-violet-400/80">Prompts improved (lifetime)</dt>
                <dd className="text-violet-100">{formatNumber(u.prompts_improved)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-violet-400/80">All-time max daily usage</dt>
                <dd className="text-violet-100">{formatNumber(u.all_time_max_daily_token_usage)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-violet-400/80">Current daily limit</dt>
                <dd className="text-violet-100">{formatNumber(u.daily_token_limit)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase text-violet-400/80">Timestamps</dt>
                <dd className="text-xs text-violet-200/80">
                  Created: {u.created_at || "—"} · Updated: {u.updated_at || "—"} · Last seen:{" "}
                  {u.last_seen_at || "—"}
                </dd>
              </div>
              {u.google_sub ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-violet-400/80">Google sub</dt>
                  <dd className="break-all font-mono text-xs text-violet-200/90">{u.google_sub}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {data.today ? (
            <section className="mb-8 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">
                Today (UTC): {data.today.day}
              </h2>
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="text-xs text-violet-400/80">Tokens used</p>
                  <p className="text-lg font-semibold text-white">{formatNumber(data.today.used)}</p>
                </div>
                <div>
                  <p className="text-xs text-violet-400/80">Prompts</p>
                  <p className="text-lg font-semibold text-white">{formatNumber(data.today.prompts_improved)}</p>
                </div>
                <div>
                  <p className="text-xs text-violet-400/80">Auto</p>
                  <p className="text-lg font-semibold text-white">{formatNumber(data.today.auto)}</p>
                </div>
                <div>
                  <p className="text-xs text-violet-400/80">Manual</p>
                  <p className="text-lg font-semibold text-white">{formatNumber(data.today.manual)}</p>
                </div>
                <div>
                  <p className="text-xs text-violet-400/80">Generated</p>
                  <p className="text-lg font-semibold text-white">{formatNumber(data.today.generated)}</p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300/90">
                Daily usage ({data.range_days} days)
              </h2>
              <span className="text-xs text-violet-200/70">{loading ? "Refreshing…" : "Live (12s)"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-violet-500/20 text-xs uppercase tracking-wider text-violet-300/80">
                    <th className="py-2 pr-4">Day</th>
                    <th className="py-2 pr-4">Tokens</th>
                    <th className="py-2 pr-4">Prompts</th>
                    <th className="py-2 pr-4">Auto</th>
                    <th className="py-2 pr-4">Manual</th>
                    <th className="py-2 pr-0">Generated</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.usage_by_day || [])
                    .slice()
                    .reverse()
                    .map((row) => (
                      <tr key={row.day} className="border-b border-violet-500/10 text-violet-100/90">
                        <td className="py-2 pr-4 font-mono text-xs">{row.day}</td>
                        <td className="py-2 pr-4">{formatNumber(row.used)}</td>
                        <td className="py-2 pr-4">{formatNumber(row.prompts_improved)}</td>
                        <td className="py-2 pr-4">{formatNumber(row.auto)}</td>
                        <td className="py-2 pr-4">{formatNumber(row.manual)}</td>
                        <td className="py-2 pr-0">{formatNumber(row.generated)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
