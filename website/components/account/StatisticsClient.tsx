"use client";

import { getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Link from "next/link";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  Pie,
  PieChart
} from "recharts";

type HostPassivePayload = {
  events_docs_in_query: number;
  sends_attributed_in_range: number;
  composer_snapshots_attributed_in_range: number;
  index_missing: boolean;
  likely_truncated: boolean;
  timeline: Array<{
    bucket: string;
    sends: number;
    composer_input_events: number;
    passive_activity_total: number;
    avg_composer_chars: number | null;
    avg_host_response_latency_ms: number | null;
    avg_assistant_reply_chars_visible: number | null;
  }>;
  breakdown_service: {
    chatgpt: number;
    claude: number;
    gemini: number;
    unknown: number;
  };
  model_buckets: Array<{ bucket: string; exemplar_label: string | null; events: number }>;
};

type ExtendedStatsPayload = {
  ok: true;
  range_days: number;
  granularity: "day" | "week";
  events_in_range: number;
  likely_truncated: boolean;
  /** True when Firestore events query skipped (typically missing composite index still building). */
  events_index_missing?: boolean;
  rollup_daily: {
    totals: {
      prompts: number;
      tokens: number;
      auto_prompts: number;
      manual_prompts: number;
      generated_prompts: number;
    };
    service_breakdown: {
      chatgpt: number;
      claude: number;
      gemini: number;
      unknown: number;
    };
    averages: {
      prompts_per_active_day: number;
      tokens_per_prompt: number;
      response_time_ms: number;
    };
  };
  timeline: Array<{
    bucket: string;
    prompts: number;
    billed_promptly_tokens: number;
    avg_composer_chars: number | null;
    host_composer_chars_equiv_tokens_estimate: number | null;
    avg_optimize_latency_ms: number | null;
  }>;
  breakdowns_from_events: {
    service: { chatgpt: number; claude: number; gemini: number; unknown: number };
    mode: { auto: number; improve: number; generate: number };
    model_buckets: Array<{ bucket: string; exemplar_label: string | null; prompts: number }>;
  };
  /** Passive extension telemetry on ChatGPT / Claude / Gemini: typing snapshots in the native composer plus sends (independent of Promptly optimize). */
  host_passive_listener?: HostPassivePayload;
  footnotes: string[];
};

const PIE_COLORS = ["#8b5cf6", "#6366f1", "#06b6d4", "#94a3b8"];

function getRecentDaysClient(count: number): string[] {
  const n = Math.max(1, Math.min(90, Math.floor(count)));
  return Array.from({ length: n }, (_, idx) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (n - idx - 1));
    return date.toISOString().slice(0, 10);
  });
}

function isoWeekMondayUtcDayClient(utcYmd: string): string {
  const parts = utcYmd.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x))) {
    return utcYmd;
  }
  const [y, mo, d] = parts as [number, number, number];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const dow = dt.getUTCDay();
  const mondayOffset = (dow + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - mondayOffset);
  return dt.toISOString().slice(0, 10);
}

