"use client";

import { getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import Link from "next/link";
import type { User } from "firebase/auth";
import { StatisticsPrintReport } from "@/components/account/StatisticsPrintReport";
import { AutoDismissNoticeBar } from "@/components/ui/AutoDismissNoticeBar";
import { buildStatisticsReportData, downloadStatisticsReportPdf } from "@/lib/statisticsReport";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

/** OpenAI / ChatGPT green — web chat. */
const COLOR_CHATGPT_WEB = "#0e9068";
/** Codex — same green family, lighter tint. */
const COLOR_CODEX = "#22c997";
/** Anthropic Claude — web chat (muted coral-orange). */
const COLOR_CLAUDE_WEB = "#b86b4a";
/** Claude Code — same orange family, brighter tint. */
const COLOR_CLAUDE_CODE = "#e8956f";
/** Google Gemini / primary blue — web only. */
const COLOR_GEMINI_WEB = "#4285f4";
const COLOR_UNKNOWN = "#64748b";
/** Promptly accent for “Improve / rewrite” bars. */
const COLOR_PROMPTLY = "#ab68ff";
const COLOR_NATIVE_WEB = "#22d3ee";
/** Cursor IDE — cyan, distinct from Gemini blue. */
const COLOR_CURSOR = "#00D8FF";

/** @deprecated use COLOR_CHATGPT_WEB */
const COLOR_CHATGPT = COLOR_CHATGPT_WEB;
/** @deprecated use COLOR_CLAUDE_WEB */
const COLOR_CLAUDE = COLOR_CLAUDE_WEB;
/** @deprecated use COLOR_GEMINI_WEB */
const COLOR_GEMINI = COLOR_GEMINI_WEB;
const COLOR_CURSOR_IDE = COLOR_CURSOR;

const IDE_AGENT_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  cursor: "Cursor",
  codex: "Codex"
};

function formatIdeModelLabel(row: { bucket: string; label: string | null }): string {
  if (row.label?.trim()) return row.label.trim();
  if (row.bucket === "unknown") return "Unknown model";
  if (row.bucket === "test-send") return "Connection test";
  return row.bucket.replace(/-/g, " ");
}

function formatResponseMs(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

type IdeToolKey = "claude_code" | "cursor" | "codex";
type SelectedEmailsByTool = Record<IdeToolKey, Set<string>>;

function formatIdeLastSeen(ms: number | null | undefined): string {
  if (!ms) return "Not synced yet";
  return new Date(ms).toLocaleString();
}

const IDE_AGENT_CARDS: Array<{ key: "claude_code" | "cursor" | "codex"; label: string }> = [
  { key: "claude_code", label: IDE_AGENT_LABELS.claude_code },
  { key: "cursor", label: IDE_AGENT_LABELS.cursor },
  { key: "codex", label: IDE_AGENT_LABELS.codex }
];

function appendIdeEmailFilterParams(
  params: URLSearchParams,
  emailSelection: SelectedEmailsByTool,
  availableByTool?: Record<IdeToolKey, string[]>
) {
  for (const agent of IDE_AGENT_CARDS) {
    const selected = emailSelection[agent.key];
    const available = availableByTool?.[agent.key] ?? [];
    const isStrictSubset =
      selected.size > 0 && available.length > 0 && selected.size < available.length;
    if (isStrictSubset) {
      params.set(`${agent.key}_emails`, Array.from(selected).join(","));
    }
  }
}

const CHART_FONT_FAMILY = "var(--font-roboto-chart), Roboto, sans-serif";
/** All chart axis ticks — dates, counts, units, and category labels on axes. */
const CHART_Y_TICK = { fill: "#5C5C5C", fontSize: 10, fontFamily: CHART_FONT_FAMILY };
const CHART_Y_TICK_11 = { fill: "#5C5C5C", fontSize: 11, fontFamily: CHART_FONT_FAMILY };
/** Date / bucket labels on chart X axes (cream card backgrounds). */
const CHART_X_DATE_TICK = {
  fill: "#2a2a2a",
  fontSize: 11,
  fontWeight: 600 as const,
  fontFamily: CHART_FONT_FAMILY
};
const CHART_X_DATE_STROKE = "#525252";
const CHART_AXIS_LABEL = (value: string, fill = "#5C5C5C") => ({
  value,
  angle: -90 as const,
  position: "insideLeft" as const,
  fill,
  style: { fontFamily: CHART_FONT_FAMILY }
});
const CHART_TOOLTIP_STYLE = {
  background: "#FAF8F4",
  border: "1px solid #E0DDD6",
  color: "#111111",
  fontFamily: CHART_FONT_FAMILY
};
const CHART_TOOLTIP_DARK_STYLE = {
  background: "#161018",
  border: "1px solid rgba(139,92,246,0.4)",
  fontFamily: CHART_FONT_FAMILY
};
const CHART_LEGEND_STYLE = { fontSize: 11, paddingTop: 8, fontFamily: CHART_FONT_FAMILY };
const CHART_LEGEND_STYLE_COMPACT = { fontSize: 11, paddingTop: 4, fontFamily: CHART_FONT_FAMILY };
/** Derived score emphasis (readable on cream cards). */
const COLOR_SCORE_GREEN = "#15803d";
const COLOR_VOLUME_DELTA_DOWN = "#dc2626";
const COLOR_VOLUME_TREND = "#525252";

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

type IdeStatsPayload = {
  range_days: number;
  granularity: "day" | "week";
  totals: {
    prompts: { claude_code: number; cursor: number; codex: number };
    prompts_without_agent_email?: { claude_code: number; cursor: number; codex: number };
    screen_time_minutes: { claude_code: number; cursor: number; codex: number };
    engagement_minutes: {
      drafting: number;
      waiting: number;
      reading_idle: number;
    };
    engagement_minutes_by_tool: Record<
      IdeToolKey,
      { drafting: number; waiting: number; reading_idle: number }
    >;
  };
  prompt_timeline: Array<{
    bucket: string;
    claude_code: number;
    cursor: number;
    codex: number;
    total: number;
  }>;
  screen_time_timeline: Array<{
    bucket: string;
    claude_code_minutes: number;
    cursor_minutes: number;
    codex_minutes: number;
    drafting_minutes: number;
    waiting_minutes: number;
    reading_idle_minutes: number;
  }>;
  connected_tools: Array<{ tool: string; device_count: number; last_seen_at_ms: number | null }>;
  model_buckets: Array<{
    tool: string;
    bucket: string;
    label: string | null;
    prompts: number;
    avg_response_ms: number | null;
    response_samples: number;
    avg_words: number | null;
    word_samples: number;
    avg_draft_ms: number | null;
    draft_samples: number;
  }>;
  draft_timing_by_tool: Record<
    IdeToolKey,
    { avg_draft_ms: number | null; samples: number }
  >;
  avg_words_by_tool: Record<IdeToolKey, { avg_words: number | null; samples: number }>;
  agent_emails_by_tool: { claude_code: string[]; cursor: string[]; codex: string[] };
  response_latency_by_tool: Record<
    string,
    { avg_ms: number | null; samples: number; p50_ms: number | null }
  >;
  events_docs_in_query: number;
  index_missing: boolean;
  likely_truncated: boolean;
  quota_exceeded?: boolean;
  footnotes: string[];
  linked_promptly_accounts?: Array<{
    email: string;
    uid: string;
    is_primary: boolean;
  }>;
};

function emptyIdeStats(days: number, granularity: "day" | "week"): IdeStatsPayload {
  const tl = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (days - i - 1));
    return { bucket: d.toISOString().slice(0, 10) };
  });
  return {
    range_days: days,
    granularity,
    totals: {
      prompts: { claude_code: 0, cursor: 0, codex: 0 },
      prompts_without_agent_email: { claude_code: 0, cursor: 0, codex: 0 },
      screen_time_minutes: { claude_code: 0, cursor: 0, codex: 0 },
      engagement_minutes: { drafting: 0, waiting: 0, reading_idle: 0 },
      engagement_minutes_by_tool: {
        claude_code: { drafting: 0, waiting: 0, reading_idle: 0 },
        cursor: { drafting: 0, waiting: 0, reading_idle: 0 },
        codex: { drafting: 0, waiting: 0, reading_idle: 0 }
      }
    },
    prompt_timeline: tl.map((row) => ({
      bucket: row.bucket,
      claude_code: 0,
      cursor: 0,
      codex: 0,
      total: 0
    })),
    screen_time_timeline: tl.map((row) => ({
      bucket: row.bucket,
      claude_code_minutes: 0,
      cursor_minutes: 0,
      codex_minutes: 0,
      drafting_minutes: 0,
      waiting_minutes: 0,
      reading_idle_minutes: 0
    })),
    connected_tools: [],
    model_buckets: [],
    draft_timing_by_tool: {
      claude_code: { avg_draft_ms: null, samples: 0 },
      cursor: { avg_draft_ms: null, samples: 0 },
      codex: { avg_draft_ms: null, samples: 0 }
    },
    avg_words_by_tool: {
      claude_code: { avg_words: null, samples: 0 },
      cursor: { avg_words: null, samples: 0 },
      codex: { avg_words: null, samples: 0 }
    },
    agent_emails_by_tool: { claude_code: [], cursor: [], codex: [] },
    response_latency_by_tool: {
      claude_code: { avg_ms: null, samples: 0, p50_ms: null },
      cursor: { avg_ms: null, samples: 0, p50_ms: null },
      codex: { avg_ms: null, samples: 0, p50_ms: null }
    },
    events_docs_in_query: 0,
    index_missing: false,
    likely_truncated: false,
    footnotes: [],
    linked_promptly_accounts: []
  };
}

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

const COLOR_DRAFTING = "#c084fc";
const COLOR_READING_IDLE = "#94a3b8";

