"use client";

import { getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Link from "next/link";
import type { User } from "firebase/auth";
import { AutoDismissNoticeBar } from "@/components/ui/AutoDismissNoticeBar";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
/** Date / bucket labels on chart X axes (cream card backgrounds). */
const CHART_X_DATE_TICK = { fill: "#2a2a2a", fontSize: 11, fontWeight: 600 as const };
const CHART_X_DATE_STROKE = "#525252";
/** Derived score emphasis (readable on cream cards). */
const COLOR_SCORE_GREEN = "#15803d";

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
  native_sends_observed?: number;
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
  avg_draft_duration_ms: number | null;
  avg_draft_active_ms: number | null;
  promptly_samples: number;
  native_latency_samples: number;
  draft_timing_samples: number;
  prompts_with_promptly: number;
  prompts_native_web: number;
};

const MODEL_CHART_ORDER: PromptlySvc[] = ["gemini", "claude", "chatgpt", "unknown"];

type PreImproveWordBucket = {
  bucket: string;
  avg_words_before: number | null;
  avg_words_after: number | null;
  samples: number;
  samples_after: number;
};

type ValueInsights = {
  billed_promptly_tokens_sum_events: number;
  rollup_daily_prompts_hint: number;
  optimize_avg_composer_chars: number | null;
  optimize_avg_pre_improve_words: number | null;
  optimize_avg_post_improve_words: number | null;
  pre_improve_word_change_percent: number | null;
  pre_improve_word_samples: number;
  post_improve_word_samples: number;
  native_web_send_avg_composer_chars: number | null;
  composer_snapshot_count_illustrative: number;
  estimated_drafting_active_minutes_illustrative: number;
  measured_drafting_active_minutes: number | null;
  measured_drafting_wall_minutes: number | null;
  measured_waiting_for_ai_minutes: number | null;
  heuristic_native_input_tokens_approx_from_telemetry_chars: number | null;
  native_web_sends: number;
  optimize_events_queried: number;
};

type TimeBalanceBucket = {
  bucket: string;
  avg_draft_minutes: number;
  avg_waiting_minutes: number;
  native_sends_with_draft: number;
  native_sends_with_latency: number;
};

type TimeBalanceTotals = {
  draft_active_ms: number;
  draft_wall_ms: number;
  waiting_for_ai_ms: number;
  draft_active_samples: number;
  draft_wall_samples: number;
  waiting_samples: number;
  draft_active_minutes: number | null;
  draft_wall_minutes: number | null;
  waiting_for_ai_minutes: number | null;
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
  pre_improve_word_timeline: PreImproveWordBucket[];
  combined_prompt_timeline: CombinedPromptBucket[];
  combined_totals: CombinedTotals;
  latency_comparison_ai: LatencyAiRow[];
  time_balance_timeline: TimeBalanceBucket[];
  time_balance_totals: TimeBalanceTotals;
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
    pre_improve_word_timeline: tl.map((row) => ({
      bucket: row.bucket,
      avg_words_before: null,
      avg_words_after: null,
      samples: 0,
      samples_after: 0
    })),
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
      avg_draft_duration_ms: null,
      avg_draft_active_ms: null,
      promptly_samples: 0,
      native_latency_samples: 0,
      draft_timing_samples: 0,
      prompts_with_promptly: 0,
      prompts_native_web: 0
    })),
    time_balance_timeline: tl.map((row) => ({
      bucket: row.bucket,
      avg_draft_minutes: 0,
      avg_waiting_minutes: 0,
      native_sends_with_draft: 0,
      native_sends_with_latency: 0
    })),
    time_balance_totals: {
      draft_active_ms: 0,
      draft_wall_ms: 0,
      waiting_for_ai_ms: 0,
      draft_active_samples: 0,
      draft_wall_samples: 0,
      waiting_samples: 0,
      draft_active_minutes: null,
      draft_wall_minutes: null,
      waiting_for_ai_minutes: null
    },
    value_insights: {
      billed_promptly_tokens_sum_events: 0,
      rollup_daily_prompts_hint: 0,
      optimize_avg_composer_chars: null,
      optimize_avg_pre_improve_words: null,
      optimize_avg_post_improve_words: null,
      pre_improve_word_change_percent: null,
      pre_improve_word_samples: 0,
      post_improve_word_samples: 0,
      native_web_send_avg_composer_chars: null,
      composer_snapshot_count_illustrative: 0,
      estimated_drafting_active_minutes_illustrative: 0,
      measured_drafting_active_minutes: null,
      measured_drafting_wall_minutes: null,
      measured_waiting_for_ai_minutes: null,
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
  return "Other";
}