function buildPlaceholderExtendedStats(days: number, granularity: "day" | "week"): ExtendedStatsPayload {
  const range_days = Math.max(1, Math.min(90, Math.floor(days)));
  const recentDays = getRecentDaysClient(range_days);
  let timeline: ExtendedStatsPayload["timeline"];
  if (granularity === "week") {
    const weeks = new Map<string, ExtendedStatsPayload["timeline"][number]>();
    for (const d of recentDays) {
      const wk = isoWeekMondayUtcDayClient(d);
      if (!weeks.has(wk)) {
        weeks.set(wk, {
          bucket: wk,
          prompts: 0,
          billed_promptly_tokens: 0,
          avg_composer_chars: null,
          host_composer_chars_equiv_tokens_estimate: null,
          avg_optimize_latency_ms: null
        });
      }
    }
    timeline = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, row]) => row);
  } else {
    timeline = recentDays.map((bucket) => ({
      bucket,
      prompts: 0,
      billed_promptly_tokens: 0,
      avg_composer_chars: null,
      host_composer_chars_equiv_tokens_estimate: null,
      avg_optimize_latency_ms: null
    }));
  }
  const emptyHostPassive: HostPassivePayload = {
    events_docs_in_query: 0,
    sends_attributed_in_range: 0,
    composer_snapshots_attributed_in_range: 0,
    index_missing: false,
    likely_truncated: false,
    timeline: timeline.map((row) => ({
      bucket: row.bucket,
      sends: 0,
      composer_input_events: 0,
      passive_activity_total: 0,
      avg_composer_chars: null,
      avg_host_response_latency_ms: null,
      avg_assistant_reply_chars_visible: null
    })),
    breakdown_service: { chatgpt: 0, claude: 0, gemini: 0, unknown: 0 },
    model_buckets: []
  };
  return {
    ok: true,
    range_days,
    granularity,
    events_in_range: 0,
    likely_truncated: false,
    events_index_missing: false,
    rollup_daily: {
      totals: {
        prompts: 0,
        tokens: 0,
        auto_prompts: 0,
        manual_prompts: 0,
        generated_prompts: 0
      },
      service_breakdown: { chatgpt: 0, claude: 0, gemini: 0, unknown: 0 },
      averages: {
        prompts_per_active_day: 0,
        tokens_per_prompt: 0,
        response_time_ms: 0
      }
    },
    timeline,
    breakdowns_from_events: {
      service: { chatgpt: 0, claude: 0, gemini: 0, unknown: 0 },
      mode: { auto: 0, improve: 0, generate: 0 },
      model_buckets: []
    },
    host_passive_listener: emptyHostPassive,
    footnotes: [
      "Charts populate after you optimize prompts while signed into Promptly.",
      "KPI totals here come from authoritative daily rollup once you have recorded usage."
    ]
  };
}

function formatShortDay(isoYmd: string) {
  if (!isoYmd || isoYmd.length < 10) {
    return isoYmd || "—";
  }
  const tail = isoYmd.slice(5);
  return tail.replace("-", "/");
}