const EMPTY_SERVICE_SCREEN_TIME: ServiceScreenTime = {
  total_minutes: 0,
  drafting_minutes: 0,
  waiting_minutes: 0,
  reading_idle_minutes: 0
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

type ServiceScreenTime = {
  total_minutes: number;
  drafting_minutes: number;
  waiting_minutes: number;
  reading_idle_minutes: number;
};

type ScreenTimeTimelineBucket = {
  bucket: string;
  chatgpt_minutes: number;
  claude_minutes: number;
  gemini_minutes: number;
  drafting_minutes: number;
  waiting_minutes: number;
  reading_idle_minutes: number;
};

type EngagementTotals = {
  drafting_minutes: number;
  waiting_minutes: number;
  reading_idle_minutes: number;
  segment_count: number;
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
  screen_time_by_service: Record<PromptlySvc, ServiceScreenTime>;
  screen_time_timeline: ScreenTimeTimelineBucket[];
  engagement_totals: EngagementTotals;
  value_insights: ValueInsights;
  breakdowns_from_events: {
    service: Record<PromptlySvc, number>;
    mode: { auto: number; improve: number; generate: number };
    model_buckets: Array<{ bucket: string; exemplar_label: string | null; prompts: number }>;
  };
  host_passive_listener: HostPassiveLite;
  quota_exceeded?: boolean;
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
    screen_time_by_service: {
      chatgpt: { ...EMPTY_SERVICE_SCREEN_TIME },
      claude: { ...EMPTY_SERVICE_SCREEN_TIME },
      gemini: { ...EMPTY_SERVICE_SCREEN_TIME },
      unknown: { ...EMPTY_SERVICE_SCREEN_TIME }
    },
    screen_time_timeline: tl.map((row) => ({
      bucket: row.bucket,
      chatgpt_minutes: 0,
      claude_minutes: 0,
      gemini_minutes: 0,
      drafting_minutes: 0,
      waiting_minutes: 0,
      reading_idle_minutes: 0
    })),
    engagement_totals: {
      drafting_minutes: 0,
      waiting_minutes: 0,
      reading_idle_minutes: 0,
      segment_count: 0
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
  if (key === "chatgpt") return "ChatGPT (Web)";
  if (key === "claude") return "Claude (Web)";
  if (key === "gemini") return "Gemini (Web)";
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

function FadeInUpliftPercent({
  value,
  className = "",
  color = COLOR_SCORE_GREEN
}: {
  value: number;
  className?: string;
  color?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    setVisible(false);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }
        setVisible(true);
        observer.disconnect();
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span
      ref={ref}
      className={`${className} transition-[opacity,transform] duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
      }`}
      style={{ color }}
    >
      {formatUpliftPercent(value)}
    </span>
  );
}

type PromptVolumeAiKey =
  | "claude"
  | "gemini"
  | "chatgpt"
  | "other"
  | "claude_code"
  | "cursor"
  | "codex";

type PromptVolumeAiFilterState = Record<PromptVolumeAiKey, boolean>;

type PromptVolumeChartBucket = CombinedPromptBucket & {
  prompts_claude_code: number;
  prompts_cursor: number;
  prompts_codex: number;
};

const PROMPT_VOLUME_AI_FILTERS: Array<{
  key: PromptVolumeAiKey;
  label: string;
  color: string;
  dataKey: keyof PromptVolumeChartBucket;
  legendName: string;
}> = [
  {
    key: "chatgpt",
    label: "ChatGPT (Web)",
    color: COLOR_CHATGPT_WEB,
    dataKey: "prompts_chatgpt",
    legendName: "ChatGPT (Web)"
  },
  {
    key: "codex",
    label: "Codex",
    color: COLOR_CODEX,
    dataKey: "prompts_codex",
    legendName: "Codex"
  },
  {
    key: "claude",
    label: "Claude (Web)",
    color: COLOR_CLAUDE_WEB,
    dataKey: "prompts_claude",
    legendName: "Claude (Web)"
  },
  {
    key: "claude_code",
    label: "Claude Code",
    color: COLOR_CLAUDE_CODE,
    dataKey: "prompts_claude_code",
    legendName: "Claude Code"
  },
  {
    key: "gemini",
    label: "Gemini (Web)",
    color: COLOR_GEMINI_WEB,
    dataKey: "prompts_gemini",
    legendName: "Gemini (Web)"
  },
  {
    key: "cursor",
    label: "Cursor",
    color: COLOR_CURSOR,
    dataKey: "prompts_cursor",
    legendName: "Cursor"
  },
  {
    key: "other",
    label: "Other",
    color: COLOR_UNKNOWN,
    dataKey: "prompts_unknown",
    legendName: "Other"
  }
];

const DEFAULT_PROMPT_VOLUME_AI_FILTERS: PromptVolumeAiFilterState = {
  claude: true,
  gemini: true,
  chatgpt: true,
  other: true,
  claude_code: true,
  cursor: true,
  codex: true
};

function mergePromptVolumeTimelines(
  web: CombinedPromptBucket[],
  ide: Array<{ bucket: string; claude_code: number; cursor: number; codex: number }>
): PromptVolumeChartBucket[] {
  const webMap = new Map(web.map((row) => [row.bucket, row]));
  const ideMap = new Map(ide.map((row) => [row.bucket, row]));
  const buckets = [...new Set([...web.map((row) => row.bucket), ...ide.map((row) => row.bucket)])].sort();
  return buckets.map((bucket) => {
    const webRow = webMap.get(bucket) ?? emptyCombinedBucket(bucket);
    const ideRow = ideMap.get(bucket);
    return {
      ...webRow,
      prompts_claude_code: ideRow?.claude_code ?? 0,
      prompts_cursor: ideRow?.cursor ?? 0,
      prompts_codex: ideRow?.codex ?? 0
    };
  });
}

type ScreenTimeTimelineMergedRow = {
  bucket: string;
  chatgpt: number;
  claude: number;
  gemini: number;
  claude_code: number;
  cursor: number;
  codex: number;
};

type ScreenTimeTimelineSeriesKey = Exclude<PromptVolumeAiKey, "other">;

type ScreenTimeMetricKey = keyof Pick<
  ScreenTimeTimelineMergedRow,
  "chatgpt" | "claude" | "gemini" | "claude_code" | "cursor" | "codex"
>;

const SCREEN_TIME_TIMELINE_KEY: Record<ScreenTimeTimelineSeriesKey, ScreenTimeMetricKey> = {
  chatgpt: "chatgpt",
  claude: "claude",
  gemini: "gemini",
  claude_code: "claude_code",
  cursor: "cursor",
  codex: "codex"
};

const SCREEN_TIME_OVER_TIME_FILTERS = PROMPT_VOLUME_AI_FILTERS.filter(
  (filter): filter is (typeof PROMPT_VOLUME_AI_FILTERS)[number] & { key: ScreenTimeTimelineSeriesKey } =>
    filter.key !== "other"
);

function emptyScreenTimeTimelineRow(bucket: string): ScreenTimeTimelineMergedRow {
  return {
    bucket,
    chatgpt: 0,
    claude: 0,
    gemini: 0,
    claude_code: 0,
    cursor: 0,
    codex: 0
  };
}

function mergeScreenTimeTimelines(
  web: ScreenTimeTimelineBucket[],
  ide: IdeStatsPayload["screen_time_timeline"]
): ScreenTimeTimelineMergedRow[] {
  const webMap = new Map(web.map((row) => [row.bucket, row]));
  const ideMap = new Map(ide.map((row) => [row.bucket, row]));
  const buckets = [...new Set([...web.map((row) => row.bucket), ...ide.map((row) => row.bucket)])].sort();
  return buckets.map((bucket) => {
    const webRow = webMap.get(bucket);
    const ideRow = ideMap.get(bucket);
    const merged = emptyScreenTimeTimelineRow(bucket);
    if (webRow) {
      merged.chatgpt = webRow.chatgpt_minutes;
      merged.claude = webRow.claude_minutes;
      merged.gemini = webRow.gemini_minutes;
    }
    if (ideRow) {
      merged.claude_code = ideRow.claude_code_minutes;
      merged.cursor = ideRow.cursor_minutes;
      merged.codex = ideRow.codex_minutes;
    }
    return merged;
  });
}

type EngagementTimelineMergedRow = {
  bucket: string;
  drafting: number;
  waiting: number;
  reading_idle: number;
};

function mergeEngagementTimelines(
  web: ScreenTimeTimelineBucket[],
  ide: IdeStatsPayload["screen_time_timeline"],
  includeWeb: boolean,
  includeIde: boolean
): EngagementTimelineMergedRow[] {
  const webMap = new Map(web.map((row) => [row.bucket, row]));
  const ideMap = new Map(ide.map((row) => [row.bucket, row]));
  const buckets = [...new Set([...web.map((row) => row.bucket), ...ide.map((row) => row.bucket)])].sort();
  return buckets.map((bucket) => {
    let drafting = 0;
    let waiting = 0;
    let reading_idle = 0;
    if (includeWeb) {
      const webRow = webMap.get(bucket);
      if (webRow) {
        drafting += webRow.drafting_minutes;
        waiting += webRow.waiting_minutes;
        reading_idle += webRow.reading_idle_minutes;
      }
    }
    if (includeIde) {
      const ideRow = ideMap.get(bucket);
      if (ideRow) {
        drafting += ideRow.drafting_minutes;
        waiting += ideRow.waiting_minutes;
        reading_idle += ideRow.reading_idle_minutes;
      }
    }
    return { bucket, drafting, waiting, reading_idle };
  });
}

const ENGAGEMENT_OVER_TIME_SERIES = [
  { dataKey: "drafting" as const, name: "Drafting prompt", color: COLOR_DRAFTING },
  { dataKey: "waiting" as const, name: "Waiting for AI", color: COLOR_NATIVE_WEB },
  { dataKey: "reading_idle" as const, name: "Reading output", color: COLOR_READING_IDLE }
];

function promptVolumeBucketTotal(
  row: PromptVolumeChartBucket,
  filters: PromptVolumeAiFilterState
): number {
  let total = 0;
  for (const filter of PROMPT_VOLUME_AI_FILTERS) {
    if (!filters[filter.key]) continue;
    total += Math.max(0, Number(row[filter.dataKey] ?? 0) || 0);
  }
  return total;
}

/** Smooths daily totals into a curved trend (moving average + bidirectional EMA blend). */
function smoothTrendValues(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [Math.max(0, Math.round((values[0] ?? 0) * 10) / 10)];

  const half = n >= 9 ? 2 : 1;
  const smoothed = values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      sum += values[j] ?? 0;
      count++;
    }
    return count > 0 ? sum / count : 0;
  });

  const alpha = 0.38;
  const forward: number[] = [];
  let f = smoothed[0] ?? 0;
  for (let i = 0; i < n; i++) {
    const v = smoothed[i] ?? 0;
    f = i === 0 ? v : alpha * v + (1 - alpha) * f;
    forward.push(f);
  }

  const backward: number[] = new Array(n);
  let b = smoothed[n - 1] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    const v = smoothed[i] ?? 0;
    b = i === n - 1 ? v : alpha * v + (1 - alpha) * b;
    backward[i] = b;
  }

  return forward.map((fv, i) =>
    Math.max(0, Math.round(((fv + (backward[i] ?? fv)) / 2) * 10) / 10)
  );
}