function clampScore(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

type LatencyMsAggregate = {
  avgDraftMs: number | null;
  avgNativeMs: number | null;
  avgPromptlyMs: number | null;
};

function weightedLatencyMsAggregate(rows: LatencyAiRow[]): LatencyMsAggregate {
  let draftSum = 0;
  let draftN = 0;
  let nativeSum = 0;
  let nativeN = 0;
  let promptlySum = 0;
  let promptlyN = 0;

  for (const row of rows) {
    if (row.service_key === "unknown") {
      continue;
    }
    const draftRaw = row.avg_draft_duration_ms ?? row.avg_draft_active_ms;
    if (typeof draftRaw === "number" && row.draft_timing_samples > 0) {
      draftSum += draftRaw * row.draft_timing_samples;
      draftN += row.draft_timing_samples;
    }
    if (typeof row.native_avg_host_roundtrip_ms === "number" && row.native_latency_samples > 0) {
      nativeSum += row.native_avg_host_roundtrip_ms * row.native_latency_samples;
      nativeN += row.native_latency_samples;
    }
    if (typeof row.prompted_promptly_avg_rewrite_ms === "number" && row.promptly_samples > 0) {
      promptlySum += row.prompted_promptly_avg_rewrite_ms * row.promptly_samples;
      promptlyN += row.promptly_samples;
    }
  }

  return {
    avgDraftMs: draftN > 0 ? draftSum / draftN : null,
    avgNativeMs: nativeN > 0 ? nativeSum / nativeN : null,
    avgPromptlyMs: promptlyN > 0 ? promptlySum / promptlyN : null
  };
}

type PromptDerivedScores = {
  efficiencyPercent: number | null;
  qualityPercent: number | null;
  efficiencyHint: string;
  qualityHint: string;
};

/**
 * Composite indices from on-page telemetry (not vendor benchmarks).
 * Efficiency: word trim + native draft/reply cycle vs Promptly rewrite time.
 * Quality: post-improve length fit + refinement balance + workflow depth.
 */
function derivePromptScores(stats: ExtendedStatsPayload): PromptDerivedScores {
  const vi = stats.value_insights;
  const wordsBefore = vi.optimize_avg_pre_improve_words;
  const wordsAfter = vi.optimize_avg_post_improve_words;
  const improveRuns = Math.max(vi.pre_improve_word_samples, vi.post_improve_word_samples);
  const latency = weightedLatencyMsAggregate(stats.latency_comparison_ai);
  const sharePct = stats.combined_totals.promptly_share_of_estimated_prompts_percent;

  let wordContrib = 0;
  if (typeof wordsBefore === "number" && wordsBefore > 0 && typeof wordsAfter === "number" && wordsAfter > 0) {
    const compression = clampScore((wordsBefore - wordsAfter) / wordsBefore, -0.15, 0.7);
    wordContrib = Math.max(0, compression) * 55;
    if (wordsAfter > wordsBefore && wordsAfter <= wordsBefore * 1.12) {
      wordContrib = Math.max(wordContrib, 10);
    }
  }

  let timeContrib = 0;
  const promptlyMs = latency.avgPromptlyMs;
  if (typeof promptlyMs === "number" && promptlyMs > 0) {
    const nativeCycleMs = (latency.avgDraftMs ?? 0) + (latency.avgNativeMs ?? 0);
    if (nativeCycleMs > promptlyMs) {
      const timeFactor = clampScore(Math.log10(nativeCycleMs / promptlyMs) / 1.45, 0, 1);
      timeContrib = timeFactor * 55;
    } else if (nativeCycleMs > 0) {
      timeContrib = 16;
    }
  }

  const shareContrib =
    typeof sharePct === "number" ? clampScore(sharePct / 100, 0, 1) * 12 : improveRuns > 0 ? 6 : 0;
  const depthContrib = clampScore(improveRuns / 35, 0, 1) * 8;

  let efficiencyPercent: number | null = null;
  if (wordContrib > 0 || timeContrib > 0 || improveRuns > 0) {
    efficiencyPercent =
      Math.round(
        clampScore(70 + wordContrib + timeContrib + shareContrib + depthContrib, 70, 150) * 10
      ) / 10;
  }

  let lengthFitness = 0.5;
  if (typeof wordsAfter === "number" && wordsAfter > 0) {
    const z = (wordsAfter - 88) / 52;
    lengthFitness = Math.exp(-0.5 * z * z);
  }

  let refinement = 0.45;
  if (typeof wordsBefore === "number" && wordsBefore > 0 && typeof wordsAfter === "number" && wordsAfter > 0) {
    const ratio = wordsAfter / wordsBefore;
    refinement = clampScore(1 - Math.abs(ratio - 0.84) / 0.38, 0, 1);
  }

  let workflow = 0.4;
  if (typeof promptlyMs === "number" && promptlyMs > 0) {
    const nativeCycleMs = (latency.avgDraftMs ?? 0) + (latency.avgNativeMs ?? 0);
    if (nativeCycleMs > 0) {
      workflow = clampScore(Math.log10(1 + nativeCycleMs / promptlyMs) / 1.25, 0, 1);
    }
  }

  const depthQ = clampScore(improveRuns / 28, 0, 1);
  const shareQ = typeof sharePct === "number" ? clampScore(sharePct / 100, 0, 1) : 0.5;

  let qualityPercent: number | null = null;
  if (improveRuns > 0 || (typeof wordsBefore === "number" && wordsBefore > 0)) {
    qualityPercent =
      Math.round(
        clampScore(
          30 + 22 * lengthFitness + 22 * refinement + 14 * workflow + 12 * depthQ + 8 * shareQ,
          30,
          90
        ) * 10
      ) / 10;
  }

  const efficiencyHint =
    typeof wordsBefore === "number" &&
    typeof wordsAfter === "number" &&
    typeof latency.avgPromptlyMs === "number"
      ? `Word trim · draft+reply vs rewrite`
      : typeof latency.avgPromptlyMs === "number"
        ? `Native cycle vs Promptly rewrite`
        : `Improve volume · Promptly share`;

  const qualityHint =
    typeof wordsAfter === "number" && improveRuns > 0
      ? `Output length · refinement · ${improveRuns.toLocaleString()} runs`
      : improveRuns > 0
        ? `Refinement fit · workflow · Improve depth`
        : `Length fitness · timing · usage`;

  return { efficiencyPercent, qualityPercent, efficiencyHint, qualityHint };
}

function formatUpliftPercent(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

/** Ease with near-zero velocity at start and end (smooth land, no snap). */
function countUpEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function AnimatedUpliftPercent({
  value,
  durationMs = 1500,
  className = "",
  color = COLOR_SCORE_GREEN
}: {
  value: number;
  durationMs?: number;
  className?: string;
  color?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const runIdRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }
        observer.disconnect();
        const runId = ++runIdRef.current;
        const start = performance.now();
        const target = value;

        const tick = (now: number) => {
          if (runIdRef.current !== runId) {
            return;
          }
          const linear = Math.min(1, (now - start) / durationMs);
          const eased = countUpEase(linear);
          setDisplay(target * eased);
          if (linear < 1) {
            requestAnimationFrame(tick);
          } else {
            setDisplay(target);
          }
        };

        setDisplay(0);
        requestAnimationFrame(tick);
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className} style={{ color }}>
      {formatUpliftPercent(display)}
    </span>
  );
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
          <XAxis type="number" stroke="#8A8A8A" />
          <YAxis dataKey="name" type="category" width={92} stroke="#8A8A8A" tick={{ fill: "#5C5C5C", fontSize: 11 }} />
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

  const modelTimeChartRows = useMemo(() => {
    if (!displayStats?.latency_comparison_ai) return [];
    return MODEL_CHART_ORDER.map((serviceKey) => {
      const row = displayStats.latency_comparison_ai.find((r) => r.service_key === serviceKey);
      if (!row) return null;
      const draftMs =
        typeof row.avg_draft_duration_ms === "number"
          ? row.avg_draft_duration_ms
          : typeof row.avg_draft_active_ms === "number"
            ? row.avg_draft_active_ms
            : null;
      const avgDraftingS = draftMs !== null ? Math.round((draftMs / 1000) * 10) / 10 : null;
      const avgResponseS =
        typeof row.native_avg_host_roundtrip_ms === "number"
          ? Math.round((row.native_avg_host_roundtrip_ms / 1000) * 10) / 10
          : null;
      const hasData = row.draft_timing_samples > 0 || row.native_latency_samples > 0;
      if (!hasData && serviceKey === "unknown") return null;
      return {
        model: svcLabel(serviceKey),
        key: serviceKey,
        avg_drafting_s: avgDraftingS ?? 0,
        avg_response_s: avgResponseS ?? 0,
        drafting_missing: avgDraftingS === null,
        response_missing: avgResponseS === null,
        has_data: hasData
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null && row.has_data);
  }, [displayStats]);

  const promptDerivedScores = useMemo(
    () => (displayStats ? derivePromptScores(displayStats) : null),
    [displayStats]
  );

  const modelTimeSectionHeight = Math.max(168, modelTimeChartRows.length * 52 + 48);

  const timeBalanceChartRows = useMemo(() => {
    if (!displayStats?.time_balance_timeline?.length) return [];
    const g = displayStats.granularity;
    return displayStats.time_balance_timeline.map((row) => ({
      ...row,
      label: g === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket),
      has_data: row.avg_draft_minutes > 0 || row.avg_waiting_minutes > 0
    }));
  }, [displayStats]);

  const timeBalanceHasData = useMemo(
    () =>
      timeBalanceChartRows.some((r) => r.has_data) ||
      (displayStats?.time_balance_totals?.waiting_for_ai_minutes ?? 0) > 0 ||
      (displayStats?.time_balance_totals?.draft_active_minutes ?? 0) > 0,
    [timeBalanceChartRows, displayStats]
  );

  const statsInfoNotices = useMemo((): ReactNode[] => {
    if (!displayStats) return [];
    const notices: ReactNode[] = [];

    if (displayStats.events_index_missing) {
      notices.push(
        <p key="optimize-index">
          Promptly Optimize analytics need the composite index on{" "}
          <code className="rounded bg-cream-dark px-1 text-[10px]">promptly_optimize_events</code> (
          <code className="text-[10px]">uid</code>, <code className="text-[10px]">utcDay</code>,{" "}
          <code className="text-[10px]">__name__</code>). Deploy <code className="text-[10px]">firestore.indexes.json</code> and
          refresh—the overview will still show native-send estimates when passive telemetry succeeds.
        </p>
      );
    }

    if (displayStats.host_passive_listener.index_missing) {
      notices.push(
        <p key="host-index">
          Native chat totals need composites on{" "}
          <code className="rounded bg-cream-dark px-1 text-[10px]">promptly_host_llm_events</code>. Deploy Firebase indexes before
          deduplicated summaries can load.
        </p>
      );
    }

    if (
      displayStats.host_passive_listener &&
      !displayStats.host_passive_listener.index_missing &&
      displayStats.host_passive_listener.query_newest_first === false
    ) {
      notices.push(
        <p key="host-desc-index">
          Host telemetry defaults to ascending Firestore pagination—high-volume histories may truncate the freshest days unless the
          descending index in <code className="text-[10px]">firestore.indexes.json</code> is deployed.
        </p>
      );
    }

    if (displayStats.likely_truncated || displayStats.host_passive_listener.likely_truncated) {
      notices.push(
        <p key="truncation">
          Some aggregates may omit early rows ({displayStats.events_in_range.toLocaleString()} Optimize events +{" "}
          {displayStats.host_passive_listener.events_docs_in_query.toLocaleString()} host docs loaded). Narrow the date range when you
          near the 5&nbsp;000 document cap each query.
        </p>
      );
    }

    return notices;
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

  const preImproveWordChartRows = useMemo(() => {
    if (!displayStats?.pre_improve_word_timeline?.length) return [];
    const g = displayStats.granularity;
    return displayStats.pre_improve_word_timeline
      .map((row) => {
        const before = typeof row.avg_words_before === "number" ? row.avg_words_before : null;
        const after = typeof row.avg_words_after === "number" ? row.avg_words_after : null;
        let bucket_change_percent: number | null = null;
        if (before !== null && after !== null && before > 0) {
          bucket_change_percent = Math.round(((after - before) / before) * 1000) / 10;
        }
        const word_delta_display =
          before !== null && after !== null ? Math.round(Math.abs(after - before) * 10) / 10 : 0;
        return {
          ...row,
          label: g === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket),
          avg_words_before_display: before ?? 0,
          avg_words_after_display: after ?? 0,
          word_delta_display,
          bucket_change_percent,
          has_data:
            (before !== null && row.samples > 0) || (after !== null && row.samples_after > 0)
        };
      })
      .filter((row) => row.has_data);
  }, [displayStats]);

  const preImproveWordChangePercent = displayStats?.value_insights?.pre_improve_word_change_percent ?? null;

  const preImproveWordHasData =
    preImproveWordChartRows.length > 0 ||
    (displayStats?.value_insights?.optimize_avg_pre_improve_words ?? null) !== null ||
    (displayStats?.value_insights?.optimize_avg_post_improve_words ?? null) !== null;

  function formatWordChangePercent(pct: number): string {
    const rounded = Math.round(pct * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded}%`;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-16">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-ink">Prompt statistics</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/account"
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-cream-dark sm:text-sm"
          >
            Back to account
          </Link>
          <button
            type="button"
            onClick={() => signOut(getFirebaseAuth()).catch(() => {})}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-faint hover:bg-cream-dark sm:text-sm"
          >
            Sign out
          </button>
        </div>
      </div>

      {!user && !loading ? (
        <div className="rounded-2xl border border-line bg-cream p-12 text-center backdrop-blur-md">
          <p className="text-muted">Sign in on the account page to view statistics.</p>
          <Link
            href="/account"
            className="mt-4 inline-flex justify-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-neutral-800"
          >
            Go to account
          </Link>
        </div>
      ) : null}

      {user && displayStats ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-line bg-cream-dark px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-faint">Range</span>
              {([7, 14, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    days === d ? "bg-ink text-cream" : "border border-line text-faint hover:bg-cream-dark"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-faint">
                Buckets
                <select
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value === "week" ? "week" : "day")}
                  className="rounded-md border border-line bg-cream-dark px-1.5 py-0.5 text-xs text-ink"
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly (UTC)</option>
                </select>
              </label>
              <button
                type="button"
                disabled={statsLoading || !user}
                onClick={() => user && loadExtended(user, days, granularity)}
                className="rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:bg-cream-dark disabled:opacity-50"
              >
                {statsLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {statsError ? (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{statsError}</div>
          ) : null}

          {statsInfoNotices.length ? (
            <AutoDismissNoticeBar
              key={`${days}-${granularity}-${statsInfoNotices.length}`}
              className="!mb-4"
              innerClassName="rounded-xl border border-sky-500/35 bg-sky-500/[0.12] px-4 py-3 text-xs leading-relaxed text-sky-50/95"
            >
              <div className="space-y-3">{statsInfoNotices}</div>
            </AutoDismissNoticeBar>
          ) : null}

          {/* Prompt volume */}
          <section className="mb-8 rounded-2xl border border-line bg-cream p-3 shadow-card sm:p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-faint">Prompt volume</h2>
            <div className="h-72 w-full sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stackedTimeline} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                  <YAxis stroke="#8A8A8A" allowDecimals={false} width={32} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "#FAF8F4", border: "1px solid #E0DDD6", color: "#111111" }}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="prompts_gemini" name="Gemini" stackId="stack" fill={COLOR_GEMINI} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="prompts_claude" name="Claude" stackId="stack" fill={COLOR_CLAUDE} />
                  <Bar dataKey="prompts_chatgpt" name="ChatGPT" stackId="stack" fill={COLOR_CHATGPT} />
                  <Bar dataKey="prompts_unknown" name="Other" stackId="stack" fill={COLOR_UNKNOWN} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Promptly impact scores (left) + average draft chart (right) */}
          {modelTimeChartRows.length ||
          promptDerivedScores?.efficiencyPercent != null ||
          promptDerivedScores?.qualityPercent != null ? (
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-stretch">
              {promptDerivedScores?.efficiencyPercent != null ||
              promptDerivedScores?.qualityPercent != null ? (
                <section
                  className="flex w-full flex-col justify-center rounded-2xl border border-line bg-cream p-3 shadow-card sm:p-4 lg:w-1/2"
                  style={{ minHeight: modelTimeChartRows.length ? modelTimeSectionHeight : undefined }}
                >
                  <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Promptly impact</h2>
                  <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Prompt efficiency</p>
                      {promptDerivedScores.efficiencyPercent != null ? (
                        <AnimatedUpliftPercent
                          key={`eff-${promptDerivedScores.efficiencyPercent}-${days}-${granularity}`}
                          value={promptDerivedScores.efficiencyPercent}
                          className="mt-1 block text-3xl font-bold tabular-nums leading-none sm:text-4xl"
                          color={COLOR_SCORE_GREEN}
                        />
                      ) : (
                        <p className="mt-1 text-3xl font-bold leading-none text-ink sm:text-4xl">—</p>
                      )}
                      <p className="mt-2 text-[10px] leading-snug text-faint">{promptDerivedScores.efficiencyHint}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Prompt quality</p>
                      {promptDerivedScores.qualityPercent != null ? (
                        <AnimatedUpliftPercent
                          key={`qual-${promptDerivedScores.qualityPercent}-${days}-${granularity}`}
                          value={promptDerivedScores.qualityPercent}
                          className="mt-1 block text-3xl font-bold tabular-nums leading-none sm:text-4xl"
                          color={COLOR_SCORE_GREEN}
                        />
                      ) : (
                        <p className="mt-1 text-3xl font-bold leading-none text-ink sm:text-4xl">—</p>
                      )}
                      <p className="mt-2 text-[10px] leading-snug text-faint">{promptDerivedScores.qualityHint}</p>
                    </div>
                  </div>
                </section>
              ) : null}
              {modelTimeChartRows.length ? (
                <section className="w-full rounded-2xl border border-line bg-cream p-3 shadow-card sm:p-4 lg:w-1/2">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-faint">
                    Average draft &amp; response time
                  </h2>
                  <div style={{ height: modelTimeSectionHeight }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={modelTimeChartRows}
                        layout="vertical"
                        margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                        barCategoryGap="28%"
                        barGap={4}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                        <XAxis type="number" stroke="#8A8A8A" tick={{ fill: "#5C5C5C", fontSize: 10 }} unit="s" />
                        <YAxis
                          type="category"
                          dataKey="model"
                          stroke="#8A8A8A"
                          tick={{ fill: "#5C5C5C", fontSize: 11 }}
                          width={72}
                        />
                        <Tooltip
                          contentStyle={{ background: "#FAF8F4", border: "1px solid #E0DDD6", color: "#111111" }}
                          formatter={(value: number, name: string) => {
                            if (typeof value !== "number" || value <= 0) return ["—", name];
                            return [`${value}s`, name];
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                        <Bar dataKey="avg_drafting_s" name="Avg drafting (s)" fill="#c084fc" radius={[0, 4, 4, 0]} barSize={12}>
                          {modelTimeChartRows.map((entry, idx) => (
                            <Cell key={`draft-${idx}`} fillOpacity={entry.drafting_missing ? 0.2 : 0.95} />
                          ))}
                        </Bar>
                        <Bar
                          dataKey="avg_response_s"
                          name="Avg AI response (s)"
                          fill={COLOR_NATIVE_WEB}
                          radius={[0, 4, 4, 0]}
                          barSize={12}
                        >
                          {modelTimeChartRows.map((entry, idx) => (
                            <Cell key={`resp-${idx}`} fillOpacity={entry.response_missing ? 0.2 : 0.95} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {timeBalanceHasData ? (
            <section className="mb-12 rounded-2xl border border-line bg-cream p-6 backdrop-blur-md">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Writing vs waiting for AI</h2>
              <div className="mt-4 h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeBalanceChartRows.filter((r) => r.has_data)} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                    <YAxis
                      stroke="#8A8A8A"
                      tick={{ fill: "#5C5C5C" }}
                      allowDecimals
                      label={{ value: "Avg min / send", angle: -90, position: "insideLeft", fill: "#5C5C5C" }}
                    />
                    <Tooltip
                      contentStyle={{ background: "#FAF8F4", border: "1px solid #E0DDD6", color: "#111111" }}
                      formatter={(value: number, name: string) => {
                        if (typeof value !== "number" || value <= 0) return ["—", name];
                        return [`${value} min`, name];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="avg_draft_minutes" name="Avg drafting" fill="#c084fc" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="avg_waiting_minutes" name="Avg waiting for AI" fill={COLOR_NATIVE_WEB} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {displayStats.time_balance_totals ? (
                <p className="mt-4 text-[11px] text-faint">
                  Range average per send:{" "}
                  {displayStats.time_balance_totals.draft_active_minutes != null
                    ? `${displayStats.time_balance_totals.draft_active_minutes.toLocaleString()} min drafting`
                    : "— drafting"}{" "}
                  ·{" "}
                  {displayStats.time_balance_totals.waiting_for_ai_minutes != null
                    ? `${displayStats.time_balance_totals.waiting_for_ai_minutes.toLocaleString()} min waiting`
                    : "— waiting"}
                </p>
              ) : null}
            </section>
          ) : null}

          {/*Latency */}
          <section className="mb-12 rounded-2xl border border-line bg-cream p-6 backdrop-blur-md">
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Rewrite vs native turnaround time</h2>
            <div className="mt-4 h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={latencyChartRows} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="ai" stroke="#8A8A8A" tick={{ fill: "#5C5C5C", fontSize: 11 }} />
                  <YAxis stroke="#8A8A8A" tick={{ fill: "#5C5C5C" }} label={{ value: "Seconds (avg)", angle: -90, position: "insideLeft", fill: "#5C5C5C" }} />
                  <Tooltip contentStyle={{ background: "#FAF8F4", border: "1px solid #E0DDD6", color: "#111111" }} />
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

          {/* Pre-improve word count */}
          {preImproveWordHasData ? (
            <section className="mb-12 rounded-2xl border border-line bg-cream p-6 backdrop-blur-md">
              <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm font-semibold uppercase tracking-[0.22em] text-faint">
                <span>Words before Promptly</span>
                {preImproveWordChangePercent !== null ? (
                  <span
                    className="text-4xl font-bold normal-case leading-none tracking-normal tabular-nums sm:text-5xl"
                    style={{
                      color:
                        preImproveWordChangePercent > 0
                          ? COLOR_SCORE_GREEN
                          : preImproveWordChangePercent < 0
                            ? "#b45309"
                            : undefined
                    }}
                  >
                    {formatWordChangePercent(preImproveWordChangePercent)}
                  </span>
                ) : null}
              </h2>
              {preImproveWordChartRows.length ? (
                <div className="mt-4 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={preImproveWordChartRows} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                      <YAxis
                        stroke="#8A8A8A"
                        tick={{ fill: "#5C5C5C" }}
                        allowDecimals
                        label={{ value: "Avg words", angle: -90, position: "insideLeft", fill: "#5C5C5C" }}
                      />
                      <Tooltip
                        contentStyle={{ background: "#FAF8F4", border: "1px solid #E0DDD6", color: "#111111" }}
                        formatter={(value: number, name: string, item) => {
                          const payload = item?.payload as {
                            samples?: number;
                            samples_after?: number;
                            bucket_change_percent?: number | null;
                          };
                          if (name === "Change") {
                            const pct = payload?.bucket_change_percent;
                            return [
                              typeof pct === "number" ? formatWordChangePercent(pct) : "—",
                              "Change"
                            ];
                          }
                          const runs =
                            name === "Before Promptly"
                              ? (payload?.samples ?? 0)
                              : (payload?.samples_after ?? 0);
                          return [`${value} words (${runs.toLocaleString()} runs)`, name];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar
                        dataKey="avg_words_before_display"
                        name="Before Promptly"
                        fill={COLOR_PROMPTLY}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={34}
                      />
                      <Bar dataKey="word_delta_display" name="Change" fill="#94a3b8" radius={[2, 2, 0, 0]} maxBarSize={14}>
                        {preImproveWordChartRows.map((entry, idx) => (
                          <Cell
                            key={`chg-${idx}`}
                            fill={
                              typeof entry.bucket_change_percent === "number" && entry.bucket_change_percent > 0
                                ? COLOR_SCORE_GREEN
                                : typeof entry.bucket_change_percent === "number" && entry.bucket_change_percent < 0
                                  ? "#b45309"
                                  : "#94a3b8"
                            }
                            fillOpacity={0.88}
                          />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="avg_words_after_display"
                        name="After Promptly"
                        fill={COLOR_NATIVE_WEB}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={34}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Composer length */}
          {composerCompareData.length ? (
            <section className="mb-12 rounded-2xl border border-line bg-cream p-6 backdrop-blur-md">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Draft verbosity</h2>
              <div className="mt-4 h-64 w-full max-w-xl">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={composerCompareData} layout="vertical" margin={{ left: 32, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" stroke="#8A8A8A" />
                    <YAxis dataKey="label" type="category" width={148} stroke="#8A8A8A" tick={{ fill: "#5C5C5C", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#FAF8F4", border: "1px solid #E0DDD6", color: "#111111" }} />
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
            <section className="mb-12 rounded-2xl border border-line bg-cream p-6 backdrop-blur-md">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Pathway breakdown</h2>
              <div className="mt-4 h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pathwayCompareData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="pathway" stroke="#bfb7ff" tick={{ fill: "#f9f8ff", fontSize: 10 }} />
                    <YAxis stroke="#bfb7ff" allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#FAF8F4", border: "1px solid #E0DDD6", color: "#111111" }} />
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
            <div className="rounded-2xl border border-line bg-cream-dark p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Improve mode mixes</h3>
              <ModeMiniChart modes={displayStats.breakdowns_from_events.mode} />
            </div>
            <div className="rounded-2xl border border-line bg-cream-dark p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Billed Promptly tokens</h3>
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
                    <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                    <YAxis stroke="#8A8A8A" />
                    <Tooltip contentStyle={{ background: "#FAF8F4", border: "1px solid #E0DDD6", color: "#111111" }} />
                    <Bar dataKey="billed_promptly_tokens" fill="#9333ea" name="Promptly billed tokens / bucket" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="mb-12 rounded-2xl border border-line bg-cream-dark p-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Scraped model buckets (Improve path)</h3>
            <div className="mt-4 overflow-x-auto rounded-xl border border-line">
              <table className="min-w-[520px] w-full border-collapse text-left text-sm">
                <thead className="border-b border-line text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Bucket</th>
                    <th className="px-4 py-2 font-semibold">Example label</th>
                    <th className="px-4 py-2 font-semibold">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStats.breakdowns_from_events.model_buckets.length ? (
                    displayStats.breakdowns_from_events.model_buckets.map((row) => (
                      <tr key={row.bucket} className="border-b border-line text-ink">
                        <td className="px-4 py-2 font-mono text-xs text-faint">{row.bucket}</td>
                        <td className="px-4 py-2 text-xs">{row.exemplar_label || "—"}</td>
                        <td className="px-4 py-2 tabular-nums">{row.prompts.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="text-ink">
                      <td colSpan={3} className="px-4 py-3 text-xs italic">
                        After you Optimize with Promptly attached, detected host labels accumulate here whenever the picker exposes readable text.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="rounded-2xl border border-line bg-cream-dark p-5 text-[11px] leading-relaxed text-faint">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="font-semibold text-ink/90">Native sends:</span>{" "}
                {displayStats.value_insights.native_web_sends.toLocaleString()}
              </p>
              <p>
                <span className="font-semibold text-ink/90">Optimize events queried:</span>{" "}
                {displayStats.value_insights.optimize_events_queried.toLocaleString()}
              </p>
              <p>
                <span className="font-semibold text-ink/90">Mirror rows synced:</span>{" "}
                {displayStats.combined_totals.mirror_rows_synced_to_host_telemetry.toLocaleString()}
              </p>
              <p>
                <span className="font-semibold text-ink/90">Authoritative rollup tokens:</span>{" "}
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
