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
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell
} from "recharts";

/** OpenAI system green (distinct from Gemini blue). ChatGPT visuals often skew turquoise but this reads clearly on dark UI. */
const COLOR_CHATGPT = "#10a37f";
/** Anthropic Claude accent (warm coral-orange). */
const COLOR_CLAUDE = "#cc785c";
/** Google Gemini / primary blue reference. */
const COLOR_GEMINI = "#4285f4";
const COLOR_UNKNOWN = "#64748b";
/** Promptly accent for “Improve / rewrite” bars. */
const COLOR_PROMPTLY = "#ab68ff";
const COLOR_NATIVE_WEB = "#22d3ee";

type PromptlySvc = "chatgpt" | "claude" | "gemini" | "unknown";

type HostPassiveLite = {
  events_docs_in_query: number;
  native_web_sends: number;
  mirror_rows_synced_from_optimize: number;
  composer_snapshots: number;
  sends_attributed_in_range: number;
  index_missing: boolean;
  query_newest_first?: boolean;
  likely_truncated: boolean;
};

type CombinedTotals = {
  prompts_estimate: number;
  prompts_native_only_observed_sends: number;
  prompts_with_promptly_optimize_events: number;
  prompts_chatgpt_surface: number;
  prompts_claude_surface: number;
  prompts_gemini_surface: number;
  prompts_unknown_surface: number;
  mirror_rows_synced_to_host_telemetry: number;
  promptly_share_of_estimated_prompts_percent: number | null;
};

type CombinedPromptBucket = {
  bucket: string;
  prompts_chatgpt: number;
  prompts_claude: number;
  prompts_gemini: number;
  prompts_unknown: number;
  prompts_total_bucket: number;
  prompts_native_only_chatgpt: number;
  prompts_native_only_claude: number;
  prompts_native_only_gemini: number;
  prompts_native_only_unknown: number;
  prompts_with_promptly_chatgpt: number;
  prompts_with_promptly_claude: number;
  prompts_with_promptly_gemini: number;
  prompts_with_promptly_unknown: number;
};

type LatencyAiRow = {
  service_key: PromptlySvc;
  prompted_promptly_avg_rewrite_ms: number | null;
  native_avg_host_roundtrip_ms: number | null;
  promptly_samples: number;
  native_latency_samples: number;
  prompts_with_promptly: number;
  prompts_native_web: number;
};

type ValueInsights = {
  billed_promptly_tokens_sum_events: number;
  rollup_daily_prompts_hint: number;
  optimize_avg_composer_chars: number | null;
  native_web_send_avg_composer_chars: number | null;
  composer_snapshot_count_illustrative: number;
  estimated_drafting_active_minutes_illustrative: number;
  heuristic_native_input_tokens_approx_from_telemetry_chars: number | null;
  native_web_sends: number;
  optimize_events_queried: number;
};

type ExtendedStatsPayload = {
  ok: true;
  range_days: number;
  granularity: "day" | "week";
  events_in_range: number;
  likely_truncated: boolean;
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
  combined_prompt_timeline: CombinedPromptBucket[];
  combined_totals: CombinedTotals;
  latency_comparison_ai: LatencyAiRow[];
  value_insights: ValueInsights;
  breakdowns_from_events: {
    service: Record<PromptlySvc, number>;
    mode: { auto: number; improve: number; generate: number };
    model_buckets: Array<{ bucket: string; exemplar_label: string | null; prompts: number }>;
  };
  host_passive_listener: HostPassiveLite;
  footnotes: string[];
};

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

function emptyCombinedBucket(bucket: string): CombinedPromptBucket {
  return {
    bucket,
    prompts_chatgpt: 0,
    prompts_claude: 0,
    prompts_gemini: 0,
    prompts_unknown: 0,
    prompts_total_bucket: 0,
    prompts_native_only_chatgpt: 0,
    prompts_native_only_claude: 0,
    prompts_native_only_gemini: 0,
    prompts_native_only_unknown: 0,
    prompts_with_promptly_chatgpt: 0,
    prompts_with_promptly_claude: 0,
    prompts_with_promptly_gemini: 0,
    prompts_with_promptly_unknown: 0
  };
}

function emptyHostPassive(): HostPassiveLite {
  return {
    events_docs_in_query: 0,
    native_web_sends: 0,
    mirror_rows_synced_from_optimize: 0,
    composer_snapshots: 0,
    sends_attributed_in_range: 0,
    index_missing: false,
    query_newest_first: false,
    likely_truncated: false
  };
}