type PromptVolumePeriodChange = {
  percent: number;
  currentTotal: number;
  priorTotal: number;
  /** Human-readable comparison window for screen readers / title */
  comparisonLabel: string;
};

/**
 * Compares prompt volume in the recent segment vs the prior segment.
 * Uses the selected range length when enough buckets exist; otherwise last 7 vs prior 7, then half-and-half.
 */
function promptVolumeSegmentBuckets(rangeDays: number, granularity: "day" | "week"): number {
  if (granularity === "week") {
    return Math.max(1, Math.ceil(rangeDays / 7));
  }
  return Math.max(1, Math.floor(rangeDays));
}

function computePromptVolumePeriodChange(
  rows: PromptVolumeChartBucket[],
  rangeDays: number,
  granularity: "day" | "week",
  filters: PromptVolumeAiFilterState
): PromptVolumePeriodChange | null {
  const n = rows.length;
  if (n < 2) return null;

  const sumSlice = (slice: PromptVolumeChartBucket[]) =>
    slice.reduce((acc, row) => acc + promptVolumeBucketTotal(row, filters), 0);

  const unit = granularity === "week" ? "wk" : "d";
  let segment = promptVolumeSegmentBuckets(rangeDays, granularity);
  let currentSlice = rows.slice(-segment);
  let priorSlice = rows.slice(-segment * 2, -segment);
  let comparisonLabel = `vs prior ${segment} ${unit}`;

  if (priorSlice.length < 1) {
    const weekFallback = granularity === "week" ? Math.min(2, Math.max(1, Math.floor(n / 2))) : Math.min(7, Math.max(1, Math.floor(n / 2)));
    segment = weekFallback;
    currentSlice = rows.slice(-segment);
    priorSlice = rows.slice(-segment * 2, -segment);
    comparisonLabel = granularity === "week" ? `vs prior ${segment} wk` : `vs prior ${segment}d`;
  }

  if (priorSlice.length < 1) {
    const half = Math.max(1, Math.floor(n / 2));
    currentSlice = rows.slice(-half);
    priorSlice = rows.slice(0, n - half);
    comparisonLabel = "vs earlier in range";
  }

  const currentTotal = sumSlice(currentSlice);
  const priorTotal = sumSlice(priorSlice);

  let percent: number;
  if (priorTotal > 0) {
    percent = ((currentTotal - priorTotal) / priorTotal) * 100;
  } else if (currentTotal > 0) {
    percent = 100;
  } else {
    percent = 0;
  }

  return {
    percent: Math.round(percent * 10) / 10,
    currentTotal,
    priorTotal,
    comparisonLabel
  };
}

function formatVolumeDeltaPercent(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

type EngagementSlice = { name: string; value: number; fill: string };

function EngagementPieSideTooltip({
  active,
  payload,
  viewBox
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: EngagementSlice }>;
  viewBox?: { width?: number; height?: number };
}) {
  if (!active || !payload?.length) return null;
  const boxW = viewBox?.width ?? 280;
  const boxH = viewBox?.height ?? 208;
  const panelW = 92;
  const panelH = Math.min(88, 28 + payload.length * 22);
  const x = boxW - panelW - 4;
  const y = Math.max(6, (boxH - panelH) / 2);

  return (
    <foreignObject x={x} y={y} width={panelW} height={panelH} style={{ overflow: "visible", pointerEvents: "none" }}>
      <div
        style={{
          ...CHART_TOOLTIP_STYLE,
          padding: "8px 10px",
          fontSize: 11,
          lineHeight: 1.35,
          boxShadow: "0 4px 14px rgba(17,17,17,0.08)"
        }}
      >
        {payload.map((entry, index) => (
          <p
            key={String(entry.name)}
            className="tabular-nums"
            style={{ color: entry.payload?.fill ?? "#1F1B16", margin: index === 0 ? 0 : "6px 0 0" }}
          >
            <span className="font-semibold">{entry.name}</span>
            <br />
            {typeof entry.value === "number" ? `${entry.value} min` : "—"}
          </p>
        ))}
      </div>
    </foreignObject>
  );
}

/** Hide pie % labels on thin slices so the donut stays readable. */
const ENGAGEMENT_PIE_MIN_LABEL_PERCENT = 10;

function renderEngagementPiePercentLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  outerRadius = 0,
  percent = 0
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) {
  if (percent < ENGAGEMENT_PIE_MIN_LABEL_PERCENT / 100) {
    return null;
  }
  const RADIAN = Math.PI / 180;
  const angle = -midAngle * RADIAN;
  const outer = Number(outerRadius) || 0;
  const labelRadius = outer + 12;
  const x = cx + labelRadius * Math.cos(angle);
  const y = cy + labelRadius * Math.sin(angle);
  const cos = Math.cos(angle);
  let textAnchor: "start" | "middle" | "end" = "middle";
  if (cos > 0.2) textAnchor = "start";
  else if (cos < -0.2) textAnchor = "end";

  return (
    <text
      x={x}
      y={y}
      fill="#1F1B16"
      textAnchor={textAnchor}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
      fontFamily={CHART_FONT_FAMILY}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

function ServiceEngagementDonut({
  label,
  accentColor,
  totalMinutes,
  slices
}: {
  label: string;
  accentColor: string;
  totalMinutes: number;
  slices: EngagementSlice[];
}) {
  const hasSlices = slices.length > 0;
  const chartData: EngagementSlice[] = hasSlices
    ? slices
    : [{ name: "No activity", value: 1, fill: "#E0DDD6" }];

  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: accentColor }}>
        {label}
      </p>
      <div className="h-52 w-full max-w-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 12, right: 96, bottom: 12, left: 12 }}>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="42%"
              cy="50%"
              innerRadius="52%"
              outerRadius="72%"
              paddingAngle={hasSlices && slices.length > 1 ? 2 : 0}
              stroke="#FAF8F4"
              strokeWidth={2}
              label={hasSlices ? renderEngagementPiePercentLabel : false}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={entry.fill} fillOpacity={hasSlices ? 0.95 : 0.3} />
              ))}
            </Pie>
            {hasSlices ? (
              <Tooltip
                content={EngagementPieSideTooltip}
                cursor={false}
                isAnimationActive={false}
                wrapperStyle={{ outline: "none", zIndex: 20 }}
              />
            ) : null}
          </PieChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-faint">Total time</p>
      <p className="text-xl font-bold tabular-nums leading-none text-ink sm:text-2xl">
        {totalMinutes > 0 ? Math.round(totalMinutes * 10) / 10 : 0}
        <span className="ml-1 text-sm font-medium text-muted">min</span>
      </p>
    </div>
  );
}