function ModeChart({ modes }: { modes: ExtendedStatsPayload["breakdowns_from_events"]["mode"] }) {
  const data = [
    { name: "Auto", prompts: modes.auto },
    { name: "Improve", prompts: modes.improve },
    { name: "Generate", prompts: modes.generate }
  ];
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis type="number" stroke="#c4b5fd" />
          <YAxis dataKey="name" type="category" width={92} stroke="#c4b5fd" tick={{ fill: "#e9e5ff" }} />
          <Tooltip contentStyle={{ background: "#18122b", border: "1px solid rgba(139,92,246,0.35)" }} />
          <Bar dataKey="prompts" name="Optimize events" fill="#a78bfa" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ServicePie({
  service,
  idleLabel = "No optimize events tied to ChatGPT / Claude / Gemini labels in this window."
}: {
  service: ExtendedStatsPayload["breakdowns_from_events"]["service"];
  idleLabel?: string;
}) {
  const breakdown = [
    { name: "ChatGPT", value: service.chatgpt },
    { name: "Claude", value: service.claude },
    { name: "Gemini", value: service.gemini },
    { name: "Unknown", value: service.unknown }
  ];
  const total = breakdown.reduce((s, x) => s + x.value, 0);
  const pieData =
    total <= 0
      ? [{ name: "No activity yet", value: 1, empty: true }]
      : breakdown.filter((d) => d.value > 0).map((d) => ({ ...d, empty: false }));

  return (
    <div className="relative h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, bottom: 8 }}>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={0}
            outerRadius={88}
            label={
              pieData.every((row) => (row as { empty?: boolean }).empty)
                ? false
                : ({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
          >
            {pieData.map((cell, i) => (
              <Cell
                key={i}
                fill={(cell as { empty?: boolean }).empty ? "rgba(148,163,184,0.25)" : PIE_COLORS[i % PIE_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: "#18122b", border: "1px solid rgba(139,92,246,0.35)" }} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      {total <= 0 ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[11px] text-violet-100/85">
          {idleLabel}
        </p>
      ) : null}
    </div>
  );
}

export function StatisticsClient() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);
  const [granularity, setGranularity] = useState<"day" | "week">("day");
  const [stats, setStats] = useState<ExtendedStatsPayload | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");

  const placeholderStats = useMemo(
    () => buildPlaceholderExtendedStats(days, granularity),
    [days, granularity]
  );

  const displayStats = user ? stats ?? placeholderStats : null;

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const loadExtended = useCallback(async (current: User | null, d: number, g: "day" | "week") => {
    if (!current) {
      setStats(null);
      return;
    }
    setStatsLoading(true);
    setStatsError("");
    try {
      const token = await current.getIdToken(false);
      const res = await fetch(`/api/account/stats/extended?days=${encodeURIComponent(String(d))}&granularity=${g}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setStats(data as ExtendedStatsPayload);
    } catch (e) {
      setStatsError(String(e instanceof Error ? e.message : e));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || loading) return;
    void loadExtended(user, days, granularity);
  }, [user, loading, days, granularity, loadExtended]);

  const trendData = useMemo(() => {
    if (!displayStats?.timeline) return [];
    return displayStats.timeline.map((row) => ({
      ...row,
      label:
        displayStats.granularity === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket)
    }));
  }, [displayStats]);

  const hostTrendData = useMemo(() => {
    if (!displayStats?.host_passive_listener?.timeline) return [];
    const g = displayStats.granularity;
    return displayStats.host_passive_listener.timeline.map((row) => ({
      ...row,
      label: g === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket)
    }));
  }, [displayStats]);

  const composerChartData = useMemo(
    () =>
      trendData.map((row) => ({
        ...row,
        avg_composer_chars_plot: row.avg_composer_chars ?? 0,
        host_composer_chars_equiv_tokens_plot: row.host_composer_chars_equiv_tokens_estimate ?? 0
      })),
    [trendData]
  );

  const hostPassiveChartPlot = useMemo(
    () =>
      hostTrendData.map((row) => ({
        ...row,
        sends_plot: row.sends ?? 0,
        compose_snapshots_plot: row.composer_input_events ?? 0,
        avg_host_latency_plot: row.avg_host_response_latency_ms ?? 0,
        avg_assistant_visible_plot: row.avg_assistant_reply_chars_visible ?? 0
      })),
    [hostTrendData]
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 pb-24">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300/75">Reporting</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Prompt statistics</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-violet-200/70">
            Two timelines: Promptly billed rewrites versus passive listening on ChatGPT / Claude / Gemini — sends, coarse prompt
            length, scraped model picker labels, and estimated host turnaround time whenever you chat while signed into Promptly,
            including when you never tap Improve.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Link
            href="/account"
            className="rounded-lg border border-violet-500/40 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/10"
          >
            Back to account
          </Link>
          <button
            type="button"
            onClick={() => signOut(getFirebaseAuth()).catch(() => {})}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-violet-200 hover:bg-white/5 sm:text-right"
          >
            Sign out
          </button>
        </div>
      </div>

      {!user && !loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-12 text-center backdrop-blur-md">
          <p className="text-violet-100/90">Sign in on the account page to view statistics.</p>
          <Link
            href="/account"
            className="mt-4 inline-flex justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Go to account
          </Link>
        </div>
      ) : null}

      {user && displayStats ? (
        <>
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <span className="mr-2 self-center text-xs font-semibold uppercase tracking-wider text-violet-300/80">
                Range
              </span>
              {([7, 14, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    days === d ? "bg-violet-600 text-white" : "border border-white/15 text-violet-200 hover:bg-white/5"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-violet-200">
                Buckets:
                <select
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value === "week" ? "week" : "day")}
                  className="rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white"
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly (UTC)</option>
                </select>
              </label>
              <button
                type="button"
                disabled={statsLoading || !user}
                onClick={() => user && loadExtended(user, days, granularity)}
                className="rounded-lg border border-violet-500/45 px-3 py-1.5 text-sm text-violet-100 hover:bg-violet-500/15 disabled:opacity-50"
              >
                {statsLoading ? "Refreshing…" : "Refresh"}
              </button>
              {statsLoading ? (
                <span className="self-center text-xs text-violet-400/95">Applying latest server data…</span>
              ) : null}
            </div>
          </div>

          {statsError ? (
            <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{statsError}</div>
          ) : null}

          <>
            {displayStats.events_index_missing ? (
              <div className="mb-6 rounded-xl border border-sky-500/35 bg-sky-500/[0.12] px-4 py-3 text-xs leading-relaxed text-sky-50/95">
                Event charts read from <code className="rounded bg-black/35 px-1 text-[10px]">promptly_optimize_events</code> and need
                the Firestore composite index <code className="rounded bg-black/35 px-1 text-[10px]">uid</code>,{" "}
                <code className="rounded bg-black/35 px-1 text-[10px]">utcDay</code>,{" "}
                <code className="rounded bg-black/35 px-1 text-[10px]">__name__</code>. Run{" "}
                <code className="rounded bg-black/35 px-1 text-[10px]">firebase deploy --only firestore:indexes</code> using the repo
                file <code className="rounded bg-black/35 px-1 text-[10px]">firestore.indexes.json</code>, wait until the Firebase
                console shows the index as enabled, then click Refresh above. KPI totals below still reflect daily rollup data.
              </div>
            ) : null}

            {displayStats.host_passive_listener?.index_missing ? (
              <div className="mb-6 rounded-xl border border-sky-500/35 bg-sky-500/[0.12] px-4 py-3 text-xs leading-relaxed text-sky-50/95">
                Passive AI-site charts read from <code className="rounded bg-black/35 px-1 text-[10px]">promptly_host_llm_events</code>{" "}
                and need the composite index (<code className="rounded bg-black/35 px-1 text-[10px]">uid</code>,{" "}
                <code className="rounded bg-black/35 px-1 text-[10px]">utcDay</code>,{" "}
                <code className="rounded bg-black/35 px-1 text-[10px]">__name__</code>) deployed from{" "}
                <code className="rounded bg-black/35 px-1 text-[10px]">firestore.indexes.json</code>. Wait until Firebase marks it enabled,
                then refresh.
              </div>
            ) : null}

            {(displayStats.host_passive_listener?.likely_truncated ?? false) && (
              <div className="mb-6 rounded-xl border border-amber-400/35 bg-amber-500/[0.08] px-4 py-3 text-xs leading-relaxed text-amber-100/95">
                Some older passive-send rows may have been clipped (
                {(displayStats.host_passive_listener?.events_docs_in_query ?? 0).toLocaleString()} documents returned at the Firestore{" "}
                query cap). Narrow the date window if you want day-level fidelity for very heavy usage.
              </div>
            )}

            {(displayStats.events_in_range >= 4900 || displayStats.likely_truncated) && (
              <div className="mb-6 rounded-xl border border-amber-400/35 bg-amber-500/[0.08] px-4 py-3 text-xs leading-relaxed text-amber-100/95">
                Optimize event queries may omit older rows ({displayStats.events_in_range.toLocaleString()} rows loaded inside the Firestore{" "}
                cap). KPI totals remain driven by authoritative daily rollups—chart lines may prioritize recent Promptly reruns only.
              </div>
            )}

              <div className="mb-6 grid gap-4 md:grid-cols-4 lg:grid-cols-7">
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/80">
                    Promptly prompts (rollup)
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">{displayStats.rollup_daily.totals.prompts.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/80">Billed Promptly tokens</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{displayStats.rollup_daily.totals.tokens.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/80">Avg optimize latency</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {displayStats.rollup_daily.averages.response_time_ms > 0
                      ? `${(displayStats.rollup_daily.averages.response_time_ms / 1000).toFixed(2)} s`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/80">Optimize events queried</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{displayStats.events_in_range.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/35 bg-black/35 p-4 lg:col-span-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200/85">Typing snapshots</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {(displayStats.host_passive_listener?.composer_snapshots_attributed_in_range ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-500/25 bg-black/35 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200/85">Passive rows loaded</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {(displayStats.host_passive_listener?.events_docs_in_query ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200/90">Promptly optimize</div>

              <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-200/85">Tokens &amp; event volume</h2>
                <p className="mt-1 text-xs text-violet-300/65">
                  Left axis: Promptly billed tokens per bucket. Right axis: number of optimize events (may differ slightly from rollup
                  if events were capped).
                </p>
                <div className="mt-4 h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#bdb4fe" tick={{ fill: "#c4c0ff", fontSize: 11 }} />
                      <YAxis yAxisId="left" stroke="#a78bfa" tickFormatter={(v) => `${Math.round(Number(v))}`} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#7dd3fc"
                        tickFormatter={(v) => `${Math.round(Number(v))}`}
                      />
                      <Tooltip contentStyle={{ background: "#161018", border: "1px solid rgba(139,92,246,0.4)" }} />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="billed_promptly_tokens"
                        name="Billed Promptly tokens"
                        fill="#8b5cf6"
                        opacity={0.9}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="prompts"
                        name="Optimize events"
                        stroke="#bae6fd"
                        dot={false}
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-8 h-72 w-full">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-violet-300/75">
                    Host composer size (estimated)
                  </p>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={composerChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#bdb4fe" tick={{ fill: "#c4c0ff", fontSize: 11 }} />
                      <YAxis stroke="#fcd34d" />
                      <Tooltip contentStyle={{ background: "#161018", border: "1px solid rgba(250,204,21,0.35)" }} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="avg_composer_chars_plot"
                        name="Avg composer chars/event"
                        stroke="#fbbf24"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Bar
                        dataKey="host_composer_chars_equiv_tokens_plot"
                        name="Heuristic chars→tok (÷4 avg)"
                        fill="rgba(245,158,11,0.45)"
                        maxBarSize={28}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <div className="mb-10 grid gap-8 lg:grid-cols-2">
                <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-200/85">By host site</h2>
                  <p className="mt-1 text-xs text-violet-300/65">Measured from prompts where you ran Promptly in this browser window.</p>
                  <ServicePie
                    service={displayStats.breakdowns_from_events.service}
                    idleLabel="No optimize events yet where Promptly could tag the host site."
                  />
                </section>
                <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-200/85">By optimize mode</h2>
                  <p className="mt-1 text-xs text-violet-300/65">
                    Improve vs Auto vs Compose reflects how Promptly was invoked inside the extension.
                  </p>
                  <ModeChart modes={displayStats.breakdowns_from_events.mode} />
                </section>
              </div>

              <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-200/85">Detected UI model labels</h2>
                <p className="mt-2 text-xs text-violet-200/65">
                  Labels are scraped cautiously when available; grouping uses a normalized bucket. They can be wrong whenever the AI
                  site refreshes markup.
                </p>
                <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-[520px] w-full border-collapse text-left text-sm">
                    <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-violet-200/85">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Bucket</th>
                        <th className="px-4 py-3 font-semibold">Example label</th>
                        <th className="px-4 py-3 font-semibold">Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayStats.breakdowns_from_events.model_buckets.length ? (
                        displayStats.breakdowns_from_events.model_buckets.map((row) => (
                          <tr key={row.bucket} className="border-b border-white/[0.06] text-violet-50/95">
                            <td className="px-4 py-2 font-mono text-xs text-violet-200">{row.bucket}</td>
                            <td className="px-4 py-2 text-xs text-violet-100/95">{row.exemplar_label || "—"}</td>
                            <td className="px-4 py-2 tabular-nums">{row.prompts.toLocaleString()}</td>
                          </tr>
                        ))
                      ) : (
                        <tr className="text-violet-100/85">
                          <td className="border-b border-white/[0.06] px-4 py-3 font-mono text-xs text-violet-300">unknown</td>
                          <td className="border-b border-white/[0.06] px-4 py-3 text-xs text-violet-200/80">
                            Nothing recorded yet — after you optimize with the extension, detected host labels appear here when the site
                            exposes them.
                          </td>
                          <td className="border-b border-white/[0.06] px-4 py-3 tabular-nums text-violet-200/85">0</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="mb-3 mt-14 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/90">
                AI site activity (passive listener)
              </div>

              <div className="mb-6 rounded-xl border border-white/[0.12] bg-black/30 px-4 py-3 text-xs leading-relaxed text-violet-100/92">
                <p className="font-semibold text-emerald-100/95">Verify passive prompt counts</p>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-violet-200/[0.92]">
                  <li>
                    <strong className="text-violet-100/95">Extension app URL:</strong> in Promptly Options, the backend URL must match this site&apos;s host
                    (e.g. <code className="text-[10px] text-emerald-200/90">https://…”your-project”.vercel.app</code>). The extension only allows prompts-labs, localhost,
                    and <span className="whitespace-nowrap">*.vercel.app</span> — mismatched deployments show empty stats until the URL aligns.
                  </li>
                  <li>
                    <strong className="text-violet-100/95">Same account:</strong> sign into Promptly from the sidebar on ChatGPT / Claude / Gemini using the{" "}
                    <em>same</em> identity you use on this statistics page (<code className="text-[10px]">uid</code> must match in Firestore).
                  </li>
                  <li>
                    <strong className="text-violet-100/95">Indexes:</strong> clear the yellow/blue banners above (
                    <code className="text-[10px]">promptly_host_llm_events</code> composite) — otherwise passive queries return zero documents.
                  </li>
                  <li>
                    <strong className="text-violet-100/95">Smoke test:</strong> run one <strong className="text-violet-100/95">Improve</strong>; each successful optimize mirrors a row (
                    <code className="text-[10px]">source optimize_api</code>) into passive totals even when the page never emits a sniffed “send.”
                  </li>
                  <li>
                    <strong className="text-violet-100/95">Native chats only:</strong> trusted typing or send in the real composer increments counts; reload the extension
                    after updates (manifest version bumped).
                  </li>
                </ul>
              </div>

              <section className="mb-10 rounded-2xl border border-emerald-500/35 bg-emerald-950/[0.12] p-6 backdrop-blur-md">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-100/95">Composer typing, sends &amp; reply feel</h2>
                <p className="mt-1 text-xs text-emerald-100/70">
                  Stacked bars: debounced samples while you type in the native prompt box, confirmed sends sniffed from the page, and each successful
                  Promptly Improve/Generate mirrored from our API into this feed. The line is average time until replies look idle on native sends (
                  Optimize-mirror rows contribute Promptly API completion time instead).
                </p>
                <div className="mt-4 h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={hostPassiveChartPlot}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#a7f3d0" tick={{ fill: "#d1fae5", fontSize: 11 }} />
                      <YAxis
                        yAxisId="count"
                        stroke="#34d399"
                        tickFormatter={(v) => `${Math.round(Number(v))}`}
                      />
                      <YAxis
                        yAxisId="ms"
                        orientation="right"
                        stroke="#6ee7b7"
                        tickFormatter={(v) => `${(Number(v) / 1000).toFixed(1)}s`}
                      />
                      <Tooltip
                        contentStyle={{ background: "#052e1b", border: "1px solid rgba(52,211,153,0.45)" }}
                        formatter={(value, name) => {
                          const n = Number(value);
                          const nm = String(name);
                          if (nm.includes("reply settle")) return [`${Math.round(n / 100) / 10}s`, name];
                          return [n, name];
                        }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="count"
                        stackId="activity"
                        dataKey="compose_snapshots_plot"
                        name="Typing samples"
                        fill="rgba(110,231,183,0.55)"
                        maxBarSize={40}
                      />
                      <Bar
                        yAxisId="count"
                        stackId="activity"
                        dataKey="sends_plot"
                        name="Sends (+ Improve mirrored)"
                        fill="rgba(16,185,129,0.9)"
                        maxBarSize={40}
                      />
                      <Line
                        yAxisId="ms"
                        type="monotone"
                        dataKey="avg_host_latency_plot"
                        name="Avg reply settle (ms)"
                        stroke="#fef08a"
                        dot={false}
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-8 h-64 w-full">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-100/85">
                    Avg visible assistant reply size (chars) per send event
                  </p>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={hostPassiveChartPlot}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#a7f3d0" tick={{ fill: "#d1fae5", fontSize: 10 }} />
                      <YAxis stroke="#fde68a" tickFormatter={(v) => `${Math.round(Number(v))}`} />
                      <Tooltip contentStyle={{ background: "#052e1b", border: "1px solid rgba(52,211,153,0.45)" }} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="avg_assistant_visible_plot"
                        name="Avg reply chars (DOM scrape)"
                        stroke="#fde047"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-8 h-72 w-full">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-100/85">
                    Average composer length across all passive samples (typing + sends)
                  </p>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={hostTrendData.map((row) => ({
                        label: row.label,
                        chars: Math.round(Number(row.avg_composer_chars ?? 0) * 10) / 10
                      }))}
                      margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="label" stroke="#a7f3d0" tick={{ fill: "#d1fae5", fontSize: 10 }} />
                      <YAxis stroke="#34d399" />
                      <Tooltip contentStyle={{ background: "#052e1b", border: "1px solid rgba(52,211,153,0.45)" }} />
                      <Legend />
                      <Bar dataKey="chars" name="Avg chars / sample" fill="rgba(45,212,191,0.55)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <div className="mb-10 grid gap-8 lg:grid-cols-2">
                <section className="rounded-2xl border border-emerald-500/30 bg-white/[0.04] p-6 backdrop-blur-md">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-100/90">Passive activity by site</h2>
                  <p className="mt-1 text-xs text-violet-300/65">
                    Counts composer typing snapshots plus sends while you browse each host with Promptly signed in.
                  </p>
                  <ServicePie
                    service={
                      displayStats.host_passive_listener?.breakdown_service ?? {
                        chatgpt: 0,
                        claude: 0,
                        gemini: 0,
                        unknown: 0
                      }
                    }
                    idleLabel="No passive activity yet — type or send while signed into Promptly on ChatGPT / Claude / Gemini."
                  />
                </section>
                <section className="rounded-2xl border border-emerald-500/25 bg-black/35 p-6 backdrop-blur-md">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-100/85">Passive notes</h2>
                  <p className="mt-3 text-xs leading-relaxed text-violet-100/85">
                    Listener samples trusted typing in the real composer and confirmed sends—no prompt bodies uploaded. Events batch out roughly every
                    few seconds while you are signed into Promptly on a supported chat host. Streams are inferred from the DOM: latency settles when
                    streaming controls disappear and assistant text briefly stops growing.
                  </p>
                </section>
              </div>

              <section className="mb-10 rounded-2xl border border-emerald-500/30 bg-white/[0.04] p-6 backdrop-blur-md">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-100/90">Model labels on passive activity</h2>
                <p className="mt-2 text-xs text-violet-200/65">
                  Scraped picker labels from the optimize path, attributed to whichever activity row carried them (mostly sends—typing snapshots omit
                  the label when nothing new was scraped).
                </p>
                <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-[520px] w-full border-collapse text-left text-sm">
                    <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-emerald-100/85">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Bucket</th>
                        <th className="px-4 py-3 font-semibold">Example label</th>
                        <th className="px-4 py-3 font-semibold">Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(displayStats.host_passive_listener?.model_buckets ?? []).length ? (
                        displayStats.host_passive_listener!.model_buckets.map((row) => (
                          <tr key={row.bucket} className="border-b border-white/[0.06] text-violet-50/95">
                            <td className="px-4 py-2 font-mono text-xs text-emerald-200">{row.bucket}</td>
                            <td className="px-4 py-2 text-xs text-violet-100/95">{row.exemplar_label || "—"}</td>
                            <td className="px-4 py-2 tabular-nums">{row.events.toLocaleString()}</td>
                          </tr>
                        ))
                      ) : (
                        <tr className="text-violet-100/85">
                          <td className="border-b border-white/[0.06] px-4 py-3 font-mono text-xs text-violet-300">unknown</td>
                          <td className="border-b border-white/[0.06] px-4 py-3 text-xs text-violet-200/80">
                            Passive rows will populate after you chat on a supported site—model labels mirror what the picker shows when Promptly sees
                            a send attempt.
                          </td>
                          <td className="border-b border-white/[0.06] px-4 py-3 tabular-nums text-violet-200/85">0</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-white/[0.08] bg-black/30 p-5 text-xs leading-relaxed text-violet-200/65">
                <ul className="list-disc space-y-2 pl-5">
                  {displayStats.footnotes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            </>
        </>
      ) : null}
    </div>
  );
}