function buildPlaceholderExtendedStats(days: number, granularity: "day" | "week"): ExtendedStatsPayload {
  const range_days = Math.max(1, Math.min(90, Math.floor(days)));
  const recentDays = getRecentDaysClient(range_days);
  let tl: ExtendedStatsPayload["timeline"];
  let cpt: CombinedPromptBucket[];
  if (granularity === "week") {
    const weeks = new Map<string, (typeof tl)[number]>();
    const cweek = new Map<string, CombinedPromptBucket>();
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
      if (!cweek.has(wk)) {
        const z = emptyCombinedBucket(wk);
        cweek.set(wk, z);
      }
    }
    tl = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, row]) => row);
    cpt = [...cweek.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, row]) => row);
  } else {
    tl = recentDays.map((bucket) => ({
      bucket,
      prompts: 0,
      billed_promptly_tokens: 0,
      avg_composer_chars: null,
      host_composer_chars_equiv_tokens_estimate: null,
      avg_optimize_latency_ms: null
    }));
    cpt = recentDays.map((bucket) => emptyCombinedBucket(bucket));
  }

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
      averages: { prompts_per_active_day: 0, tokens_per_prompt: 0, response_time_ms: 0 }
    },
    timeline: tl,
    combined_prompt_timeline: cpt,
    combined_totals: {
      prompts_estimate: 0,
      prompts_native_only_observed_sends: 0,
      prompts_with_promptly_optimize_events: 0,
      prompts_chatgpt_surface: 0,
      prompts_claude_surface: 0,
      prompts_gemini_surface: 0,
      prompts_unknown_surface: 0,
      mirror_rows_synced_to_host_telemetry: 0,
      promptly_share_of_estimated_prompts_percent: null
    },
    latency_comparison_ai: (["chatgpt", "claude", "gemini", "unknown"] as const).map((service_key) => ({
      service_key,
      prompted_promptly_avg_rewrite_ms: null,
      native_avg_host_roundtrip_ms: null,
      promptly_samples: 0,
      native_latency_samples: 0,
      prompts_with_promptly: 0,
      prompts_native_web: 0
    })),
    value_insights: {
      billed_promptly_tokens_sum_events: 0,
      rollup_daily_prompts_hint: 0,
      optimize_avg_composer_chars: null,
      native_web_send_avg_composer_chars: null,
      composer_snapshot_count_illustrative: 0,
      estimated_drafting_active_minutes_illustrative: 0,
      heuristic_native_input_tokens_approx_from_telemetry_chars: null,
      native_web_sends: 0,
      optimize_events_queried: 0
    },
    breakdowns_from_events: {
      service: { chatgpt: 0, claude: 0, gemini: 0, unknown: 0 },
      mode: { auto: 0, improve: 0, generate: 0 },
      model_buckets: []
    },
    host_passive_listener: emptyHostPassive(),
    footnotes: []
  };
}

function formatShortDay(isoYmd: string) {
  if (!isoYmd || isoYmd.length < 10) {
    return isoYmd || "—";
  }
  const tail = isoYmd.slice(5);
  return tail.replace("-", "/");
}

function svcLabel(key: PromptlySvc): string {
  if (key === "chatgpt") return "ChatGPT";
  if (key === "claude") return "Claude";
  if (key === "gemini") return "Gemini";
  return "Other / unknown UI";
}