function PromptVolumeAiToggleButton({
  label,
  color,
  pressed,
  disabled,
  onToggle
}: {
  label: string;
  color: string;
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
        pressed ? "bg-ink text-cream" : "border border-line text-faint hover:bg-cream-dark"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

type StatsChartHorizon = "instant" | "over_time";

function StatsChartHorizonToggle({
  value,
  onChange
}: {
  value: StatsChartHorizon;
  onChange: (value: StatsChartHorizon) => void;
}) {
  const options: Array<{ value: StatsChartHorizon; label: string }> = [
    { value: "instant", label: "Instant" },
    { value: "over_time", label: "Over time" }
  ];
  return (
    <div
      className="inline-flex shrink-0 rounded-lg border border-line bg-cream-dark p-0.5"
      role="tablist"
      aria-label="Chart view"
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
              selected ? "bg-ink text-cream" : "text-faint hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
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
          <XAxis type="number" stroke="#8A8A8A" tick={CHART_Y_TICK} />
          <YAxis dataKey="name" type="category" width={92} stroke="#8A8A8A" tick={CHART_Y_TICK_11} />
          <Tooltip contentStyle={CHART_TOOLTIP_DARK_STYLE} />
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
  const [ideStats, setIdeStats] = useState<IdeStatsPayload | null>(null);
  const [ideStatsLoading, setIdeStatsLoading] = useState(false);
  const [ideStatsError, setIdeStatsError] = useState("");
  const [selectedEmailsByTool, setSelectedEmailsByTool] = useState<SelectedEmailsByTool>({
    claude_code: new Set(),
    cursor: new Set(),
    codex: new Set()
  });
  const [promptVolumeAiFilters, setPromptVolumeAiFilters] =
    useState<PromptVolumeAiFilterState>(DEFAULT_PROMPT_VOLUME_AI_FILTERS);
  const [screenTimeView, setScreenTimeView] = useState<StatsChartHorizon>("instant");
  const [engagementView, setEngagementView] = useState<StatsChartHorizon>("instant");
  const [reportGenerating, setReportGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const ideStatsReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const placeholderStats = useMemo(
    () => buildPlaceholderExtendedStats(days, granularity),
    [days, granularity]
  );

  const placeholderIdeStats = useMemo(() => emptyIdeStats(days, granularity), [days, granularity]);

  const displayStats = user ? stats ?? placeholderStats : null;
  const displayIdeStats = user
    ? ideStats ?? (ideStatsLoading ? null : placeholderIdeStats)
    : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawHash = String(window.location.hash || "").replace(/^#/, "");
    if (!rawHash) return;
    const hashParams = new URLSearchParams(rawHash);
    const customToken = String(hashParams.get("promptly_ext_custom_token") || "").trim();
    if (!customToken) return;
    let cancelled = false;
    (async () => {
      try {
        await signInWithCustomToken(getFirebaseAuth(), customToken);
      } catch (_error) {
        // Ignore handoff failures; user can sign in manually on the account page.
      } finally {
        if (cancelled) return;
        hashParams.delete("promptly_ext_custom_token");
        const nextHash = hashParams.toString();
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ""}`;
        window.history.replaceState({}, "", nextUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const loadExtended = useCallback(async (current: User | null, d: number, g: "day" | "week", refresh = false) => {
    if (!current) {
      setStats(null);
      return;
    }
    setStatsLoading(true);
    setStatsError("");
    try {
      const token = await current.getIdToken(false);
      const params = new URLSearchParams({
        days: String(d),
        granularity: g
      });
      if (refresh) params.set("refresh", "1");
      const res = await fetch(`/api/account/stats/extended?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setStats(data as ExtendedStatsPayload);
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      setStatsError(
        /RESOURCE_EXHAUSTED|Quota exceeded/i.test(raw)
          ? "Firestore daily read limit reached. Try a shorter date range or refresh after the quota resets."
          : raw
      );
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadIdeStats = useCallback(
    async (
      current: User | null,
      d: number,
      g: "day" | "week",
      emailSelection: SelectedEmailsByTool,
      availableByTool?: Record<IdeToolKey, string[]>,
      refresh = false
    ) => {
    if (!current) {
      setIdeStats(null);
      return;
    }
    setIdeStatsLoading(true);
    setIdeStatsError("");
    try {
      const token = await current.getIdToken(false);
      const params = new URLSearchParams({
        days: String(d),
        granularity: g
      });
      if (refresh) params.set("refresh", "1");
      appendIdeEmailFilterParams(params, emailSelection, availableByTool);
      const res = await fetch(`/api/account/stats/ide?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setIdeStats(data as IdeStatsPayload);
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      setIdeStatsError(
        /RESOURCE_EXHAUSTED|Quota exceeded/i.test(raw)
          ? "Firestore daily read limit reached. Try a shorter date range or refresh after the quota resets."
          : raw
      );
    } finally {
      setIdeStatsLoading(false);
    }
  },
    []
  );

  const scheduleIdeStatsReload = useCallback(
    (
      emailSelection: SelectedEmailsByTool,
      availableByTool?: Record<IdeToolKey, string[]>,
      refresh = false
    ) => {
      if (!user) return;
      if (ideStatsReloadTimerRef.current) {
        clearTimeout(ideStatsReloadTimerRef.current);
      }
      ideStatsReloadTimerRef.current = setTimeout(() => {
        ideStatsReloadTimerRef.current = null;
        void loadIdeStats(user, days, granularity, emailSelection, availableByTool, refresh);
      }, 300);
    },
    [user, days, granularity, loadIdeStats]
  );

  const toggleAgentEmail = useCallback((tool: IdeToolKey, email: string) => {
    setSelectedEmailsByTool((prev) => {
      const current = new Set(prev[tool]);
      if (current.has(email)) {
        current.delete(email);
      } else {
        current.add(email);
      }
      const next = { ...prev, [tool]: current };
      scheduleIdeStatsReload(next, ideStats?.agent_emails_by_tool);
      return next;
    });
  }, [scheduleIdeStatsReload, ideStats?.agent_emails_by_tool]);

  useEffect(() => {
    return () => {
      if (ideStatsReloadTimerRef.current) {
        clearTimeout(ideStatsReloadTimerRef.current);
      }
    };
  }, []);

  const refreshAllStats = useCallback(() => {
    if (!user) return;
    void loadExtended(user, days, granularity, true);
    void loadIdeStats(user, days, granularity, selectedEmailsByTool, ideStats?.agent_emails_by_tool, true);
  }, [user, days, granularity, selectedEmailsByTool, ideStats?.agent_emails_by_tool, loadExtended, loadIdeStats]);

  useEffect(() => {
    setSelectedEmailsByTool({
      claude_code: new Set(),
      cursor: new Set(),
      codex: new Set()
    });
  }, [days, granularity]);

  useEffect(() => {
    if (!ideStats?.agent_emails_by_tool) return;
    setSelectedEmailsByTool((prev) => {
      let changed = false;
      const next: SelectedEmailsByTool = {
        claude_code: new Set(prev.claude_code),
        cursor: new Set(prev.cursor),
        codex: new Set(prev.codex)
      };
      for (const agent of IDE_AGENT_CARDS) {
        const available = ideStats.agent_emails_by_tool[agent.key] ?? [];
        if (!available.length) continue;
        if (!next[agent.key].size) {
          next[agent.key] = new Set(available);
          changed = true;
          continue;
        }
        for (const email of available) {
          if (!next[agent.key].has(email)) {
            next[agent.key].add(email);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [ideStats?.agent_emails_by_tool]);

  useEffect(() => {
    if (!user || loading) return;
    void loadExtended(user, days, granularity);
    void loadIdeStats(user, days, granularity, {
      claude_code: new Set(),
      cursor: new Set(),
      codex: new Set()
    });
  }, [user, loading, days, granularity, loadExtended, loadIdeStats]);

  const stackedTimeline = useMemo((): Array<PromptVolumeChartBucket & { label: string }> => {
    const webTimeline = displayStats?.combined_prompt_timeline ?? [];
    const ideRows = displayIdeStats?.prompt_timeline ?? [];
    if (!webTimeline.length && !ideRows.length) return [];
    const g = displayStats?.granularity ?? displayIdeStats?.granularity ?? granularity;
    return mergePromptVolumeTimelines(webTimeline, ideRows).map((row) => ({
      ...row,
      label: g === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket)
    }));
  }, [displayStats, displayIdeStats, granularity]);

  const promptVolumeChartRows = useMemo(() => {
    const totals = stackedTimeline.map((row) => promptVolumeBucketTotal(row, promptVolumeAiFilters));
    const trend = smoothTrendValues(totals);
    return stackedTimeline.map((row, index) => ({
      ...row,
      volume_total: totals[index] ?? 0,
      volume_trend: trend[index] ?? 0
    }));
  }, [stackedTimeline, promptVolumeAiFilters]);

  const promptVolumePeriodChange = useMemo(
    () =>
      computePromptVolumePeriodChange(
        stackedTimeline,
        days,
        displayStats?.granularity ?? granularity,
        promptVolumeAiFilters
      ),
    [stackedTimeline, days, displayStats?.granularity, granularity, promptVolumeAiFilters]
  );

  const promptVolumeAiEnabledCount = useMemo(
    () => PROMPT_VOLUME_AI_FILTERS.filter((f) => promptVolumeAiFilters[f.key]).length,
    [promptVolumeAiFilters]
  );

  const togglePromptVolumeAiFilter = useCallback((key: PromptVolumeAiKey) => {
    setPromptVolumeAiFilters((prev) => {
      if (prev[key] && PROMPT_VOLUME_AI_FILTERS.filter((f) => prev[f.key]).length <= 1) {
        return prev;
      }
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  const idePromptTimeline = useMemo(() => {
    if (!displayIdeStats?.prompt_timeline) return [];
    const g = displayIdeStats.granularity;
    return displayIdeStats.prompt_timeline.map((row) => ({
      ...row,
      label: g === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket)
    }));
  }, [displayIdeStats]);

  const ideScreenTimeline = useMemo(() => {
    if (!displayIdeStats?.screen_time_timeline) return [];
    const g = displayIdeStats.granularity;
    return displayIdeStats.screen_time_timeline.map((row) => ({
      ...row,
      label: g === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket)
    }));
  }, [displayIdeStats]);

  const ideHasActivity = useMemo(() => {
    if (!displayIdeStats) return false;
    const p = displayIdeStats.totals.prompts;
    return p.claude_code + p.cursor + p.codex > 0;
  }, [displayIdeStats]);

  const ideConnectionByTool = useMemo(() => {
    const map = new Map<string, { device_count: number; last_seen_at_ms: number | null }>();
    for (const row of displayIdeStats?.connected_tools ?? []) {
      map.set(row.tool, {
        device_count: row.device_count,
        last_seen_at_ms: row.last_seen_at_ms
      });
    }
    return map;
  }, [displayIdeStats]);

  const ideAnyConnected = useMemo(() => {
    return IDE_AGENT_CARDS.some((agent) => (ideConnectionByTool.get(agent.key)?.device_count ?? 0) > 0);
  }, [ideConnectionByTool]);

  const ideModelsByTool = useMemo(() => {
    const rows = displayIdeStats?.model_buckets ?? [];
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = grouped.get(row.tool) ?? [];
      list.push(row);
      grouped.set(row.tool, list);
    }
    for (const [tool, list] of grouped) {
      grouped.set(
        tool,
        [...list].sort((a, b) => b.prompts - a.prompts || formatIdeModelLabel(a).localeCompare(formatIdeModelLabel(b)))
      );
    }
    return grouped;
  }, [displayIdeStats]);

  const ideHasKnownModels = useMemo(() => {
    return (displayIdeStats?.model_buckets ?? []).some(
      (row) => row.prompts > 0 && row.bucket !== "unknown" && row.bucket !== "test-send"
    );
  }, [displayIdeStats]);

  const ideEngagementByToolRows = useMemo(() => {
    const byTool = displayIdeStats?.totals.engagement_minutes_by_tool;
    if (!byTool) return [];
    return IDE_AGENT_CARDS.map((agent) => {
      const row = byTool[agent.key];
      const drafting = row?.drafting ?? 0;
      const waiting = row?.waiting ?? 0;
      const reading = row?.reading_idle ?? 0;
      return {
        agent: agent.label,
        key: agent.key,
        drafting,
        waiting,
        reading,
        has_data: drafting + waiting + reading > 0
      };
    }).filter((row) => row.has_data);
  }, [displayIdeStats]);

  const ideAvgWordsChartRows = useMemo(() => {
    return (displayIdeStats?.model_buckets ?? [])
      .filter(
        (row) =>
          row.word_samples > 0 &&
          row.bucket !== "unknown" &&
          row.bucket !== "test-send" &&
          (row.avg_words ?? 0) > 0
      )
      .slice(0, 10)
      .map((row) => ({
        label: formatIdeModelLabel(row),
        tool: IDE_AGENT_LABELS[row.tool] ?? row.tool,
        avg_words: row.avg_words ?? 0,
        key: `${row.tool}:${row.bucket}`
      }));
  }, [displayIdeStats]);

  const ideDraftResponseChartRows = useMemo(() => {
    return IDE_AGENT_CARDS.map((agent) => {
      const draft = displayIdeStats?.draft_timing_by_tool?.[agent.key];
      const response = displayIdeStats?.response_latency_by_tool?.[agent.key];
      const avgDraftS =
        typeof draft?.avg_draft_ms === "number" ? Math.round((draft.avg_draft_ms / 1000) * 10) / 10 : null;
      const avgResponseS =
        typeof response?.avg_ms === "number" ? Math.round((response.avg_ms / 1000) * 10) / 10 : null;
      return {
        agent: agent.label,
        key: agent.key,
        avg_draft_s: avgDraftS ?? 0,
        avg_response_s: avgResponseS ?? 0,
        draft_missing: avgDraftS === null,
        response_missing: avgResponseS === null,
        has_data: (draft?.samples ?? 0) > 0 || (response?.samples ?? 0) > 0
      };
    }).filter((row) => row.has_data);
  }, [displayIdeStats]);

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

  const screenTimeByServiceRows = useMemo(() => {
    const rows: Array<{ service: string; key: string; minutes: number; fill: string }> = [];
    if (displayStats?.screen_time_by_service) {
      for (const serviceKey of ["chatgpt", "claude", "gemini"] as const) {
        if (!promptVolumeAiFilters[serviceKey]) continue;
        const row = displayStats.screen_time_by_service[serviceKey] ?? EMPTY_SERVICE_SCREEN_TIME;
        rows.push({
          service: svcLabel(serviceKey),
          key: serviceKey,
          minutes: row.total_minutes,
          fill:
            serviceKey === "chatgpt"
              ? COLOR_CHATGPT_WEB
              : serviceKey === "claude"
                ? COLOR_CLAUDE_WEB
                : COLOR_GEMINI_WEB
        });
      }
    }
    const ideScreen = displayIdeStats?.totals.screen_time_minutes;
    if (ideScreen) {
      const agents: Array<{ key: IdeToolKey; label: string; color: string }> = [
        { key: "claude_code", label: "Claude Code", color: COLOR_CLAUDE_CODE },
        { key: "cursor", label: "Cursor", color: COLOR_CURSOR },
        { key: "codex", label: "Codex", color: COLOR_CODEX }
      ];
      for (const agent of agents) {
        if (!promptVolumeAiFilters[agent.key]) continue;
        rows.push({
          service: agent.label,
          key: agent.key,
          minutes: ideScreen[agent.key] ?? 0,
          fill: agent.color
        });
      }
    }
    return [...rows].sort((a, b) => b.minutes - a.minutes || a.service.localeCompare(b.service));
  }, [displayStats, displayIdeStats, promptVolumeAiFilters]);

  const screenTimeByServiceChartHasData = useMemo(
    () => screenTimeByServiceRows.some((row) => row.minutes > 0),
    [screenTimeByServiceRows]
  );

  const screenTimeByServiceSectionHeight = Math.max(120, screenTimeByServiceRows.length * 44 + 24);
  const screenTimeServiceLabelWidth = screenTimeByServiceRows.some((row) => row.service.includes("(Web)"))
    ? 108
    : 88;

  const engagementByServicePies = useMemo(() => {
    const pies: Array<{
      key: string;
      label: string;
      accent: string;
      totalMinutes: number;
      slices: EngagementSlice[];
      hasData: boolean;
    }> = [];

    if (displayStats?.screen_time_by_service) {
      const webServices: Array<{
        key: "chatgpt" | "claude" | "gemini";
        filterKey: PromptVolumeAiKey;
        accent: string;
      }> = [
        { key: "chatgpt", filterKey: "chatgpt", accent: COLOR_CHATGPT_WEB },
        { key: "claude", filterKey: "claude", accent: COLOR_CLAUDE_WEB },
        { key: "gemini", filterKey: "gemini", accent: COLOR_GEMINI_WEB }
      ];
      for (const svc of webServices) {
        if (!promptVolumeAiFilters[svc.filterKey]) continue;
        const row = displayStats.screen_time_by_service[svc.key] ?? EMPTY_SERVICE_SCREEN_TIME;
        const slices: EngagementSlice[] = [
          { name: "Drafting prompt", value: row.drafting_minutes, fill: COLOR_DRAFTING },
          { name: "Waiting for AI", value: row.waiting_minutes, fill: COLOR_NATIVE_WEB },
          { name: "Reading output", value: row.reading_idle_minutes, fill: COLOR_READING_IDLE }
        ].filter((slice) => slice.value > 0);
        const totalMinutes =
          row.total_minutes > 0 ? row.total_minutes : slices.reduce((sum, slice) => sum + slice.value, 0);
        pies.push({
          key: svc.key,
          label: svcLabel(svc.key),
          accent: svc.accent,
          totalMinutes,
          slices,
          hasData: totalMinutes > 0
        });
      }
    }

    const ideEngagement = displayIdeStats?.totals.engagement_minutes_by_tool;
    if (ideEngagement) {
      const agents: Array<{ key: IdeToolKey; label: string; accent: string; filterKey: PromptVolumeAiKey }> = [
        { key: "claude_code", label: "Claude Code", accent: COLOR_CLAUDE_CODE, filterKey: "claude_code" },
        { key: "cursor", label: "Cursor", accent: COLOR_CURSOR, filterKey: "cursor" },
        { key: "codex", label: "Codex", accent: COLOR_CODEX, filterKey: "codex" }
      ];
      for (const agent of agents) {
        if (!promptVolumeAiFilters[agent.filterKey]) continue;
        const row = ideEngagement[agent.key];
        if (!row) continue;
        const slices: EngagementSlice[] = [
          { name: "Drafting prompt", value: row.drafting, fill: COLOR_DRAFTING },
          { name: "Waiting for AI", value: row.waiting, fill: COLOR_NATIVE_WEB },
          { name: "Reading output", value: row.reading_idle, fill: COLOR_READING_IDLE }
        ].filter((slice) => slice.value > 0);
        const totalMinutes = slices.reduce((sum, slice) => sum + slice.value, 0);
        pies.push({
          key: agent.key,
          label: agent.label,
          accent: agent.accent,
          totalMinutes,
          slices,
          hasData: totalMinutes > 0
        });
      }
    }

    return pies
      .filter((pie) => pie.hasData)
      .sort((a, b) => b.totalMinutes - a.totalMinutes || a.label.localeCompare(b.label));
  }, [displayStats, displayIdeStats, promptVolumeAiFilters]);

  const includeWebEngagementTimeline = useMemo(
    () => (["chatgpt", "claude", "gemini"] as const).some((key) => promptVolumeAiFilters[key]),
    [promptVolumeAiFilters]
  );

  const includeIdeEngagementTimeline = useMemo(
    () => (["claude_code", "cursor", "codex"] as const).some((key) => promptVolumeAiFilters[key]),
    [promptVolumeAiFilters]
  );

  const screenTimeOverTimeChartRows = useMemo(() => {
    const web = displayStats?.screen_time_timeline ?? [];
    const ide = displayIdeStats?.screen_time_timeline ?? [];
    if (!web.length && !ide.length) return [];
    const g = displayStats?.granularity ?? displayIdeStats?.granularity ?? granularity;
    return mergeScreenTimeTimelines(web, ide).map((row) => ({
      ...row,
      label: g === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket),
      has_data: SCREEN_TIME_OVER_TIME_FILTERS.some(
        (filter) =>
          promptVolumeAiFilters[filter.key] && (row[SCREEN_TIME_TIMELINE_KEY[filter.key]] ?? 0) > 0
      )
    }));
  }, [displayStats, displayIdeStats, granularity, promptVolumeAiFilters]);

  const screenTimeOverTimeHasData = useMemo(
    () => screenTimeOverTimeChartRows.some((row) => row.has_data),
    [screenTimeOverTimeChartRows]
  );

  const engagementOverTimeChartRows = useMemo(() => {
    const web = displayStats?.screen_time_timeline ?? [];
    const ide = displayIdeStats?.screen_time_timeline ?? [];
    if ((!web.length && !ide.length) || (!includeWebEngagementTimeline && !includeIdeEngagementTimeline)) {
      return [];
    }
    const g = displayStats?.granularity ?? displayIdeStats?.granularity ?? granularity;
    return mergeEngagementTimelines(
      web,
      ide,
      includeWebEngagementTimeline,
      includeIdeEngagementTimeline
    ).map((row) => ({
      ...row,
      label: g === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket),
      has_data: row.drafting + row.waiting + row.reading_idle > 0
    }));
  }, [
    displayStats,
    displayIdeStats,
    granularity,
    includeWebEngagementTimeline,
    includeIdeEngagementTimeline
  ]);

  const engagementOverTimeHasData = useMemo(
    () => engagementOverTimeChartRows.some((row) => row.has_data),
    [engagementOverTimeChartRows]
  );

  const engagementByServiceEnabledCount = useMemo(() => {
    return PROMPT_VOLUME_AI_FILTERS.filter((f) => promptVolumeAiFilters[f.key]).length;
  }, [promptVolumeAiFilters]);

  const ideScreenTimeHasData = useMemo(() => {
    const st = displayIdeStats?.totals.screen_time_minutes;
    if (!st) return false;
    return st.claude_code + st.cursor + st.codex > 0;
  }, [displayIdeStats]);

  const ideEngagementHasData = useMemo(() => {
    const byTool = displayIdeStats?.totals.engagement_minutes_by_tool;
    if (!byTool) return false;
    return (["claude_code", "cursor", "codex"] as const).some((key) => {
      const row = byTool[key];
      return row && row.drafting + row.waiting + row.reading_idle > 0;
    });
  }, [displayIdeStats]);

  const engagementSpendHasData = useMemo(
    () =>
      engagementByServicePies.length > 0 ||
      engagementOverTimeHasData ||
      (displayStats?.engagement_totals?.segment_count ?? 0) > 0,
    [engagementByServicePies, engagementOverTimeHasData, displayStats]
  );

  const screenTimeHasData = useMemo(
    () =>
      (displayStats?.engagement_totals?.segment_count ?? 0) > 0 ||
      screenTimeByServiceChartHasData ||
      screenTimeOverTimeHasData ||
      engagementSpendHasData ||
      ideScreenTimeHasData ||
      ideEngagementHasData,
    [
      displayStats,
      screenTimeByServiceChartHasData,
      screenTimeOverTimeHasData,
      engagementSpendHasData,
      ideScreenTimeHasData,
      ideEngagementHasData
    ]
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

  const preImproveWordChartRows = useMemo(() => {
    if (!displayStats?.pre_improve_word_timeline?.length) return [];
    const g = displayStats.granularity;
    return displayStats.pre_improve_word_timeline
      .map((row) => {
        const before = typeof row.avg_words_before === "number" ? row.avg_words_before : null;
        const after = typeof row.avg_words_after === "number" ? row.avg_words_after : null;
        return {
          ...row,
          label: g === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket),
          avg_words_before_display: before ?? 0,
          avg_words_after_display: after ?? 0,
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

  const reportTotalScreenTimeMinutes = useMemo(() => {
    if (!displayStats?.screen_time_by_service) return 0;
    const services: Array<{ key: PromptlySvc; on: boolean }> = [
      { key: "chatgpt", on: promptVolumeAiFilters.chatgpt },
      { key: "claude", on: promptVolumeAiFilters.claude },
      { key: "gemini", on: promptVolumeAiFilters.gemini },
      { key: "unknown", on: promptVolumeAiFilters.other }
    ];
    return services.reduce((sum, svc) => {
      if (!svc.on) return sum;
      return sum + (displayStats.screen_time_by_service[svc.key]?.total_minutes ?? 0);
    }, 0);
  }, [displayStats, promptVolumeAiFilters]);

  const statisticsReportData = useMemo(() => {
    if (!displayStats || !user) return null;
    const engagement = displayStats.engagement_totals ?? {
      drafting_minutes: 0,
      waiting_minutes: 0,
      reading_idle_minutes: 0,
      segment_count: 0
    };
    return buildStatisticsReportData({
      userName: user.displayName?.trim() || user.email || "Promptly user",
      userEmail: user.email || "—",
      days,
      granularity: displayStats.granularity ?? granularity,
      filters: promptVolumeAiFilters,
      promptVolumeChange: promptVolumePeriodChange,
      combinedTotals: displayStats.combined_totals,
      engagementTotals: {
        drafting_minutes: engagement.drafting_minutes,
        waiting_minutes: engagement.waiting_minutes,
        reading_idle_minutes: engagement.reading_idle_minutes
      },
      totalScreenTimeMinutes: reportTotalScreenTimeMinutes,
      screenTimeRows: screenTimeByServiceRows.map((row) => ({
        label: row.service,
        minutes: row.minutes,
        color: row.fill
      })),
      timelineRows: stackedTimeline.map((row) => ({
        label: row.label,
        prompts_chatgpt: row.prompts_chatgpt,
        prompts_claude: row.prompts_claude,
        prompts_gemini: row.prompts_gemini,
        prompts_unknown: row.prompts_unknown
      }))
    });
  }, [
    displayStats,
    user,
    days,
    granularity,
    promptVolumeAiFilters,
    promptVolumePeriodChange,
    reportTotalScreenTimeMinutes,
    screenTimeByServiceRows,
    stackedTimeline
  ]);

  const handlePrintReport = useCallback(async () => {
    if (!reportRef.current || !statisticsReportData || reportGenerating) return;
    setReportGenerating(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadStatisticsReportPdf(
        reportRef.current,
        `promptly-prompt-report-${days}d-${stamp}.pdf`
      );
    } catch (e) {
      console.error("Failed to generate statistics report PDF", e);
    } finally {
      setReportGenerating(false);
    }
  }, [statisticsReportData, reportGenerating, days]);

  return (
    <div className="statistics-charts mx-auto w-full max-w-6xl px-4 py-6 pb-16">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-ink">AI Statistics</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/account"
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-cream-dark sm:text-sm"
          >
            Back to account
          </Link>
          <button
            type="button"
            disabled={!user || !statisticsReportData || statsLoading || reportGenerating}
            onClick={() => void handlePrintReport()}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream-dark disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            {reportGenerating ? "Preparing report…" : "Print Report"}
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
              <div
                className="hidden h-5 w-px shrink-0 bg-line sm:block"
                aria-hidden
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-faint">Show</span>
                {PROMPT_VOLUME_AI_FILTERS.map((filter) => (
                  <PromptVolumeAiToggleButton
                    key={filter.key}
                    label={filter.label}
                    color={filter.color}
                    pressed={promptVolumeAiFilters[filter.key]}
                    disabled={
                      promptVolumeAiFilters[filter.key] && promptVolumeAiEnabledCount <= 1
                    }
                    onToggle={() => togglePromptVolumeAiFilter(filter.key)}
                  />
                ))}
              </div>
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
                disabled={statsLoading || ideStatsLoading || !user}
                onClick={refreshAllStats}
                className="rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:bg-cream-dark disabled:opacity-50"
              >
                {statsLoading || ideStatsLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {statsError ? (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{statsError}</div>
          ) : null}

          {displayStats?.quota_exceeded || displayIdeStats?.quota_exceeded ? (
            <div className="mb-4 rounded-xl border border-amber-300/60 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
              Firestore returned a quota error, so some charts may be incomplete. On Blaze this is usually a
              temporary rate limit, billing not active on the production project (
              <strong>promptly-prod-976ef</strong>
              ), or the wrong Firebase project was upgraded. Check Firebase Console → Usage and billing for that
              project, then try Refresh or a shorter date range.
            </div>
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
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Prompt volume</h2>
              {promptVolumePeriodChange ? (
                <p
                  className="text-right text-lg font-semibold tabular-nums leading-none sm:text-xl"
                  style={{
                    color:
                      promptVolumePeriodChange.percent > 0
                        ? COLOR_SCORE_GREEN
                        : promptVolumePeriodChange.percent < 0
                          ? COLOR_VOLUME_DELTA_DOWN
                          : "#111111"
                  }}
                  title={promptVolumePeriodChange.comparisonLabel}
                >
                  {formatVolumeDeltaPercent(promptVolumePeriodChange.percent)}
                </p>
              ) : null}
            </div>
            <div className="h-72 w-full sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={promptVolumeChartRows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                  <YAxis stroke="#8A8A8A" allowDecimals={false} width={32} tick={CHART_Y_TICK} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const items = payload.filter((entry) => entry.dataKey !== "volume_trend");
                      if (!items.length) return null;
                      return (
                        <div style={CHART_TOOLTIP_STYLE}>
                          {label ? (
                            <p className="mb-1.5 text-xs font-semibold text-ink">{label}</p>
                          ) : null}
                          <div className="space-y-1">
                            {items.map((entry) => (
                              <p
                                key={String(entry.dataKey)}
                                className="text-xs tabular-nums"
                                style={{ color: entry.color ?? "#1F1B16" }}
                              >
                                {entry.name}: {entry.value}
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                  {PROMPT_VOLUME_AI_FILTERS.filter((f) => promptVolumeAiFilters[f.key]).map((filter, index, visible) => (
                    <Bar
                      key={filter.dataKey}
                      dataKey={filter.dataKey}
                      name={filter.legendName}
                      stackId="stack"
                      fill={filter.color}
                      radius={
                        index === visible.length - 1 ? ([2, 2, 0, 0] as [number, number, number, number]) : undefined
                      }
                    />
                  ))}
                  {promptVolumeChartRows.length >= 2 ? (
                    <Line
                      type="natural"
                      dataKey="volume_trend"
                      name="Trend"
                      legendType="none"
                      stroke={COLOR_VOLUME_TREND}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  ) : null}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {screenTimeHasData ? (
            <>
              <section className="mb-8 w-full rounded-2xl border border-line bg-cream p-3 shadow-card sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Screen time by service</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatsChartHorizonToggle value={screenTimeView} onChange={setScreenTimeView} />
                    <p className="text-xs font-medium tabular-nums text-muted">Last {days} days</p>
                  </div>
                </div>
                <p className="mb-3 text-[11px] text-faint">
                  {screenTimeView === "instant"
                    ? "Total foreground minutes in the selected range — filtered by Show above."
                    : "Stacked minutes by service or agent over time — filtered by Show above."}
                </p>
                {screenTimeByServiceRows.length ? (
                  screenTimeView === "over_time" ? (
                    screenTimeOverTimeHasData ? (
                      <div className="h-72 w-full sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={screenTimeOverTimeChartRows}
                            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                            <YAxis stroke="#8A8A8A" allowDecimals={false} width={32} tick={CHART_Y_TICK} unit=" min" />
                            <Tooltip
                              cursor={{ fill: "rgba(255,255,255,0.04)" }}
                              contentStyle={CHART_TOOLTIP_STYLE}
                              formatter={(value: number, name: string) => [`${value} min`, name]}
                            />
                            <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                            {SCREEN_TIME_OVER_TIME_FILTERS.filter((f) => promptVolumeAiFilters[f.key]).map(
                              (filter, index, visible) => (
                                <Bar
                                  key={filter.key}
                                  dataKey={SCREEN_TIME_TIMELINE_KEY[filter.key]}
                                  name={filter.legendName}
                                  stackId="screen_time"
                                  fill={filter.color}
                                  radius={
                                    index === visible.length - 1
                                      ? ([2, 2, 0, 0] as [number, number, number, number])
                                      : undefined
                                  }
                                />
                              )
                            )}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">No screen time over time for the selected services in this range yet.</p>
                    )
                  ) : screenTimeByServiceChartHasData ? (
                    <div className="w-full" style={{ height: screenTimeByServiceSectionHeight }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={screenTimeByServiceRows}
                          layout="vertical"
                          margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                          barCategoryGap="12%"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                          <XAxis type="number" stroke="#8A8A8A" tick={CHART_Y_TICK} unit=" min" />
                          <YAxis
                            type="category"
                            dataKey="service"
                            stroke="#8A8A8A"
                            tick={CHART_Y_TICK_11}
                            width={screenTimeServiceLabelWidth}
                            reversed
                          />
                          <Tooltip
                            contentStyle={CHART_TOOLTIP_STYLE}
                            formatter={(value: number) => [`${value} min`, "Screen time"]}
                          />
                          <Bar dataKey="minutes" name="Screen time" radius={[0, 4, 4, 0]} barSize={18}>
                            {screenTimeByServiceRows.map((entry) => (
                              <Cell key={entry.key} fill={entry.fill} fillOpacity={0.95} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No screen time for the selected services in this range yet.</p>
                  )
                ) : (
                  <p className="text-sm text-muted">Turn on at least one service or agent under Show to view screen time.</p>
                )}
              </section>

              <section className="mb-8 w-full rounded-2xl border border-line bg-cream p-3 shadow-card sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">How you spend your time</h2>
                  <StatsChartHorizonToggle value={engagementView} onChange={setEngagementView} />
                </div>
                {engagementView === "over_time" ? (
                  engagementOverTimeHasData ? (
                    <>
                      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
                        {ENGAGEMENT_OVER_TIME_SERIES.map((series) => (
                          <span key={series.dataKey} className="inline-flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: series.color }} />
                            {series.name}
                          </span>
                        ))}
                      </div>
                      <div className="h-72 w-full sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={engagementOverTimeChartRows}
                            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                            <YAxis stroke="#8A8A8A" allowDecimals={false} width={32} tick={CHART_Y_TICK} unit=" min" />
                            <Tooltip
                              cursor={{ fill: "rgba(255,255,255,0.04)" }}
                              contentStyle={CHART_TOOLTIP_STYLE}
                              formatter={(value: number, name: string) => [`${value} min`, name]}
                            />
                            <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                            {ENGAGEMENT_OVER_TIME_SERIES.map((series, index) => (
                              <Bar
                                key={series.dataKey}
                                dataKey={series.dataKey}
                                name={series.name}
                                stackId="engagement"
                                fill={series.color}
                                radius={
                                  index === ENGAGEMENT_OVER_TIME_SERIES.length - 1
                                    ? ([2, 2, 0, 0] as [number, number, number, number])
                                    : undefined
                                }
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  ) : engagementByServiceEnabledCount > 0 ? (
                    <p className="text-sm text-muted">No engagement breakdown over time for the selected services yet.</p>
                  ) : (
                    <p className="text-sm text-muted">Turn on at least one service under Show to view how you spend time.</p>
                  )
                ) : engagementByServicePies.length > 0 ? (
                  <>
                    <div className="mb-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLOR_DRAFTING }} />
                        Drafting prompt
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLOR_NATIVE_WEB }} />
                        Waiting for AI
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLOR_READING_IDLE }} />
                        Reading output
                      </span>
                    </div>
                    <div
                      className={`grid gap-8 ${
                        engagementByServicePies.length === 1
                          ? "grid-cols-1 max-w-xs mx-auto"
                          : engagementByServicePies.length === 2
                            ? "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto"
                            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                      }`}
                    >
                      {engagementByServicePies.map((pie) => (
                        <ServiceEngagementDonut
                          key={pie.key}
                          label={pie.label}
                          accentColor={pie.accent}
                          totalMinutes={pie.totalMinutes}
                          slices={pie.slices}
                        />
                      ))}
                    </div>
                  </>
                ) : engagementByServiceEnabledCount > 0 ? (
                  <p className="text-sm text-muted">No engagement breakdown for the selected services in this range yet.</p>
                ) : (
                  <p className="text-sm text-muted">Turn on at least one service under Show to view how you spend time.</p>
                )}
              </section>
            </>
          ) : (
            <section className="mb-8 w-full rounded-2xl border border-line bg-cream p-4 shadow-card sm:p-5">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.22em] text-faint">Screen time</h2>
              <p className="text-sm text-muted">
                Screen time tracking starts with the latest extension or coding-agent plugins. Use ChatGPT, Claude, or
                Gemini in the browser, or Claude Code, Cursor, and Codex in the IDE while signed in to see time by
                service and how you spend it (drafting, waiting, reading).
              </p>
            </section>
          )}

          {timeBalanceHasData ? (
            <section className="mb-8 w-full rounded-2xl border border-line bg-cream p-3 shadow-card sm:p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Writing vs waiting for AI</h2>
                {displayStats.time_balance_totals ? (
                  <p className="text-right text-xs font-medium tabular-nums text-muted">
                    Avg/send:{" "}
                    {displayStats.time_balance_totals.draft_active_minutes != null
                      ? `${displayStats.time_balance_totals.draft_active_minutes} min draft`
                      : "— draft"}
                    {" · "}
                    {displayStats.time_balance_totals.waiting_for_ai_minutes != null
                      ? `${displayStats.time_balance_totals.waiting_for_ai_minutes} min wait`
                      : "— wait"}
                  </p>
                ) : null}
              </div>
              <div className="h-72 w-full sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeBalanceChartRows.filter((r) => r.has_data)} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                    <YAxis
                      stroke="#8A8A8A"
                      tick={CHART_Y_TICK_11}
                      allowDecimals
                      label={CHART_AXIS_LABEL("Avg min / send")}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number, name: string) => {
                        if (typeof value !== "number" || value <= 0) return ["—", name];
                        return [`${value} min`, name];
                      }}
                    />
                    <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                    <Bar dataKey="avg_draft_minutes" name="Avg drafting" fill="#c084fc" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="avg_waiting_minutes" name="Avg waiting for AI" fill={COLOR_NATIVE_WEB} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          <section className="mb-8 w-full rounded-2xl border border-violet-200/80 bg-cream p-4 shadow-card sm:p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Coding agents</h2>
                <p className="mt-1 text-xs text-muted">
                  Claude Code, Cursor, and Codex — also included in the charts above; details below.
                </p>
              </div>
              <Link
                href="/integrations"
                className="text-xs font-medium text-violet-700 underline hover:text-violet-900"
              >
                Install & connect
              </Link>
            </div>

            {ideStatsError ? (
              <p className="mb-4 text-sm text-red-700">{ideStatsError}</p>
            ) : null}

            <div className="mb-5 rounded-xl border border-violet-200/80 bg-violet-50/40 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink">
                One Promptly account per computer
              </h3>
              <p className="mt-1 max-w-2xl text-[11px] text-muted">
                Pair Claude Code, Cursor, and Codex on{" "}
                <Link href="/integrations" className="font-medium text-violet-900 underline">
                  integrations
                </Link>{" "}
                while signed into the Promptly account you want here ({user?.email || "sign in above"}). The first
                agent you pair on a computer becomes the account all agents on that machine send stats to — even if
                Cursor, Codex, or Claude Code themselves use different login emails.
              </p>
              {user?.email ? (
                <p className="mt-2 text-[10px] text-muted">
                  Viewing stats as <span className="font-medium text-ink">{user.email}</span>. If coding-agent stats
                  look                   empty, pair agents with this same account or run the fix command from{" "}
                  <Link href="/admin/integrations" className="font-medium text-violet-900 underline">
                    admin integrations
                  </Link>
                  .
                </p>
              ) : null}
            </div>

            {ideStatsLoading && !ideStats ? (
              <p className="text-sm text-muted">Loading coding-agent statistics…</p>
            ) : null}

            <div className="mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink">Connected coding agents</h3>
              <p className="mt-1 text-[11px] text-muted">
                Pairing status for Claude Code, Cursor, and Codex on your Promptly account.
              </p>
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              {IDE_AGENT_CARDS.map((agent) => {
                const conn = ideConnectionByTool.get(agent.key);
                const paired = (conn?.device_count ?? 0) > 0;
                const prompts = displayIdeStats?.totals.prompts[agent.key] ?? 0;
                const active = paired || prompts > 0;
                const latency = displayIdeStats?.response_latency_by_tool?.[agent.key];
                return (
                  <div
                    key={agent.key}
                    className={`rounded-xl border p-3 ${
                      active ? "border-emerald-300/80 bg-emerald-50/60" : "border-line bg-white/70"
                    }`}
                  >
                    <p className="text-[11px] font-medium uppercase text-faint">{agent.label}</p>
                    <p className={`mt-1 text-sm font-semibold ${active ? "text-emerald-900" : "text-muted"}`}>
                      {paired ? "Paired" : prompts > 0 ? "Receiving prompts" : "Not paired"}
                    </p>
                    {paired ? (
                      <p className="mt-1 text-[10px] text-muted">
                        Last sync {formatIdeLastSeen(conn?.last_seen_at_ms)}
                        {conn && conn.device_count > 1 ? ` · ${conn.device_count} devices` : null}
                      </p>
                    ) : (
                      <p className="mt-1 text-[10px] text-faint">
                        <Link href={`/integrations`} className="underline hover:text-ink">
                          Set up
                        </Link>
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted">
                      <span className="font-medium tabular-nums text-ink">{prompts.toLocaleString()}</span> prompts in
                      range
                    </p>
                    {latency?.samples ? (
                      <p className="mt-1 text-[10px] text-muted">
                        Avg response {formatResponseMs(latency.avg_ms)}
                        {latency.p50_ms ? ` · median ${formatResponseMs(latency.p50_ms)}` : null}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {IDE_AGENT_CARDS.some((agent) => (ideStats?.agent_emails_by_tool?.[agent.key] ?? []).length > 0) ? (
              <div className="mb-5">
                <p className="text-[11px] text-muted">
                  In-app login emails detected inside each coding agent — click to include or exclude from the charts
                  below. These are the login emails detected inside each coding agent — separate from your Promptly account above.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {IDE_AGENT_CARDS.map((agent) => {
                    const agentEmails = ideStats?.agent_emails_by_tool?.[agent.key] ?? [];
                    if (!agentEmails.length) return null;
                    const selectedEmails = selectedEmailsByTool[agent.key];
                    return (
                      <div key={agent.key} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                          {agent.label}
                        </span>
                        {agentEmails.map((email) => {
                          const selected = selectedEmails.has(email);
                          return (
                            <button
                              key={`${agent.key}-${email}`}
                              type="button"
                              onClick={() => toggleAgentEmail(agent.key, email)}
                              className={`rounded-full border px-2.5 py-0.5 text-[10px] transition ${
                                selected
                                  ? "border-violet-400 bg-violet-100 font-medium text-violet-900"
                                  : "border-line bg-white/80 text-muted hover:border-violet-200 hover:text-ink"
                              }`}
                              title={selected ? "Included in charts — click to exclude" : "Excluded — click to include"}
                            >
                              {email}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {IDE_AGENT_CARDS.some(
              (agent) =>
                (displayIdeStats?.totals.prompts_without_agent_email?.[agent.key] ?? 0) > 0 &&
                !(ideStats?.agent_emails_by_tool?.[agent.key] ?? []).length
            ) ? (
              <p className="mb-4 text-[11px] text-muted">
                Some prompts have no detected agent login email yet (common for Claude Code on Mac). They still count
                toward your Promptly account totals.
              </p>
            ) : null}

            {displayIdeStats?.index_missing ? (
              <p className="mb-4 rounded-lg border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
                Statistics indexes are still deploying. Prompt counts may show zero temporarily even after you connect.
              </p>
            ) : null}

            {displayIdeStats?.footnotes?.length ? (
              <ul className="mb-4 list-disc space-y-1 pl-5 text-[11px] text-faint">
                {displayIdeStats.footnotes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}

            {!ideHasActivity ? (
              <p className="text-sm text-muted">
                {ideAnyConnected ? (
                  <>
                    Your agent is connected but no prompts are recorded in this range yet. Finish the last step on{" "}
                    <Link href="/integrations" className="underline hover:text-ink">
                      integrations
                    </Link>{" "}
                    (trust hooks / reload the app), then send a prompt and refresh.
                  </>
                ) : (
                  <>
                    No coding-agent activity yet. Install a connector from{" "}
                    <Link href="/integrations" className="underline hover:text-ink">
                      integrations
                    </Link>
                    , connect your account, then enable hooks in your coding app.
                  </>
                )}
              </p>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-line bg-white/70 p-3">
                    <p className="text-[11px] font-medium uppercase text-faint">Claude Code prompts</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                      {displayIdeStats?.totals.prompts.claude_code.toLocaleString() ?? "0"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-white/70 p-3">
                    <p className="text-[11px] font-medium uppercase text-faint">Cursor prompts</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                      {displayIdeStats?.totals.prompts.cursor.toLocaleString() ?? "0"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-white/70 p-3">
                    <p className="text-[11px] font-medium uppercase text-faint">Codex prompts</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                      {displayIdeStats?.totals.prompts.codex.toLocaleString() ?? "0"}
                    </p>
                  </div>
                </div>

                {IDE_AGENT_CARDS.map((agent) => {
                  const toolRows = ideModelsByTool.get(agent.key) ?? [];
                  const toolTotal = displayIdeStats?.totals.prompts[agent.key] ?? 0;
                  if (!toolRows.length || toolTotal <= 0) return null;
                  return (
                    <div key={agent.key}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                        {agent.label} · models used
                      </h3>
                      <div className="overflow-x-auto rounded-xl border border-line">
                        <table className="min-w-full border-collapse text-left text-sm">
                          <thead className="border-b border-line bg-cream-dark/80 text-[10px] uppercase tracking-wide text-muted">
                            <tr>
                              <th className="px-4 py-2 font-semibold">Model</th>
                              <th className="px-4 py-2 font-semibold">Prompts</th>
                              <th className="px-4 py-2 font-semibold">Share</th>
                              <th className="px-4 py-2 font-semibold">Avg words</th>
                              <th className="px-4 py-2 font-semibold">Avg response</th>
                            </tr>
                          </thead>
                          <tbody>
                            {toolRows.map((row) => {
                              const share = toolTotal > 0 ? Math.round((row.prompts / toolTotal) * 1000) / 10 : 0;
                              return (
                                <tr key={`${row.tool}-${row.bucket}`} className="border-b border-line last:border-0">
                                  <td className="px-4 py-2 font-mono text-xs text-ink">
                                    {formatIdeModelLabel(row)}
                                  </td>
                                  <td className="px-4 py-2 tabular-nums text-ink">{row.prompts.toLocaleString()}</td>
                                  <td className="px-4 py-2 tabular-nums text-muted">{share}%</td>
                                  <td className="px-4 py-2 tabular-nums text-muted">
                                    {row.avg_words != null ? row.avg_words.toLocaleString() : "—"}
                                  </td>
                                  <td className="px-4 py-2 tabular-nums text-muted">
                                    {formatResponseMs(row.avg_response_ms)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {!ideHasKnownModels && ideHasActivity ? (
                  <p className="text-xs text-muted">
                    Model names appear here once your agent reports them on each prompt. Re-download the plugin pack from{" "}
                    <Link href="/integrations" className="underline hover:text-ink">
                      integrations
                    </Link>{" "}
                    if you connected before this update, then send new prompts in Codex, Claude Code, or Cursor.
                  </p>
                ) : null}

                {idePromptTimeline.length ? (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Prompts over time</h3>
                    <div className="h-56 w-full statistics-charts sm:h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={idePromptTimeline} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD6" />
                          <XAxis dataKey="label" tick={CHART_X_DATE_TICK} stroke={CHART_X_DATE_STROKE} />
                          <YAxis tick={CHART_Y_TICK} allowDecimals={false} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                          <Bar dataKey="claude_code" name="Claude Code" stackId="ide" fill={COLOR_CLAUDE_CODE} />
                          <Bar dataKey="cursor" name="Cursor" stackId="ide" fill={COLOR_CURSOR_IDE} />
                          <Bar dataKey="codex" name="Codex" stackId="ide" fill={COLOR_CODEX} radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : null}

                {ideScreenTimeline.some(
                  (r) => r.claude_code_minutes + r.cursor_minutes + r.codex_minutes > 0
                ) ? (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Screen time (minutes)</h3>
                    <div className="h-56 w-full statistics-charts sm:h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={ideScreenTimeline} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD6" />
                          <XAxis dataKey="label" tick={CHART_X_DATE_TICK} stroke={CHART_X_DATE_STROKE} />
                          <YAxis tick={CHART_Y_TICK} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                          <Bar
                            dataKey="claude_code_minutes"
                            name="Claude Code"
                            stackId="scr"
                            fill={COLOR_CLAUDE_CODE}
                          />
                          <Bar dataKey="cursor_minutes" name="Cursor" stackId="scr" fill={COLOR_CURSOR_IDE} />
                          <Bar
                            dataKey="codex_minutes"
                            name="Codex"
                            stackId="scr"
                            fill={COLOR_CODEX}
                            radius={[2, 2, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : null}

                {ideEngagementByToolRows.length ||
                ideAvgWordsChartRows.length ||
                ideDraftResponseChartRows.length ? (
                  <div className="space-y-6 rounded-xl border border-line bg-white/60 p-4">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
                        Prompt &amp; time insights
                      </h3>
                      <p className="mt-1 text-[11px] text-muted">
                        Draft time is estimated from when the AI finishes until your next prompt. Prompt length is a
                        word count at submit (metadata only — never the full text).
                      </p>
                    </div>

                    {ideEngagementByToolRows.length ? (
                      <div>
                        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                          Time per agent (minutes)
                        </h4>
                        <div className="h-56 w-full statistics-charts sm:h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={ideEngagementByToolRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD6" />
                              <XAxis dataKey="agent" tick={CHART_Y_TICK} />
                              <YAxis tick={CHART_Y_TICK} allowDecimals />
                              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                              <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                              <Bar dataKey="drafting" name="Drafting" stackId="time" fill={COLOR_DRAFTING} />
                              <Bar dataKey="waiting" name="Waiting for AI" stackId="time" fill={COLOR_NATIVE_WEB} />
                              <Bar
                                dataKey="reading"
                                name="Reading / idle"
                                stackId="time"
                                fill={COLOR_READING_IDLE}
                                radius={[2, 2, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : null}

                    {ideDraftResponseChartRows.length ? (
                      <div>
                        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                          Average draft vs response time (seconds)
                        </h4>
                        <div className="h-52 w-full statistics-charts">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={ideDraftResponseChartRows}
                              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD6" />
                              <XAxis dataKey="agent" tick={CHART_Y_TICK} />
                              <YAxis tick={CHART_Y_TICK} unit="s" />
                              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                              <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                              <Bar dataKey="avg_draft_s" name="Avg draft" fill={COLOR_DRAFTING} radius={[4, 4, 0, 0]} />
                              <Bar
                                dataKey="avg_response_s"
                                name="Avg response"
                                fill={COLOR_NATIVE_WEB}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : null}

                    {ideAvgWordsChartRows.length ? (
                      <div>
                        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                          Average prompt length (words)
                        </h4>
                        <div
                          className="w-full statistics-charts"
                          style={{ height: Math.max(160, ideAvgWordsChartRows.length * 36 + 48) }}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={ideAvgWordsChartRows}
                              layout="vertical"
                              margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                              barCategoryGap="20%"
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD6" horizontal={false} />
                              <XAxis type="number" tick={CHART_Y_TICK} allowDecimals />
                              <YAxis
                                type="category"
                                dataKey="label"
                                width={120}
                                tick={{ ...CHART_Y_TICK, fontSize: 9 }}
                              />
                              <Tooltip
                                contentStyle={CHART_TOOLTIP_STYLE}
                                formatter={(value: number) => [`${value} words`, "Avg length"]}
                              />
                              <Bar dataKey="avg_words" name="Avg words" fill="#7c3aed" radius={[0, 4, 4, 0]} barSize={14} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <div className="my-10 border-t border-line" role="separator" />

          <h2 className="mb-6 text-sm font-semibold uppercase tracking-[0.22em] text-faint">Promptly Labs Diagnostics</h2>

          {/* Promptly impact scores (left) + average draft chart (right) */}
          {modelTimeChartRows.length ||
          promptDerivedScores?.efficiencyPercent != null ||
          promptDerivedScores?.qualityPercent != null ? (
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-stretch">
              {promptDerivedScores?.efficiencyPercent != null ||
              promptDerivedScores?.qualityPercent != null ? (
                <section
                  className="flex w-full flex-col rounded-2xl border border-line bg-cream p-3 shadow-card sm:p-4 lg:w-1/2"
                  style={{ minHeight: modelTimeChartRows.length ? modelTimeSectionHeight : undefined }}
                >
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-faint">Promptly impact</h2>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Prompt efficiency</p>
                      {promptDerivedScores.efficiencyPercent != null ? (
                        <FadeInUpliftPercent
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
                        <FadeInUpliftPercent
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
                        <XAxis type="number" stroke="#8A8A8A" tick={CHART_Y_TICK} unit="s" />
                        <YAxis
                          type="category"
                          dataKey="model"
                          stroke="#8A8A8A"
                          tick={CHART_Y_TICK_11}
                          width={72}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number, name: string) => {
                            if (typeof value !== "number" || value <= 0) return ["—", name];
                            return [`${value}s`, name];
                          }}
                        />
                        <Legend wrapperStyle={CHART_LEGEND_STYLE_COMPACT} />
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

          {/*Latency */}
          <section className="mb-12 rounded-2xl border border-line bg-cream p-6 backdrop-blur-md">
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Rewrite vs native turnaround time</h2>
            <div className="mt-4 h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={latencyChartRows} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="ai" stroke="#8A8A8A" tick={CHART_Y_TICK_11} />
                  <YAxis stroke="#8A8A8A" tick={CHART_Y_TICK_11} label={CHART_AXIS_LABEL("Seconds (avg)")} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={CHART_LEGEND_STYLE} />
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
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-faint">Words before Promptly</h2>
              {preImproveWordChangePercent !== null ? (
                <p
                  className="mb-4 text-lg font-semibold tabular-nums leading-none sm:text-xl"
                  style={{
                    color:
                      preImproveWordChangePercent > 0
                        ? COLOR_SCORE_GREEN
                        : preImproveWordChangePercent < 0
                          ? "#b45309"
                          : "#111111"
                  }}
                >
                  {formatWordChangePercent(preImproveWordChangePercent)}
                </p>
              ) : null}
              {preImproveWordChartRows.length ? (
                <div className="mt-4 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={preImproveWordChartRows} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                      <YAxis
                        stroke="#8A8A8A"
                        tick={CHART_Y_TICK_11}
                        allowDecimals
                        label={CHART_AXIS_LABEL("Avg words")}
                      />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number, name: string, item) => {
                          const payload = item?.payload as {
                            samples?: number;
                            samples_after?: number;
                          };
                          const runs =
                            name === "Before Promptly"
                              ? (payload?.samples ?? 0)
                              : (payload?.samples_after ?? 0);
                          return [`${value} words (${runs.toLocaleString()} runs)`, name];
                        }}
                      />
                      <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                      <Bar
                        dataKey="avg_words_before_display"
                        name="Before Promptly"
                        fill={COLOR_PROMPTLY}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={34}
                      />
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
                    <YAxis stroke="#8A8A8A" tick={CHART_Y_TICK} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="billed_promptly_tokens" fill="#9333ea" name="Promptly billed tokens / bucket" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {statisticsReportData ? (
        <div
          className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] bg-white"
          style={{ background: "#ffffff" }}
          aria-hidden
        >
          <StatisticsPrintReport ref={reportRef} data={statisticsReportData} />
        </div>
      ) : null}
    </div>
  );
}