function ModeMiniChart({
  modes
}: {
  modes: ExtendedStatsPayload["breakdowns_from_events"]["mode"];
}) {
  const data = [
    { name: "Auto", prompts: modes.auto },
    { name: "Improve", prompts: modes.improve },
    { name: "Generate", prompts: modes.generate }
  ];
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis type="number" stroke="#c4b5fd" />
          <YAxis dataKey="name" type="category" width={92} stroke="#c4b5fd" tick={{ fill: "#e9e5ff", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#161018", border: "1px solid rgba(139,92,246,0.4)" }} />
          <Bar dataKey="prompts" name="Runs" radius={[0, 6, 6, 0]} fill="#a78bfa" />
        </BarChart>
      </ResponsiveContainer>
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

  const stackedTimeline = useMemo(() => {
    if (!displayStats?.combined_prompt_timeline) return [];
    const g = displayStats.granularity;
    return displayStats.combined_prompt_timeline.map((row) => ({
      ...row,
      label: g === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket)
    }));
  }, [displayStats]);

  const latencyChartRows = useMemo(() => {
    if (!displayStats?.latency_comparison_ai) return [];
    return displayStats.latency_comparison_ai
      .filter(
        (r) =>
          r.service_key !== "unknown" ||
          r.promptly_samples > 0 ||
          r.native_latency_samples > 0 ||
          r.prompts_native_web > 0 ||
          r.prompts_with_promptly > 0
      )
      .map((r) => ({
        ai: svcLabel(r.service_key),
        key: r.service_key,
        promptly_rewrite_s:
          typeof r.prompted_promptly_avg_rewrite_ms === "number"
            ? Math.round((r.prompted_promptly_avg_rewrite_ms / 1000) * 10) / 10
            : 0,
        native_roundtrip_s:
          typeof r.native_avg_host_roundtrip_ms === "number"
            ? Math.round((r.native_avg_host_roundtrip_ms / 1000) * 10) / 10
            : 0,
        promptly_missing: !(typeof r.prompted_promptly_avg_rewrite_ms === "number"),
        native_missing: !(typeof r.native_avg_host_roundtrip_ms === "number")
      }));
  }, [displayStats]);

  const pathwayCompareData = useMemo(() => {
    if (!displayStats) return [];
    const rows = [
      {
        pathway: "With Promptly (Improve / Generate)",
        ChatGPT: displayStats.latency_comparison_ai.find((x) => x.service_key === "chatgpt")?.prompts_with_promptly ?? 0,
        Claude: displayStats.latency_comparison_ai.find((x) => x.service_key === "claude")?.prompts_with_promptly ?? 0,
        Gemini: displayStats.latency_comparison_ai.find((x) => x.service_key === "gemini")?.prompts_with_promptly ?? 0
      },
      {
        pathway: "Native web send only",
        ChatGPT: displayStats.latency_comparison_ai.find((x) => x.service_key === "chatgpt")?.prompts_native_web ?? 0,
        Claude: displayStats.latency_comparison_ai.find((x) => x.service_key === "claude")?.prompts_native_web ?? 0,
        Gemini: displayStats.latency_comparison_ai.find((x) => x.service_key === "gemini")?.prompts_native_web ?? 0
      }
    ];
    const nonZero =
      rows[0].ChatGPT +
        rows[0].Claude +
        rows[0].Gemini +
        rows[1].ChatGPT +
        rows[1].Claude +
        rows[1].Gemini >
      0;
    return nonZero ? rows : [];
  }, [displayStats]);

  const composerCompareData = useMemo(() => {
    if (!displayStats?.value_insights) return [];
    const p = displayStats.value_insights.optimize_avg_composer_chars;
    const n = displayStats.value_insights.native_web_send_avg_composer_chars;
    if (p === null && n === null) return [];
    return [
      {
        label: "Observed drafts (Improve path)",
        chars: typeof p === "number" ? p : 0,
        muted: !(typeof p === "number")
      },
      { label: "Observed drafts (native send)", chars: typeof n === "number" ? n : 0, muted: !(typeof n === "number") }
    ];
  }, [displayStats]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 pb-24">
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300/75">Your usage snapshot</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Prompt statistics</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-violet-200/72">
            A single storyline: prompts you routed through Promptly&nbsp;Improve or Generate versus everything you typed and sent straight in
            ChatGPT, Claude, or Gemini. Nothing here stores full prompts—only aggregates and scraped UI hints.
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
              <span className="mr-2 self-center text-xs font-semibold uppercase tracking-wider text-violet-300/80">Range</span>
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
                <span className="self-center text-xs text-violet-400/95">Pulling aggregates…</span>
              ) : null}
            </div>
          </div>

          {statsError ? (
            <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{statsError}</div>
          ) : null}

          {displayStats.events_index_missing ? (
            <div className="mb-6 rounded-xl border border-sky-500/35 bg-sky-500/[0.12] px-4 py-3 text-xs leading-relaxed text-sky-50/95">
              Promptly Optimize analytics need the composite index on <code className="rounded bg-black/35 px-1 text-[10px]">promptly_optimize_events</code>{" "}
              (<code className="text-[10px]">uid</code>, <code className="text-[10px]">utcDay</code>,{" "}
              <code className="text-[10px]">__name__</code>). Deploy <code className="text-[10px]">firestore.indexes.json</code> and refresh—the overview will
              still show native-send estimates when passive telemetry succeeds.
            </div>
          ) : null}

          {displayStats.host_passive_listener.index_missing ? (
            <div className="mb-6 rounded-xl border border-sky-500/35 bg-sky-500/[0.12] px-4 py-3 text-xs leading-relaxed text-sky-50/95">
              Native chat totals need composites on{" "}
              <code className="rounded bg-black/35 px-1 text-[10px]">promptly_host_llm_events</code>. Deploy Firebase indexes before deduplicated summaries
              can load.
            </div>
          ) : null}

          {displayStats.host_passive_listener &&
          !displayStats.host_passive_listener.index_missing &&
          displayStats.host_passive_listener.query_newest_first === false ? (
            <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.12] px-4 py-3 text-xs leading-relaxed text-amber-50/95">
              Host telemetry defaults to ascending Firestore pagination—high-volume histories may truncate the freshest days unless the descending index
              in <code className="text-[10px]">firestore.indexes.json</code> is deployed.
            </div>
          ) : null}

          {(displayStats.likely_truncated || displayStats.host_passive_listener.likely_truncated) && (
            <div className="mb-6 rounded-xl border border-amber-400/35 bg-amber-500/[0.08] px-4 py-3 text-xs leading-relaxed text-amber-50/95">
              Some aggregates may omit early rows ({displayStats.events_in_range.toLocaleString()} Optimize events +{" "}
              {displayStats.host_passive_listener.events_docs_in_query.toLocaleString()} host docs loaded). Narrow the date range when you near the 5&nbsp;000
              document cap each query.
            </div>
          )}

          {/* Hero overview */}
          <section className="mb-12 rounded-[28px] border border-white/[0.1] bg-gradient-to-br from-violet-950/40 via-slate-950/40 to-cyan-950/30 p-8 backdrop-blur-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-200/85">Estimated prompt volume</p>
            <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm text-white/70">Tracked actions • last {displayStats.range_days} UTC days · {displayStats.granularity} buckets</p>
                <p className="mt-2 text-5xl font-semibold tracking-tight text-white">
                  {displayStats.combined_totals.prompts_estimate.toLocaleString()}
                </p>
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-violet-100/75">
                  Adds Improve/Generate runs (counted once) plus native sends observed without double-counting the mirrored Optimize rows streamed into
                  host telemetry.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div className="rounded-2xl border border-white/[0.12] bg-black/35 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: COLOR_CHATGPT }}>
                    ChatGPT
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">{displayStats.combined_totals.prompts_chatgpt_surface.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.12] bg-black/35 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: COLOR_CLAUDE }}>
                    Claude
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">{displayStats.combined_totals.prompts_claude_surface.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.12] bg-black/35 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: COLOR_GEMINI }}>
                    Gemini
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">{displayStats.combined_totals.prompts_gemini_surface.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.12] bg-black/35 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-300">Promptly assist</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {displayStats.combined_totals.promptly_share_of_estimated_prompts_percent != null ? (
                      <>{`${displayStats.combined_totals.promptly_share_of_estimated_prompts_percent}%`}</>
                    ) : (
                      "—"
                    )}
                  </p>
                  <p className="text-[10px] text-white/50">share of totals</p>
                </div>
              </div>
            </div>

            <div className="mt-10 h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stackedTimeline} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" stroke="#dbd4ff" tick={{ fill: "#e9e7ff", fontSize: 10 }} />
                  <YAxis stroke="#c4b5fd" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0c0618", border: "1px solid rgba(148,163,253,0.35)" }}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Legend />
                  <Bar dataKey="prompts_gemini" name="Gemini prompts" stackId="stack" fill={COLOR_GEMINI} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="prompts_claude" name="Claude prompts" stackId="stack" fill={COLOR_CLAUDE} />
                  <Bar dataKey="prompts_chatgpt" name="ChatGPT prompts" stackId="stack" fill={COLOR_CHATGPT} />
                  <Bar dataKey="prompts_unknown" name="Other / tagging gap" stackId="stack" fill={COLOR_UNKNOWN} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="mt-6 text-[11px] leading-relaxed text-white/55">
              Colors cue the host surface: Gemini blue (#4285F4 · Google brand reference), Claude coral (#CC785C · Anthropic-adjacent), ChatGPT teal (#10A37F
              · OpenAI brand reference).
            </p>
          </section>

          {/* Value story */}
          <section className="mb-12">
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-200/90">What Promptly is doing</h2>
            <p className="mt-1 text-xs text-violet-200/65">
              Token math is illustrative; billing truth remains your Promptly quotas and daily rollups—not third-party metering.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.08] px-5 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-violet-100/85">Billing tokens routed through Promptly</p>
                <p className="mt-3 text-2xl font-semibold text-white">{displayStats.value_insights.billed_promptly_tokens_sum_events.toLocaleString()}</p>
                <p className="mt-2 text-[11px] text-violet-50/65">Measured on Improve/Generate events (OpenAI-backed rewrites).</p>
              </div>
              <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.07] px-5 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/85">Heuristic tokens you typed native</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {displayStats.value_insights.heuristic_native_input_tokens_approx_from_telemetry_chars != null
                    ? `${displayStats.value_insights.heuristic_native_input_tokens_approx_from_telemetry_chars.toLocaleString()} Σ`
                    : "—"}
                </p>
                <p className="mt-2 text-[11px] text-cyan-50/65">
                  Sum of scraped composer telemetry on native sends (÷4 chars/token heuristic)—not Gemini/Claude/ChatGPT billed usage.
                </p>
              </div>
              <div className="rounded-2xl border border-purple-400/35 bg-purple-500/[0.08] px-5 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-purple-50/95">Typing engagement (estimated)</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  ~{displayStats.value_insights.estimated_drafting_active_minutes_illustrative.toLocaleString()} min
                </p>
                <p className="mt-2 text-[11px] text-purple-100/65">
                  {displayStats.value_insights.composer_snapshot_count_illustrative.toLocaleString()} snapshots × ~12s illustrative cadence drawn from Promptly&apos;s composer debounce knobs.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/30 px-5 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-100/85">Authoritative rollup hint</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {displayStats.value_insights.rollup_daily_prompts_hint.toLocaleString()}
                </p>
                <p className="mt-2 text-[11px] text-emerald-50/65">Recorded Improve runs (may differ slightly from queried events).</p>
              </div>
            </div>
          </section>

          {/*Latency */}
          <section className="mb-12 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-200/95">Rewrite vs native turnaround time</h2>
            <p className="mt-2 text-xs text-violet-200/65">
              Promptly bar = billed rewrite turnaround from the sidebar. Native bar ≈ scraped “reply settles” cues on unattended sends —
              heuristic, not authoritative vendor latency.
            </p>
            <div className="mt-6 h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={latencyChartRows} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="ai" stroke="#c4c5fc" tick={{ fill: "#e9e7ff", fontSize: 11 }} />
                  <YAxis stroke="#c4c5fc" tick={{ fill: "#e9e7ff" }} label={{ value: "Seconds (avg)", angle: -90, position: "insideLeft", fill: "#bfb7ff" }} />
                  <Tooltip contentStyle={{ background: "#090514", border: "1px solid rgba(148,163,253,0.35)" }} />
                  <Legend />
                  <Bar dataKey="promptly_rewrite_s" name="Promptly rewrite (avg s)" radius={[8, 8, 0, 0]} fill={COLOR_PROMPTLY}>
                    {latencyChartRows.map((entry, idx) => (
                      <Cell key={`p-${idx}`} fillOpacity={entry.promptly_missing ? 0.2 : 0.95} />
                    ))}
                  </Bar>
                  <Bar dataKey="native_roundtrip_s" name="Native host UI (avg s)" radius={[8, 8, 0, 0]} fill={COLOR_NATIVE_WEB}>
                    {latencyChartRows.map((entry, idx) => (
                      <Cell key={`n-${idx}`} fillOpacity={entry.native_missing ? 0.2 : 0.95} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Composer length */}
          {composerCompareData.length ? (
            <section className="mb-12 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-200/95">Draft verbosity</h2>
              <p className="mt-2 text-xs text-violet-200/65">
                Telemetry-only averages pulled from scraped composer snapshots—helps explain why rewriting with Promptly can reduce upstream token stress.
              </p>
              <div className="mt-6 h-64 w-full max-w-xl">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={composerCompareData} layout="vertical" margin={{ left: 32, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" stroke="#c4c5fc" />
                    <YAxis dataKey="label" type="category" width={148} stroke="#c4c5fc" tick={{ fill: "#f5f4ff", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#090514", border: "1px solid rgba(236,232,255,0.2)" }} />
                    <Bar dataKey="chars" radius={[0, 6, 6, 0]} fill="#c084fc">
                      {composerCompareData.map((c, idx) => (
                        <Cell key={idx} fillOpacity={c.muted ? 0.35 : 0.95} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          {/* Promptly pathway compare */}
          {pathwayCompareData.length ? (
            <section className="mb-12 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-200/95">Pathway breakdown</h2>
              <p className="mt-2 text-xs text-violet-200/65">Stack Promptly-mediated runs against native submits for ChatGPT vs Claude vs Gemini.</p>
              <div className="mt-6 h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pathwayCompareData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="pathway" stroke="#bfb7ff" tick={{ fill: "#f9f8ff", fontSize: 10 }} />
                    <YAxis stroke="#bfb7ff" allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#070212", border: "1px solid rgba(251,251,254,0.12)" }} />
                    <Legend />
                    <Bar dataKey="Gemini" name="Gemini" stackId="a" fill={COLOR_GEMINI} />
                    <Bar dataKey="Claude" name="Claude" stackId="a" fill={COLOR_CLAUDE} />
                    <Bar dataKey="ChatGPT" name="ChatGPT" stackId="a" fill={COLOR_CHATGPT} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          {/* Supporting technical */}
          <section className="mb-12 grid gap-10 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.1] bg-black/35 p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200/95">Improve mode mixes</h3>
              <p className="mt-1 text-[11px] text-violet-200/62">Shows how Promptly was invoked whenever telemetry tagged the Optimize path.</p>
              <ModeMiniChart modes={displayStats.breakdowns_from_events.mode} />
            </div>
            <div className="rounded-2xl border border-white/[0.1] bg-black/35 p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200/95">Billed Promptly tokens (bucket-level)</h3>
              <p className="mt-1 text-[11px] text-violet-200/62">Roughly parallels how expensive each Improve window was—not host AI metering.</p>
              <div className="mt-4 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={displayStats.timeline.map((row) => ({
                      ...row,
                      label: displayStats.granularity === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket)
                    }))}
                    margin={{ bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" stroke="#c4c5fc" tick={{ fill: "#f4f4ff", fontSize: 10 }} />
                    <YAxis stroke="#c4c5fc" />
                    <Tooltip contentStyle={{ background: "#06030f", border: "1px solid rgba(196,181,253,0.35)" }} />
                    <Bar dataKey="billed_promptly_tokens" fill="#9333ea" name="Promptly billed tokens / bucket" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="mb-12 rounded-2xl border border-white/[0.1] bg-black/35 p-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200/95">Scraped model buckets (Improve path)</h3>
            <p className="mt-2 text-[11px] text-violet-200/62">
              Host UI labels when available—can drift whenever chat providers redesign their pickers.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-[520px] w-full border-collapse text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wide text-violet-100/85">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Bucket</th>
                    <th className="px-4 py-2 font-semibold">Example label</th>
                    <th className="px-4 py-2 font-semibold">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStats.breakdowns_from_events.model_buckets.length ? (
                    displayStats.breakdowns_from_events.model_buckets.map((row) => (
                      <tr key={row.bucket} className="border-b border-white/[0.06] text-violet-50/95">
                        <td className="px-4 py-2 font-mono text-xs text-violet-200">{row.bucket}</td>
                        <td className="px-4 py-2 text-xs">{row.exemplar_label || "—"}</td>
                        <td className="px-4 py-2 tabular-nums">{row.prompts.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="text-violet-50/85">
                      <td colSpan={3} className="px-4 py-3 text-xs italic">
                        After you Optimize with Promptly attached, detected host labels accumulate here whenever the picker exposes readable text.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="rounded-2xl border border-white/[0.06] bg-black/25 p-5 text-[11px] leading-relaxed text-violet-200/70">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="font-semibold text-white/90">Native sends:</span>{" "}
                {displayStats.value_insights.native_web_sends.toLocaleString()}
              </p>
              <p>
                <span className="font-semibold text-white/90">Optimize events queried:</span>{" "}
                {displayStats.value_insights.optimize_events_queried.toLocaleString()}
              </p>
              <p>
                <span className="font-semibold text-white/90">Mirror rows synced:</span>{" "}
                {displayStats.combined_totals.mirror_rows_synced_to_host_telemetry.toLocaleString()}
              </p>
              <p>
                <span className="font-semibold text-white/90">Authoritative rollup tokens:</span>{" "}
                {displayStats.rollup_daily.totals.tokens.toLocaleString()}
              </p>
            </div>
            {displayStats.footnotes.length ? (
              <ul className="mt-4 list-disc space-y-2 pl-5">
                {displayStats.footnotes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </footer>
        </>
      ) : null}
    </div>
  );
}
