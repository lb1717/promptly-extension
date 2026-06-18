"use client";

import { getFirebaseAuth } from "@/lib/firebaseClient";
import { isInternalTelemetryModelBucket } from "@/lib/internalTelemetryModels";
import { onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import Link from "next/link";
import type { User } from "firebase/auth";
import { StatisticsPrintReport } from "@/components/account/StatisticsPrintReport";
import VendorUsageSection from "@/components/account/VendorUsageSection";
import { AutoDismissNoticeBar } from "@/components/ui/AutoDismissNoticeBar";
import { buildStatisticsReportData, downloadStatisticsReportPdf } from "@/lib/statisticsReport";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
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
const COLOR_CURSOR = "#9333ea";

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
const CHART_Y_TICK = { fill: "#2a2a2a", fontSize: 10, fontFamily: CHART_FONT_FAMILY };
const CHART_Y_TICK_11 = { fill: "#2a2a2a", fontSize: 11, fontFamily: CHART_FONT_FAMILY };
/** Date / bucket labels on chart X axes (white card backgrounds). */
const CHART_X_DATE_TICK = {
  fill: "#2a2a2a",
  fontSize: 11,
  fontWeight: 600 as const,
  fontFamily: CHART_FONT_FAMILY
};
const CHART_X_DATE_STROKE = "#525252";
const CHART_GRID_STROKE = "rgba(0,0,0,0.06)";
const CHART_CURSOR_FILL = "rgba(0,0,0,0.04)";
const CHART_AXIS_LABEL = (value: string, fill = "#2a2a2a") => ({
  value,
  angle: -90 as const,
  position: "insideLeft" as const,
  fill,
  style: { fontFamily: CHART_FONT_FAMILY }
});
const CHART_TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e8e8e8",
  borderRadius: 6,
  padding: "5px 7px",
  fontSize: 10,
  lineHeight: 1.3,
  color: "#111111",
  fontFamily: CHART_FONT_FAMILY,
  boxShadow: "0 2px 8px rgba(17, 17, 17, 0.08)"
};
const CHART_TOOLTIP_DARK_STYLE = {
  background: "#161018",
  border: "1px solid rgba(139,92,246,0.4)",
  fontFamily: CHART_FONT_FAMILY
};
const CHART_LEGEND_STYLE = { fontSize: 11, paddingTop: 8, fontFamily: CHART_FONT_FAMILY };
const CHART_LEGEND_STYLE_COMPACT = { fontSize: 11, paddingTop: 4, fontFamily: CHART_FONT_FAMILY };
/** Derived score emphasis (readable on white chart cards). */
const COLOR_SCORE_GREEN = "#15803d";
const COLOR_VOLUME_DELTA_DOWN = "#dc2626";
const COLOR_VOLUME_TREND = "#525252";
const STATS_SCROLL_STORAGE_KEY = "promptly_statistics_scroll_y";
const STATS_FILTER_LABEL_CLASS = "text-[13px] font-semibold uppercase tracking-wider text-muted";

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
    screen_time_minutes_prev?: { claude_code: number; cursor: number; codex: number } | null;
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
  model_prompt_timeline?: Array<{ bucket: string; models: Record<string, number> }>;
  model_screen_time_timeline?: Array<{ bucket: string; models: Record<string, number> }>;
  model_response_time_timeline?: Array<{ bucket: string; models: Record<string, number> }>;
  model_engagement_by_model?: ModelEngagementByModelRow[];
  model_screen_time_prev?: Array<{ bucket: string; total_minutes: number }> | null;
  model_series_labels?: Record<string, string | null>;
  response_time_timeline?: Array<{
    bucket: string;
    claude_code_s: number | null;
    cursor_s: number | null;
    codex_s: number | null;
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

const STATS_RANGE_OPTIONS: Array<{ label: string; days: number; since: string | null }> = [
  { label: "1W", days: 7, since: "last week" },
  { label: "1M", days: 30, since: "last month" },
  { label: "3M", days: 90, since: "last 3 months" },
  { label: "1Y", days: 365, since: "last year" },
  { label: "MAX", days: 400, since: null }
];

function sinceLabelForDays(days: number): string | null {
  return STATS_RANGE_OPTIONS.find((option) => option.days === days)?.since ?? null;
}

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
  screen_time_by_service_prev?: Record<PromptlySvc, number> | null;
  screen_time_timeline: ScreenTimeTimelineBucket[];
  engagement_totals: EngagementTotals;
  value_insights: ValueInsights;
  breakdowns_from_events: {
    service: Record<PromptlySvc, number>;
    mode: { auto: number; improve: number; generate: number };
    model_buckets: Array<{ bucket: string; exemplar_label: string | null; prompts: number }>;
  };
  model_catalog?: Array<{
    service: PromptlySvc;
    bucket: string;
    label: string | null;
    prompts: number;
    avg_words: number | null;
    word_samples: number;
  }>;
  avg_words_by_service?: Record<PromptlySvc, { avg_words: number | null; samples: number }>;
  model_prompt_timeline?: Array<{ bucket: string; models: Record<string, number> }>;
  model_screen_time_timeline?: Array<{ bucket: string; models: Record<string, number> }>;
  model_response_time_timeline?: Array<{ bucket: string; models: Record<string, number> }>;
  model_response_latency?: Array<{ bucket: string; avg_s: number; samples: number }>;
  model_engagement_by_model?: ModelEngagementByModelRow[];
  model_screen_time_prev?: Array<{ bucket: string; total_minutes: number }> | null;
  model_series_labels?: Record<string, string | null>;
  response_time_timeline?: Array<{
    bucket: string;
    chatgpt_s: number | null;
    claude_s: number | null;
    gemini_s: number | null;
  }>;
  host_passive_listener: HostPassiveLite;
  quota_exceeded?: boolean;
  footnotes: string[];
};

function getRecentDaysClient(count: number): string[] {
  const n = Math.max(1, Math.min(400, Math.floor(count)));
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

/** Rounds chart hover values to one decimal so tooltips never show long floats. */
function formatChartNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** Integer percent shares via largest remainder so the labels always sum to 100. */
function withPercentShares<T extends { minutes: number }>(rows: T[]): Array<T & { percent: number }> {
  const total = rows.reduce((sum, row) => sum + row.minutes, 0);
  if (total <= 0) return rows.map((row) => ({ ...row, percent: 0 }));
  const raw = rows.map((row) => (row.minutes / total) * 100);
  const floors = raw.map((value) => Math.floor(value));
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
  const byFraction = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { index } of byFraction) {
    if (remainder <= 0) break;
    floors[index] += 1;
    remainder -= 1;
  }
  return rows.map((row, index) => ({ ...row, percent: floors[index] ?? 0 }));
}

/**
 * Bar-end label: "34%" plus, when a reference window exists, the share change
 * in percentage points vs that window (e.g. "34% (+6% since last month)").
 */
function withBarLabels<T extends { key: string; percent: number }>(
  rows: T[],
  prevMinutesByKey: Map<string, number> | null,
  sinceLabel: string | null
): Array<T & { barLabel: string }> {
  const prevTotal = prevMinutesByKey
    ? [...prevMinutesByKey.values()].reduce((sum, value) => sum + value, 0)
    : 0;
  const showReference = Boolean(sinceLabel) && prevTotal > 0;
  return rows.map((row) => {
    if (!showReference) return { ...row, barLabel: singleLineBarLabel(`${row.percent}%`) };
    const prevPercent = Math.round(((prevMinutesByKey!.get(row.key) ?? 0) / prevTotal) * 100);
    const delta = row.percent - prevPercent;
    const sign = delta < 0 ? "−" : "+";
    return {
      ...row,
      barLabel: singleLineBarLabel(`${row.percent}% (${sign}${Math.abs(delta)}% since ${sinceLabel})`)
    };
  });
}

function singleLineBarLabel(text: string): string {
  return text.replace(/ /g, "\u00A0");
}

/** Right chart margin sized so the bar-end label never clips. */
function barLabelRightMargin(rows: Array<{ barLabel: string }>): number {
  const maxLen = rows.reduce((max, row) => Math.max(max, row.barLabel.length), 0);
  return Math.min(300, Math.max(52, Math.round(maxLen * 6.8) + 14));
}

/** Keeps "64% (+59% since last week)" on one line beside horizontal bars. */
function BarEndPercentLabel({
  x,
  y,
  width,
  height,
  value
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: string | number;
}) {
  const label = value == null ? "" : String(value);
  if (!label) return null;
  const bx = Number(x ?? 0);
  const by = Number(y ?? 0);
  const bw = Number(width ?? 0);
  const bh = Number(height ?? 0);
  const labelX = bx + bw + 6;
  const labelY = by + bh / 2 - 10;
  const foWidth = Math.min(340, Math.max(128, label.length * 6.8 + 12));
  return (
    <foreignObject x={labelX} y={labelY} width={foWidth} height={20}>
      <div
        className="bar-end-percent-label"
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#111111",
          whiteSpace: "nowrap",
          lineHeight: "20px",
          fontFamily: CHART_FONT_FAMILY
        }}
      >
        {label}
      </div>
    </foreignObject>
  );
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

type StatsGroupMode = "service" | "model";

type ModelEngagementByModelRow = {
  bucket: string;
  label: string | null;
  drafting_minutes: number;
  waiting_minutes: number;
  reading_idle_minutes: number;
  total_minutes: number;
};

type ModelChartSeries = {
  bucket: string;
  label: string;
  color: string;
  dataKey: string;
};

const SERVICE_MODEL_COLOR_SPECTRUMS: Partial<Record<PromptVolumeAiKey, readonly string[]>> = {
  claude: ["#7f1d1d", "#b91c1c", "#dc2626", "#ea580c", "#f97316", "#fb923c", "#fdba74"],
  claude_code: ["#7c2d12", "#c2410c", "#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa"],
  codex: ["#064e3b", "#047857", "#059669", "#10b981", "#22c997", "#34d399", "#6ee7b7"],
  chatgpt: ["#064e3e", "#0e9068", "#0f766e", "#14b8a6", "#2dd4bf", "#5eead4", "#99f6e4"],
  cursor: ["#581c87", "#7e22ce", "#9333ea", "#a855f7", "#c026d3", "#ec4899", "#f472b6"],
  gemini: ["#1e3a8a", "#1d4ed8", "#2563eb", "#4285f4", "#60a5fa", "#93c5fd", "#bfdbfe"],
  other: ["#334155", "#475569", "#64748b", "#94a3b8", "#cbd5e1"]
};

function modelColorForService(service: PromptVolumeAiKey, index: number, total: number): string {
  const spectrum = SERVICE_MODEL_COLOR_SPECTRUMS[service] ?? SERVICE_MODEL_COLOR_SPECTRUMS.other!;
  if (total <= 1) return spectrum[Math.floor(spectrum.length / 2)] ?? spectrum[0] ?? COLOR_UNKNOWN;
  const idx = Math.round((index / (total - 1)) * (spectrum.length - 1));
  return spectrum[idx] ?? COLOR_UNKNOWN;
}

function modelSeriesDataKey(bucket: string): string {
  return `model_${bucket.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function buildModelTimelineChartRows(
  timeline: Array<{ bucket: string; models: Record<string, number> }> | undefined,
  series: ModelChartSeries[],
  granularity: "day" | "week"
): Array<Record<string, string | number>> {
  if (!timeline?.length || !series.length) return [];
  return timeline.map((row) => {
    const out: Record<string, string | number> = {
      bucket: row.bucket,
      label: granularity === "week" ? `wk ${formatShortDay(row.bucket)}` : formatShortDay(row.bucket)
    };
    for (const item of series) {
      out[item.dataKey] = row.models[item.bucket] ?? 0;
    }
    return out;
  });
}

const IDE_SERVICE_KEYS = new Set<PromptVolumeAiKey>(["claude_code", "cursor", "codex"]);
const IDE_AGENT_FILTER_KEYS: IdeToolKey[] = ["claude_code", "cursor", "codex"];

function isIdeServiceKey(key: PromptVolumeAiKey): key is IdeToolKey {
  return IDE_SERVICE_KEYS.has(key);
}

function promptVolumeUsageCounts(
  timeline: PromptVolumeChartBucket[],
  webStats: ExtendedStatsPayload | null,
  ideStats: IdeStatsPayload | null
): Record<PromptVolumeAiKey, number> {
  const counts: Record<PromptVolumeAiKey, number> = {
    chatgpt: 0,
    claude: 0,
    gemini: 0,
    other: 0,
    claude_code: 0,
    cursor: 0,
    codex: 0
  };
  for (const row of timeline) {
    counts.chatgpt += Math.max(0, Number(row.prompts_chatgpt ?? 0) || 0);
    counts.claude += Math.max(0, Number(row.prompts_claude ?? 0) || 0);
    counts.gemini += Math.max(0, Number(row.prompts_gemini ?? 0) || 0);
    counts.other += Math.max(0, Number(row.prompts_unknown ?? 0) || 0);
    counts.claude_code += Math.max(0, Number(row.prompts_claude_code ?? 0) || 0);
    counts.cursor += Math.max(0, Number(row.prompts_cursor ?? 0) || 0);
    counts.codex += Math.max(0, Number(row.prompts_codex ?? 0) || 0);
  }
  if (timeline.length > 0) return counts;
  counts.chatgpt = Math.max(0, Number(webStats?.combined_totals?.prompts_chatgpt_surface ?? 0) || 0);
  counts.claude = Math.max(0, Number(webStats?.combined_totals?.prompts_claude_surface ?? 0) || 0);
  counts.gemini = Math.max(0, Number(webStats?.combined_totals?.prompts_gemini_surface ?? 0) || 0);
  counts.other = Math.max(0, Number(webStats?.combined_totals?.prompts_unknown_surface ?? 0) || 0);
  counts.claude_code = Math.max(0, Number(ideStats?.totals.prompts.claude_code ?? 0) || 0);
  counts.cursor = Math.max(0, Number(ideStats?.totals.prompts.cursor ?? 0) || 0);
  counts.codex = Math.max(0, Number(ideStats?.totals.prompts.codex ?? 0) || 0);
  return counts;
}

function sortPromptVolumeAiFiltersByUsage(
  filters: typeof PROMPT_VOLUME_AI_FILTERS,
  usage: Record<PromptVolumeAiKey, number>
): typeof PROMPT_VOLUME_AI_FILTERS {
  const filterByKey = new Map(filters.map((filter) => [filter.key, filter]));
  const ideAgents = IDE_AGENT_FILTER_KEYS.map((key) => filterByKey.get(key))
    .filter((filter): filter is (typeof PROMPT_VOLUME_AI_FILTERS)[number] => Boolean(filter))
    .sort(
      (a, b) =>
        (usage[b.key] ?? 0) - (usage[a.key] ?? 0) || a.label.localeCompare(b.label)
    );
  const webServices = filters
    .filter((filter) => !isIdeServiceKey(filter.key))
    .sort(
      (a, b) =>
        (usage[b.key] ?? 0) - (usage[a.key] ?? 0) || a.label.localeCompare(b.label)
    );
  return [...ideAgents, ...webServices];
}

function webServiceFromFilterKey(key: PromptVolumeAiKey): PromptlySvc {
  return key === "other" ? "unknown" : (key as PromptlySvc);
}

function buildStatsScopeSearchParams(
  mode: StatsGroupMode,
  modelService: PromptVolumeAiKey
): URLSearchParams {
  const params = new URLSearchParams();
  if (mode !== "model") return params;
  if (isIdeServiceKey(modelService)) {
    params.set("tool", modelService);
  } else {
    params.set("service", webServiceFromFilterKey(modelService));
  }
  return params;
}

function singleServiceFilterState(service: PromptVolumeAiKey): PromptVolumeAiFilterState {
  return {
    claude: service === "claude",
    gemini: service === "gemini",
    chatgpt: service === "chatgpt",
    other: service === "other",
    claude_code: service === "claude_code",
    cursor: service === "cursor",
    codex: service === "codex"
  };
}

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
  const panelW = 76;
  const panelH = Math.min(72, 20 + payload.length * 16);
  const x = boxW - panelW - 4;
  const y = Math.max(6, (boxH - panelH) / 2);

  return (
    <foreignObject x={x} y={y} width={panelW} height={panelH} style={{ overflow: "visible", pointerEvents: "none" }}>
      <div
        style={{
          ...CHART_TOOLTIP_STYLE,
          padding: "5px 7px",
          fontSize: 10,
          lineHeight: 1.3
        }}
      >
        {payload.map((entry, index) => (
          <p
            key={String(entry.name)}
            className="tabular-nums"
            style={{ color: entry.payload?.fill ?? "#1F1B16", margin: index === 0 ? 0 : "4px 0 0" }}
          >
            <span className="font-semibold">{entry.name}</span>
            <br />
            {typeof entry.value === "number" ? `${formatChartNumber(entry.value)} min` : "—"}
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
  totalMinutes,
  slices
}: {
  label: string;
  totalMinutes: number;
  slices: EngagementSlice[];
}) {
  const hasSlices = slices.length > 0;
  const chartData: EngagementSlice[] = hasSlices
    ? slices
    : [{ name: "No activity", value: 1, fill: "#E0DDD6" }];

  return (
    <div className="mx-auto flex w-full max-w-[240px] flex-col items-center">
      <p className="text-center text-sm font-bold uppercase tracking-wide text-ink">{label}</p>
      <div className="h-52 w-[220px] shrink-0">
        <ResponsiveContainer width="100%" height="100%" debounce={50}>
          <PieChart margin={{ top: 4, right: 12, bottom: 12, left: 12 }}>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="72%"
              paddingAngle={hasSlices && slices.length > 1 ? 2 : 0}
              stroke="#ffffff"
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

function StatsGroupModeToggle({
  value,
  onChange
}: {
  value: StatsGroupMode;
  onChange: (value: StatsGroupMode) => void;
}) {
  const options: Array<{ value: StatsGroupMode; label: string }> = [
    { value: "service", label: "By service" },
    { value: "model", label: "By model" }
  ];
  return (
    <div
      className="inline-flex shrink-0 rounded-lg border border-line bg-cream p-0.5"
      role="tablist"
      aria-label="Group statistics by"
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
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
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
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis type="number" stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK} />
          <YAxis dataKey="name" type="category" width={92} stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK_11} />
          <Tooltip contentStyle={CHART_TOOLTIP_DARK_STYLE} />
          <Bar dataKey="prompts" name="Runs" radius={[0, 6, 6, 0]} fill="#a78bfa" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatisticsClient({ embedded = false }: { embedded?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const rangeSummaryLabel = days >= 400 ? "All time" : `Last ${days} days`;
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
  const [statsGroupMode, setStatsGroupMode] = useState<StatsGroupMode>("service");
  const [selectedModelService, setSelectedModelService] = useState<PromptVolumeAiKey>("chatgpt");
  const [selectedModelBuckets, setSelectedModelBuckets] = useState<Set<string>>(new Set());
  const [modelCatalogWeb, setModelCatalogWeb] = useState<
    NonNullable<ExtendedStatsPayload["model_catalog"]>
  >([]);
  const [modelCatalogIde, setModelCatalogIde] = useState<IdeStatsPayload["model_buckets"]>([]);
  const [screenTimeView, setScreenTimeView] = useState<StatsChartHorizon>("instant");
  const [engagementView, setEngagementView] = useState<StatsChartHorizon>("instant");
  const [responseTimeView, setResponseTimeView] = useState<StatsChartHorizon>("instant");
  const [engagementPiesExpanded, setEngagementPiesExpanded] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const ideStatsReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsContainerRef = useRef<HTMLDivElement>(null);
  const filterSentinelRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [filterBarStuck, setFilterBarStuck] = useState(false);

  const STATS_FILTER_NAV_OFFSET_PX = 56;
  const STATS_FILTER_PINNED_TOP_GAP_PX = 12;
  const STATS_FILTER_STICKY_TOP_PX = STATS_FILTER_NAV_OFFSET_PX + STATS_FILTER_PINNED_TOP_GAP_PX;
  const pendingScrollRestoreRef = useRef(false);

  const saveScrollPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(STATS_SCROLL_STORAGE_KEY, String(Math.max(0, Math.round(window.scrollY))));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    pendingScrollRestoreRef.current = window.sessionStorage.getItem(STATS_SCROLL_STORAGE_KEY) != null;
    const onBeforeUnload = () => saveScrollPosition();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveScrollPosition]);

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
    if (typeof window === "undefined" || !pendingScrollRestoreRef.current) return;
    if (loading || statsLoading || ideStatsLoading) return;
    if (user && !stats && !ideStats && !statsError && !ideStatsError) return;
    const raw = window.sessionStorage.getItem(STATS_SCROLL_STORAGE_KEY);
    if (!raw) return;
    const y = Number(raw);
    if (!Number.isFinite(y) || y <= 0) {
      window.sessionStorage.removeItem(STATS_SCROLL_STORAGE_KEY);
      pendingScrollRestoreRef.current = false;
      return;
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: "auto" });
      window.sessionStorage.removeItem(STATS_SCROLL_STORAGE_KEY);
      pendingScrollRestoreRef.current = false;
    });
  }, [loading, statsLoading, ideStatsLoading, user, stats, ideStats, statsError, ideStatsError]);

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

  const loadExtended = useCallback(
    async (
      current: User | null,
      d: number,
      g: "day" | "week",
      scopeParams?: URLSearchParams,
      refresh = false,
      captureCatalog = false
    ) => {
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
      for (const [key, value] of scopeParams?.entries() ?? []) {
        params.set(key, value);
      }
      const res = await fetch(`/api/account/stats/extended?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: refresh ? "no-store" : "default"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setStats(data as ExtendedStatsPayload);
      if (captureCatalog && Array.isArray(data.model_catalog)) {
        setModelCatalogWeb(data.model_catalog);
      }
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
  },
    []
  );

  const loadIdeStats = useCallback(
    async (
      current: User | null,
      d: number,
      g: "day" | "week",
      emailSelection: SelectedEmailsByTool,
      availableByTool?: Record<IdeToolKey, string[]>,
      scopeParams?: URLSearchParams,
      refresh = false,
      captureCatalog = false
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
      for (const [key, value] of scopeParams?.entries() ?? []) {
        params.set(key, value);
      }
      const res = await fetch(`/api/account/stats/ide?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: refresh ? "no-store" : "default"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      const payload = data as IdeStatsPayload;
      setIdeStats(payload);
      if (captureCatalog && Array.isArray(payload.model_buckets)) {
        setModelCatalogIde(
          payload.model_buckets.filter(
            (row: IdeStatsPayload["model_buckets"][number]) => !isInternalTelemetryModelBucket(row.bucket)
          )
        );
      }
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
      refresh = false,
      scopeParams?: URLSearchParams
    ) => {
      if (!user) return;
      if (ideStatsReloadTimerRef.current) {
        clearTimeout(ideStatsReloadTimerRef.current);
      }
      ideStatsReloadTimerRef.current = setTimeout(() => {
        ideStatsReloadTimerRef.current = null;
        void loadIdeStats(
          user,
          days,
          granularity,
          emailSelection,
          availableByTool,
          scopeParams,
          refresh,
          statsGroupMode !== "model"
        );
      }, 300);
    },
    [user, days, granularity, loadIdeStats, statsGroupMode]
  );

  useEffect(() => {
    return () => {
      if (ideStatsReloadTimerRef.current) {
        clearTimeout(ideStatsReloadTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const sentinel = filterSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setFilterBarStuck(!entry.isIntersecting);
      },
      { root: null, rootMargin: `-${STATS_FILTER_STICKY_TOP_PX}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [user, stats, statsGroupMode, days, granularity, selectedModelService, STATS_FILTER_STICKY_TOP_PX]);

  const statsScopeParams = useMemo(
    () => buildStatsScopeSearchParams(statsGroupMode, selectedModelService),
    [statsGroupMode, selectedModelService]
  );

  const effectivePromptVolumeAiFilters = useMemo(
    () =>
      statsGroupMode === "model"
        ? singleServiceFilterState(selectedModelService)
        : promptVolumeAiFilters,
    [statsGroupMode, selectedModelService, promptVolumeAiFilters]
  );

  const modelOptionsForSelectedService = useMemo(() => {
    const engagementRows =
      statsGroupMode === "model"
        ? isIdeServiceKey(selectedModelService)
          ? displayIdeStats?.model_engagement_by_model ?? []
          : displayStats?.model_engagement_by_model ?? []
        : [];
    const seriesLabels = isIdeServiceKey(selectedModelService)
      ? displayIdeStats?.model_series_labels ?? {}
      : displayStats?.model_series_labels ?? {};

    const byBucket = new Map<
      string,
      {
        bucket: string;
        label: string | null;
        prompts: number;
        tool?: IdeStatsPayload["model_buckets"][number]["tool"];
        service?: PromptlySvc;
      }
    >();

    if (isIdeServiceKey(selectedModelService)) {
      for (const row of modelCatalogIde) {
        if (row.tool !== selectedModelService) continue;
        if (isInternalTelemetryModelBucket(row.bucket)) continue;
        if (row.prompts <= 0 && (row.draft_samples ?? 0) <= 0 && (row.word_samples ?? 0) <= 0) {
          const engagement = engagementRows.find((entry) => entry.bucket === row.bucket);
          if (!engagement || engagement.total_minutes <= 0) continue;
        }
        byBucket.set(row.bucket, row);
      }
    } else {
      const svc = webServiceFromFilterKey(selectedModelService);
      for (const row of modelCatalogWeb) {
        if (row.service !== svc) continue;
        if (row.prompts <= 0) {
          const engagement = engagementRows.find((entry) => entry.bucket === row.bucket);
          if (!engagement || engagement.total_minutes <= 0) continue;
        }
        byBucket.set(row.bucket, row);
      }
    }

    for (const row of engagementRows) {
      if (isInternalTelemetryModelBucket(row.bucket)) continue;
      if (row.total_minutes <= 0 || byBucket.has(row.bucket)) continue;
      byBucket.set(row.bucket, {
        bucket: row.bucket,
        label: row.label,
        prompts: 0,
        ...(isIdeServiceKey(selectedModelService)
          ? { tool: selectedModelService }
          : { service: webServiceFromFilterKey(selectedModelService) })
      });
    }

    for (const [bucket, label] of Object.entries(seriesLabels)) {
      if (isInternalTelemetryModelBucket(bucket)) continue;
      if (byBucket.has(bucket)) continue;
      byBucket.set(bucket, {
        bucket,
        label,
        prompts: 0,
        ...(isIdeServiceKey(selectedModelService)
          ? { tool: selectedModelService }
          : { service: webServiceFromFilterKey(selectedModelService) })
      });
    }

    return [...byBucket.values()].sort((a, b) => {
      const promptDelta = (b.prompts ?? 0) - (a.prompts ?? 0);
      if (promptDelta !== 0) return promptDelta;
      const aLabel = isIdeServiceKey(selectedModelService)
        ? formatIdeModelLabel(a as IdeStatsPayload["model_buckets"][number])
        : (a.label || a.bucket);
      const bLabel = isIdeServiceKey(selectedModelService)
        ? formatIdeModelLabel(b as IdeStatsPayload["model_buckets"][number])
        : (b.label || b.bucket);
      return aLabel.localeCompare(bLabel);
    });
  }, [
    selectedModelService,
    modelCatalogWeb,
    modelCatalogIde,
    statsGroupMode,
    displayIdeStats,
    displayStats
  ]);

  const modelBucketColors = useMemo(() => {
    const map = new Map<string, string>();
    modelOptionsForSelectedService.forEach((row, index) => {
      map.set(row.bucket, modelColorForService(selectedModelService, index, modelOptionsForSelectedService.length));
    });
    return map;
  }, [modelOptionsForSelectedService, selectedModelService]);

  const activeModelChartSeries = useMemo((): ModelChartSeries[] => {
    if (statsGroupMode !== "model") return [];
    return modelOptionsForSelectedService
      .filter((row) => selectedModelBuckets.has(row.bucket))
      .map((row, index) => {
        const label = isIdeServiceKey(selectedModelService)
          ? formatIdeModelLabel(row as IdeStatsPayload["model_buckets"][number])
          : ("label" in row && row.label?.trim()) || row.bucket;
        return {
          bucket: row.bucket,
          label,
          color: modelBucketColors.get(row.bucket) ?? COLOR_UNKNOWN,
          dataKey: modelSeriesDataKey(row.bucket)
        };
      });
  }, [statsGroupMode, modelOptionsForSelectedService, selectedModelBuckets, selectedModelService, modelBucketColors]);

  const statsGranularity = displayStats?.granularity ?? displayIdeStats?.granularity ?? granularity;

  const modelPromptVolumeChartRows = useMemo(() => {
    if (statsGroupMode !== "model") return [];
    const timeline = isIdeServiceKey(selectedModelService)
      ? displayIdeStats?.model_prompt_timeline
      : displayStats?.model_prompt_timeline;
    return buildModelTimelineChartRows(timeline, activeModelChartSeries, statsGranularity);
  }, [
    statsGroupMode,
    selectedModelService,
    displayIdeStats,
    displayStats,
    activeModelChartSeries,
    statsGranularity
  ]);

  const modelScreenTimeOverTimeRows = useMemo(() => {
    if (statsGroupMode !== "model") return [];
    const timeline = isIdeServiceKey(selectedModelService)
      ? displayIdeStats?.model_screen_time_timeline
      : displayStats?.model_screen_time_timeline;
    return buildModelTimelineChartRows(timeline, activeModelChartSeries, statsGranularity);
  }, [
    statsGroupMode,
    selectedModelService,
    displayIdeStats,
    displayStats,
    activeModelChartSeries,
    statsGranularity
  ]);

  const modelEngagementByModel = useMemo((): ModelEngagementByModelRow[] => {
    if (statsGroupMode !== "model") return [];
    return isIdeServiceKey(selectedModelService)
      ? displayIdeStats?.model_engagement_by_model ?? []
      : displayStats?.model_engagement_by_model ?? [];
  }, [statsGroupMode, selectedModelService, displayIdeStats, displayStats]);

  const screenTimeByModelInstantRows = useMemo(() => {
    if (statsGroupMode !== "model") return [];
    const prevEntries = isIdeServiceKey(selectedModelService)
      ? displayIdeStats?.model_screen_time_prev
      : displayStats?.model_screen_time_prev;
    const prevMinutesByKey = prevEntries
      ? new Map(
          prevEntries
            .filter((entry) => activeModelChartSeries.some((series) => series.bucket === entry.bucket))
            .map((entry) => [entry.bucket, entry.total_minutes] as const)
        )
      : null;
    return withBarLabels(
      withPercentShares(
        activeModelChartSeries
          .map((series) => {
            const row = modelEngagementByModel.find((entry) => entry.bucket === series.bucket);
            return {
              model: series.label,
              key: series.bucket,
              minutes: row?.total_minutes ?? 0,
              fill: series.color
            };
          })
          .filter((row) => row.minutes > 0)
          .sort((a, b) => b.minutes - a.minutes || a.model.localeCompare(b.model))
      ),
      prevMinutesByKey,
      sinceLabelForDays(days)
    );
  }, [
    statsGroupMode,
    activeModelChartSeries,
    modelEngagementByModel,
    selectedModelService,
    displayIdeStats,
    displayStats,
    days
  ]);

  const modelScreenTimeOverTimeHasData = useMemo(
    () =>
      modelScreenTimeOverTimeRows.some((row) =>
        activeModelChartSeries.some((series) => Number(row[series.dataKey] ?? 0) > 0)
      ),
    [modelScreenTimeOverTimeRows, activeModelChartSeries]
  );

  const engagementByModelPies = useMemo(() => {
    if (statsGroupMode !== "model") return [];
    return activeModelChartSeries
      .map((series) => {
        const row = modelEngagementByModel.find((entry) => entry.bucket === series.bucket);
        if (!row || row.total_minutes <= 0) return null;
        const slices: EngagementSlice[] = [
          { name: "Drafting prompt", value: row.drafting_minutes, fill: COLOR_DRAFTING },
          { name: "Waiting for AI", value: row.waiting_minutes, fill: COLOR_NATIVE_WEB },
          { name: "Reading output", value: row.reading_idle_minutes, fill: COLOR_READING_IDLE }
        ].filter((slice) => slice.value > 0);
        return {
          key: series.bucket,
          label: series.label,
          accent: series.color,
          totalMinutes: row.total_minutes,
          slices,
          hasData: slices.length > 0
        };
      })
      .filter((pie): pie is NonNullable<typeof pie> => pie !== null && pie.hasData);
  }, [statsGroupMode, activeModelChartSeries, modelEngagementByModel]);

  const toggleAgentEmail = useCallback(
    (tool: IdeToolKey, email: string) => {
      setSelectedEmailsByTool((prev) => {
        const current = new Set(prev[tool]);
        if (current.has(email)) {
          current.delete(email);
        } else {
          current.add(email);
        }
        const next = { ...prev, [tool]: current };
        scheduleIdeStatsReload(next, ideStats?.agent_emails_by_tool, false, statsScopeParams);
        return next;
      });
    },
    [scheduleIdeStatsReload, ideStats?.agent_emails_by_tool, statsScopeParams]
  );

  const refreshAllStats = useCallback(() => {
    if (!user) return;
    saveScrollPosition();
    pendingScrollRestoreRef.current = true;
    const captureCatalog = statsGroupMode !== "model";
    void loadExtended(user, days, granularity, statsScopeParams, true, captureCatalog);
    void loadIdeStats(
      user,
      days,
      granularity,
      selectedEmailsByTool,
      ideStats?.agent_emails_by_tool,
      statsScopeParams,
      true,
      captureCatalog
    );
  }, [
    user,
    days,
    granularity,
    selectedEmailsByTool,
    ideStats?.agent_emails_by_tool,
    loadExtended,
    loadIdeStats,
    statsScopeParams,
    statsGroupMode,
    saveScrollPosition
  ]);

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
    const captureCatalog = statsGroupMode !== "model";
    void loadExtended(user, days, granularity, statsScopeParams, false, captureCatalog);
    void loadIdeStats(
      user,
      days,
      granularity,
      selectedEmailsByTool,
      ideStats?.agent_emails_by_tool,
      statsScopeParams,
      false,
      captureCatalog
    );
  }, [
    user,
    loading,
    days,
    granularity,
    statsScopeParams,
    statsGroupMode,
    loadExtended,
    loadIdeStats
  ]);

  const prevModelServiceRef = useRef(selectedModelService);
  const prevStatsGroupModeRef = useRef(statsGroupMode);
  useEffect(() => {
    if (statsGroupMode !== "model") {
      prevModelServiceRef.current = selectedModelService;
      prevStatsGroupModeRef.current = statsGroupMode;
      return;
    }
    const serviceChanged = prevModelServiceRef.current !== selectedModelService;
    const modeJustSwitched = prevStatsGroupModeRef.current !== "model";
    prevModelServiceRef.current = selectedModelService;
    prevStatsGroupModeRef.current = statsGroupMode;
    if (!serviceChanged && !modeJustSwitched && selectedModelBuckets.size > 0) {
      return;
    }
    setSelectedModelBuckets(new Set(modelOptionsForSelectedService.map((row) => row.bucket)));
  }, [
    statsGroupMode,
    selectedModelService,
    modelOptionsForSelectedService,
    selectedModelBuckets.size
  ]);

  const toggleModelBucket = useCallback((bucket: string) => {
    setSelectedModelBuckets((prev) => {
      if (prev.has(bucket) && prev.size <= 1) return prev;
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  }, []);

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

  const promptVolumeUsageByService = useMemo(
    () => promptVolumeUsageCounts(stackedTimeline, displayStats, displayIdeStats),
    [stackedTimeline, displayStats, displayIdeStats]
  );

  const sortedPromptVolumeAiFilters = useMemo(
    () => sortPromptVolumeAiFiltersByUsage(PROMPT_VOLUME_AI_FILTERS, promptVolumeUsageByService),
    [promptVolumeUsageByService]
  );

  const promptVolumeChartRows = useMemo(() => {
    const totals = stackedTimeline.map((row) => promptVolumeBucketTotal(row, effectivePromptVolumeAiFilters));
    const trend = smoothTrendValues(totals);
    return stackedTimeline.map((row, index) => ({
      ...row,
      volume_total: totals[index] ?? 0,
      volume_trend: trend[index] ?? 0
    }));
  }, [stackedTimeline, effectivePromptVolumeAiFilters]);

  const promptVolumePeriodChange = useMemo(
    () =>
      computePromptVolumePeriodChange(
        stackedTimeline,
        days,
        displayStats?.granularity ?? granularity,
        effectivePromptVolumeAiFilters
    ),
    [stackedTimeline, days, displayStats?.granularity, granularity, effectivePromptVolumeAiFilters]
  );

  const promptVolumeAiEnabledCount = useMemo(
    () => PROMPT_VOLUME_AI_FILTERS.filter((f) => effectivePromptVolumeAiFilters[f.key]).length,
    [effectivePromptVolumeAiFilters]
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
    const rows = (displayIdeStats?.model_buckets ?? []).filter(
      (row) => !isInternalTelemetryModelBucket(row.bucket)
    );
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
      (row) =>
        row.prompts > 0 && row.bucket !== "unknown" && !isInternalTelemetryModelBucket(row.bucket)
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
          !isInternalTelemetryModelBucket(row.bucket) &&
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

  const screenTimeByServiceRows = useMemo(() => {
    const rows: Array<{ service: string; key: string; minutes: number; fill: string }> = [];
    const prevMinutesByKey = new Map<string, number>();
    if (displayStats?.screen_time_by_service) {
      for (const serviceKey of ["chatgpt", "claude", "gemini"] as const) {
        if (!effectivePromptVolumeAiFilters[serviceKey]) continue;
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
        if (displayStats.screen_time_by_service_prev) {
          prevMinutesByKey.set(serviceKey, displayStats.screen_time_by_service_prev[serviceKey] ?? 0);
        }
      }
    }
    const ideScreen = displayIdeStats?.totals.screen_time_minutes;
    if (ideScreen) {
      const agents: Array<{ key: IdeToolKey; label: string; color: string }> = [
        { key: "claude_code", label: "Claude Code", color: COLOR_CLAUDE_CODE },
        { key: "cursor", label: "Cursor", color: COLOR_CURSOR },
        { key: "codex", label: "Codex", color: COLOR_CODEX }
      ];
      const idePrev = displayIdeStats?.totals.screen_time_minutes_prev;
      for (const agent of agents) {
        if (!effectivePromptVolumeAiFilters[agent.key]) continue;
        rows.push({
          service: agent.label,
          key: agent.key,
          minutes: ideScreen[agent.key] ?? 0,
          fill: agent.color
        });
        if (idePrev) {
          prevMinutesByKey.set(agent.key, idePrev[agent.key] ?? 0);
        }
      }
    }
    return withBarLabels(
      withPercentShares(
        [...rows].sort((a, b) => b.minutes - a.minutes || a.service.localeCompare(b.service))
      ),
      prevMinutesByKey,
      sinceLabelForDays(days)
    );
  }, [displayStats, displayIdeStats, effectivePromptVolumeAiFilters, days]);

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
        if (!effectivePromptVolumeAiFilters[svc.filterKey]) continue;
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
        if (!effectivePromptVolumeAiFilters[agent.filterKey]) continue;
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
  }, [displayStats, displayIdeStats, effectivePromptVolumeAiFilters]);

  const includeWebEngagementTimeline = useMemo(
    () => (["chatgpt", "claude", "gemini"] as const).some((key) => effectivePromptVolumeAiFilters[key]),
    [effectivePromptVolumeAiFilters]
  );

  const includeIdeEngagementTimeline = useMemo(
    () => (["claude_code", "cursor", "codex"] as const).some((key) => effectivePromptVolumeAiFilters[key]),
    [effectivePromptVolumeAiFilters]
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
          effectivePromptVolumeAiFilters[filter.key] && (row[SCREEN_TIME_TIMELINE_KEY[filter.key]] ?? 0) > 0
      )
    }));
  }, [displayStats, displayIdeStats, granularity, effectivePromptVolumeAiFilters]);

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
    return PROMPT_VOLUME_AI_FILTERS.filter((f) => effectivePromptVolumeAiFilters[f.key]).length;
  }, [effectivePromptVolumeAiFilters]);

  const engagementInstantPies = useMemo(
    () => (statsGroupMode === "model" ? engagementByModelPies : engagementByServicePies),
    [statsGroupMode, engagementByModelPies, engagementByServicePies]
  );

  const ENGAGEMENT_PIES_INITIAL_COUNT = 3;
  const engagementPiesVisible = engagementPiesExpanded
    ? engagementInstantPies
    : engagementInstantPies.slice(0, ENGAGEMENT_PIES_INITIAL_COUNT);
  const engagementPiesHasMore = engagementInstantPies.length > ENGAGEMENT_PIES_INITIAL_COUNT;

  useEffect(() => {
    setEngagementPiesExpanded(false);
  }, [days, granularity, statsGroupMode, selectedModelService, selectedModelBuckets, promptVolumeAiFilters]);

  const responseTimeByServiceRows = useMemo(() => {
    if (statsGroupMode === "model") return [];
    const rows: Array<{ service: string; key: string; seconds: number; fill: string }> = [];
    for (const row of displayStats?.latency_comparison_ai ?? []) {
      if (row.service_key === "unknown") continue;
      const key = row.service_key as PromptVolumeAiKey;
      if (!effectivePromptVolumeAiFilters[key]) continue;
      const ms = row.native_avg_host_roundtrip_ms;
      if (typeof ms !== "number" || ms <= 0) continue;
      const filter = PROMPT_VOLUME_AI_FILTERS.find((f) => f.key === key);
      rows.push({
        service: filter?.label ?? row.service_key,
        key,
        seconds: Math.round((ms / 1000) * 10) / 10,
        fill: filter?.color ?? COLOR_UNKNOWN
      });
    }
    for (const toolKey of ["claude_code", "cursor", "codex"] as const) {
      if (!effectivePromptVolumeAiFilters[toolKey]) continue;
      const summary = displayIdeStats?.response_latency_by_tool?.[toolKey];
      if (!summary || typeof summary.avg_ms !== "number" || summary.avg_ms <= 0) continue;
      const filter = PROMPT_VOLUME_AI_FILTERS.find((f) => f.key === toolKey);
      rows.push({
        service: filter?.label ?? toolKey,
        key: toolKey,
        seconds: Math.round((summary.avg_ms / 1000) * 10) / 10,
        fill: filter?.color ?? COLOR_UNKNOWN
      });
    }
    return rows.sort((a, b) => b.seconds - a.seconds);
  }, [statsGroupMode, displayStats, displayIdeStats, effectivePromptVolumeAiFilters]);

  const responseTimeOverTimeRows = useMemo(() => {
    if (statsGroupMode === "model") return [];
    const web = displayStats?.response_time_timeline ?? [];
    const ide = displayIdeStats?.response_time_timeline ?? [];
    if (!web.length && !ide.length) return [];
    const webMap = new Map(web.map((row) => [row.bucket, row]));
    const ideMap = new Map(ide.map((row) => [row.bucket, row]));
    const buckets = [...new Set([...web.map((row) => row.bucket), ...ide.map((row) => row.bucket)])].sort();
    return buckets.map((bucket) => {
      const webRow = webMap.get(bucket);
      const ideRow = ideMap.get(bucket);
      return {
        bucket,
        label:
          statsGranularity === "week" ? `wk ${formatShortDay(bucket)}` : formatShortDay(bucket),
        chatgpt: webRow?.chatgpt_s ?? null,
        claude: webRow?.claude_s ?? null,
        gemini: webRow?.gemini_s ?? null,
        claude_code: ideRow?.claude_code_s ?? null,
        cursor: ideRow?.cursor_s ?? null,
        codex: ideRow?.codex_s ?? null
      };
    });
  }, [statsGroupMode, displayStats, displayIdeStats, statsGranularity]);

  const responseTimeOverTimeHasData = useMemo(
    () =>
      responseTimeOverTimeRows.some((row) =>
        SCREEN_TIME_OVER_TIME_FILTERS.some(
          (filter) =>
            effectivePromptVolumeAiFilters[filter.key] &&
            (row[SCREEN_TIME_TIMELINE_KEY[filter.key]] ?? 0) > 0
        )
      ),
    [responseTimeOverTimeRows, effectivePromptVolumeAiFilters]
  );

  const responseTimeByModelRows = useMemo(() => {
    if (statsGroupMode !== "model") return [];
    return activeModelChartSeries
      .map((series) => {
        let seconds: number | null = null;
        if (isIdeServiceKey(selectedModelService)) {
          const row = (displayIdeStats?.model_buckets ?? []).find(
            (entry) => entry.tool === selectedModelService && entry.bucket === series.bucket
          );
          seconds =
            row && typeof row.avg_response_ms === "number" && row.avg_response_ms > 0
              ? Math.round((row.avg_response_ms / 1000) * 10) / 10
              : null;
        } else {
          const row = (displayStats?.model_response_latency ?? []).find(
            (entry) => entry.bucket === series.bucket
          );
          seconds = row && row.avg_s > 0 ? row.avg_s : null;
        }
        if (seconds === null) return null;
        return { model: series.label, key: series.bucket, seconds, fill: series.color };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.seconds - a.seconds);
  }, [statsGroupMode, activeModelChartSeries, selectedModelService, displayIdeStats, displayStats]);

  const modelResponseTimeOverTimeRows = useMemo(() => {
    if (statsGroupMode !== "model") return [];
    const timeline = isIdeServiceKey(selectedModelService)
      ? displayIdeStats?.model_response_time_timeline
      : displayStats?.model_response_time_timeline;
    if (!timeline?.length || !activeModelChartSeries.length) return [];
    return timeline.map((row) => {
      const out: Record<string, string | number | null> = {
        bucket: row.bucket,
        label:
          statsGranularity === "week"
            ? `wk ${formatShortDay(row.bucket)}`
            : formatShortDay(row.bucket)
      };
      for (const series of activeModelChartSeries) {
        const value = row.models[series.bucket];
        out[series.dataKey] = typeof value === "number" && value > 0 ? value : null;
      }
      return out;
    });
  }, [statsGroupMode, selectedModelService, displayIdeStats, displayStats, activeModelChartSeries, statsGranularity]);

  const modelResponseTimeOverTimeHasData = useMemo(
    () =>
      modelResponseTimeOverTimeRows.some((row) =>
        activeModelChartSeries.some((series) => Number(row[series.dataKey] ?? 0) > 0)
      ),
    [modelResponseTimeOverTimeRows, activeModelChartSeries]
  );

  const responseTimeSectionHasData =
    statsGroupMode === "model"
      ? responseTimeByModelRows.length > 0 || modelResponseTimeOverTimeHasData
      : responseTimeByServiceRows.length > 0 || responseTimeOverTimeHasData;

  const responseTimeByServiceSectionHeight = Math.max(
    120,
    (statsGroupMode === "model" ? responseTimeByModelRows.length : responseTimeByServiceRows.length) * 44 + 24
  );

  const promptLengthChartRows = useMemo(() => {
    const rows: Array<{ label: string; avg_words: number; fill: string; key: string }> = [];

    if (statsGroupMode === "model") {
      for (const series of activeModelChartSeries) {
        const row = isIdeServiceKey(selectedModelService)
          ? modelCatalogIde.find(
              (entry) => entry.tool === selectedModelService && entry.bucket === series.bucket
            )
          : modelCatalogWeb.find(
              (entry) =>
                entry.service === webServiceFromFilterKey(selectedModelService) &&
                entry.bucket === series.bucket
            );
        const avgWords =
          row && "avg_words" in row && row.avg_words && row.avg_words > 0 ? row.avg_words : null;
        if (avgWords) {
          rows.push({
            label: series.label,
            avg_words: avgWords,
            fill: series.color,
            key: series.bucket
          });
        }
      }
    } else {
      for (const filter of PROMPT_VOLUME_AI_FILTERS) {
        if (!effectivePromptVolumeAiFilters[filter.key]) continue;
        if (isIdeServiceKey(filter.key)) {
          const avg = displayIdeStats?.avg_words_by_tool?.[filter.key];
          if (avg?.avg_words && avg.avg_words > 0) {
            rows.push({
              label: filter.label,
              avg_words: avg.avg_words,
              fill: filter.color,
              key: filter.key
            });
          }
        } else {
          const svc = webServiceFromFilterKey(filter.key);
          const avg = displayStats?.avg_words_by_service?.[svc];
          if (avg?.avg_words && avg.avg_words > 0) {
            rows.push({
              label: filter.label,
              avg_words: avg.avg_words,
              fill: filter.color,
              key: filter.key
            });
          }
        }
      }
    }

    return rows.sort((a, b) => b.avg_words - a.avg_words || a.label.localeCompare(b.label));
  }, [
    statsGroupMode,
    selectedModelService,
    selectedModelBuckets,
    modelCatalogIde,
    modelCatalogWeb,
    activeModelChartSeries,
    effectivePromptVolumeAiFilters,
    displayIdeStats,
    displayStats
  ]);

  const promptLengthSectionHeight = Math.max(140, promptLengthChartRows.length * 40 + 48);

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
      engagementByModelPies.length > 0 ||
      engagementOverTimeHasData ||
      (displayStats?.engagement_totals?.segment_count ?? 0) > 0,
    [engagementByServicePies, engagementByModelPies, engagementOverTimeHasData, displayStats]
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
      { key: "chatgpt", on: effectivePromptVolumeAiFilters.chatgpt },
      { key: "claude", on: effectivePromptVolumeAiFilters.claude },
      { key: "gemini", on: effectivePromptVolumeAiFilters.gemini },
      { key: "unknown", on: effectivePromptVolumeAiFilters.other }
    ];
    return services.reduce((sum, svc) => {
      if (!svc.on) return sum;
      return sum + (displayStats.screen_time_by_service[svc.key]?.total_minutes ?? 0);
    }, 0);
  }, [displayStats, effectivePromptVolumeAiFilters]);

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
      filters: effectivePromptVolumeAiFilters,
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
    effectivePromptVolumeAiFilters,
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
    <div
      ref={statsContainerRef}
      className={`statistics-charts mx-auto w-full max-w-6xl ${embedded ? "pb-8" : "px-4 py-6 pb-16"}`}
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-ink">AI Statistics</h1>
        <div className="flex flex-wrap items-center gap-2">
          {!embedded ? (
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream-dark sm:text-sm"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to account
            </Link>
          ) : null}
          <button
            type="button"
            disabled={!user || !statisticsReportData || statsLoading || reportGenerating}
            onClick={() => void handlePrintReport()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream-dark disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"
              />
            </svg>
            {reportGenerating ? "Preparing report…" : "Print Report"}
          </button>
        </div>
      </div>

      {!user && !loading ? (
        <div className="rounded-2xl border border-line bg-cream p-12 text-center backdrop-blur-md">
          <p className="text-muted">Sign in to view your AI usage and prompting statistics.</p>
          <Link
            href="/account?tab=settings"
            className="mt-4 inline-flex justify-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-neutral-800"
          >
            Go to account settings
          </Link>
        </div>
      ) : null}

      {user && displayStats ? (
        <>
          <div ref={filterSentinelRef} className="pointer-events-none h-0 w-full" aria-hidden />
          <div
            ref={filterBarRef}
            data-onboarding-tour="statistics-filters"
            className={`sticky z-40 mb-4 rounded-xl border border-black bg-cream-dark px-3 py-2.5 ${
              filterBarStuck
                ? "shadow-[0_0_18px_6px_rgba(255,255,255,0.95),0_0_36px_14px_rgba(255,255,255,0.65),0_0_56px_24px_rgba(255,255,255,0.35)]"
                : ""
            }`}
            style={{ top: STATS_FILTER_STICKY_TOP_PX }}
          >
            <div className="flex flex-col gap-2">
              <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`mr-1 ${STATS_FILTER_LABEL_CLASS}`}>Range</span>
                    {STATS_RANGE_OPTIONS.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setDays(option.days)}
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                          days === option.days ? "bg-ink text-cream" : "border border-line text-faint hover:bg-cream-dark"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="hidden h-5 w-px shrink-0 bg-line sm:block" aria-hidden />
                  <StatsGroupModeToggle value={statsGroupMode} onChange={setStatsGroupMode} />
                  {statsGroupMode === "model" ? (
                    <label className={`flex items-center gap-1.5 ${STATS_FILTER_LABEL_CLASS}`}>
                      Service
                      <select
                        value={selectedModelService}
                        onChange={(e) => setSelectedModelService(e.target.value as PromptVolumeAiKey)}
                        className="max-w-[10rem] rounded-md border border-line bg-cream px-1.5 py-0.5 text-xs text-ink"
                      >
                        {sortedPromptVolumeAiFilters.map((filter) => (
                          <option key={filter.key} value={filter.key}>
                            {filter.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">
                  <label className={`flex items-center gap-1.5 ${STATS_FILTER_LABEL_CLASS}`}>
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
                    className={`min-w-[5.5rem] shrink-0 whitespace-nowrap rounded-md border border-line px-3 py-0.5 text-center hover:bg-cream-dark disabled:opacity-50 ${STATS_FILTER_LABEL_CLASS}`}
                  >
                    {statsLoading || ideStatsLoading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-line/70 pt-2">
                <span className={`mr-1 shrink-0 ${STATS_FILTER_LABEL_CLASS}`}>
                  Show
                </span>
                {statsGroupMode === "service"
                  ? sortedPromptVolumeAiFilters.map((filter) => (
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
                    ))
                  : modelOptionsForSelectedService.map((row) => {
                      const bucket = row.bucket;
                      const label = isIdeServiceKey(selectedModelService)
                        ? formatIdeModelLabel(row as IdeStatsPayload["model_buckets"][number])
                        : ("label" in row && row.label) || row.bucket;
                      const pressed = selectedModelBuckets.has(bucket);
                      return (
                        <PromptVolumeAiToggleButton
                          key={bucket}
                          label={label}
                          color={modelBucketColors.get(bucket) ?? COLOR_UNKNOWN}
                          pressed={pressed}
                          disabled={pressed && selectedModelBuckets.size <= 1}
                          onToggle={() => toggleModelBucket(bucket)}
                        />
                      );
                    })}
              </div>
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
          <section className="mb-8 rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">Prompt volume</h2>
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
                {statsGroupMode === "model" && activeModelChartSeries.length ? (
                  <BarChart data={modelPromptVolumeChartRows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                    <YAxis stroke={CHART_X_DATE_STROKE} allowDecimals={false} width={32} tick={CHART_Y_TICK} />
                    <Tooltip
                      cursor={{ fill: CHART_CURSOR_FILL }}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number, name: string) => [formatChartNumber(value), name]}
                    />
                    {activeModelChartSeries.map((series, index, visible) => (
                      <Bar
                        key={series.dataKey}
                        dataKey={series.dataKey}
                        name={series.label}
                        stackId="model_prompts"
                        fill={series.color}
                        radius={
                          index === visible.length - 1
                            ? ([2, 2, 0, 0] as [number, number, number, number])
                            : undefined
                        }
                      />
                    ))}
                  </BarChart>
                ) : (
                <ComposedChart data={promptVolumeChartRows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                  <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                  <YAxis stroke={CHART_X_DATE_STROKE} allowDecimals={false} width={32} tick={CHART_Y_TICK} />
                  <Tooltip
                    cursor={{ fill: CHART_CURSOR_FILL }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const items = payload.filter((entry) => entry.dataKey !== "volume_trend");
                      if (!items.length) return null;
                      return (
                        <div style={CHART_TOOLTIP_STYLE}>
                          {label ? (
                            <p className="mb-0.5 text-[10px] font-semibold leading-tight text-ink">{label}</p>
                          ) : null}
                          <div className="space-y-0.5">
                            {items.map((entry) => (
                              <p
                                key={String(entry.dataKey)}
                                className="text-[10px] leading-tight tabular-nums"
                                style={{ color: entry.color ?? "#1F1B16" }}
                              >
                                {entry.name}: {formatChartNumber(entry.value)}
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                  {sortedPromptVolumeAiFilters.filter((f) => effectivePromptVolumeAiFilters[f.key]).map((filter, index, visible) => (
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
                )}
              </ResponsiveContainer>
            </div>
            {statsGroupMode === "model" && activeModelChartSeries.length ? (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-line pt-3">
                {activeModelChartSeries.map((series) => (
                  <span key={series.bucket} className="inline-flex items-center gap-2 text-xs text-muted">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: series.color }}
                      aria-hidden
                    />
                    {series.label}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <>
              <section className="mb-8 w-full rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">
                    {statsGroupMode === "model" ? "Screen time by model" : "Screen time by service"}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {screenTimeView === "instant" ? (
                      <p className="text-xs font-medium tabular-nums text-muted">{rangeSummaryLabel}</p>
                    ) : null}
                    <StatsChartHorizonToggle value={screenTimeView} onChange={setScreenTimeView} />
                  </div>
                </div>
                {screenTimeView === "instant" && statsGroupMode !== "model" ? (
                  <p className="mb-3 text-[11px] text-faint">
                    Total foreground minutes in the selected range — filtered by Show above.
                  </p>
                ) : null}
                {statsGroupMode === "model" ? (
                  activeModelChartSeries.length ? (
                    screenTimeView === "over_time" ? (
                      modelScreenTimeOverTimeHasData ? (
                        <>
                          <div key="screen-model-over-time" className="h-72 w-full sm:h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={modelScreenTimeOverTimeRows}
                                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                                <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                                <YAxis stroke={CHART_X_DATE_STROKE} allowDecimals={false} width={32} tick={CHART_Y_TICK} unit=" min" />
                                <Tooltip
                                  cursor={{ fill: CHART_CURSOR_FILL }}
                                  contentStyle={CHART_TOOLTIP_STYLE}
                                  formatter={(value: number, name: string) => [`${formatChartNumber(value)} min`, name]}
                                />
                                {activeModelChartSeries.map((series, index, visible) => (
                                  <Bar
                                    key={series.dataKey}
                                    dataKey={series.dataKey}
                                    name={series.label}
                                    stackId="model_screen_time"
                                    fill={series.color}
                                    radius={
                                      index === visible.length - 1
                                        ? ([2, 2, 0, 0] as [number, number, number, number])
                                        : undefined
                                    }
                                  />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-line pt-3">
                            {activeModelChartSeries.map((series) => (
                              <span key={series.bucket} className="inline-flex items-center gap-2 text-xs text-muted">
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: series.color }}
                                  aria-hidden
                                />
                                {series.label}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted">No screen time over time for the selected models in this range yet.</p>
                      )
                    ) : screenTimeByModelInstantRows.length ? (
                      <>
                        <div
                          key="screen-model-instant"
                          className="w-full"
                          style={{ height: Math.max(120, screenTimeByModelInstantRows.length * 44 + 24) }}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={screenTimeByModelInstantRows}
                              layout="vertical"
                              margin={{ top: 4, right: barLabelRightMargin(screenTimeByModelInstantRows), bottom: 4, left: 4 }}
                              barCategoryGap="12%"
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
                              <XAxis type="number" stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK} unit=" min" />
                              <YAxis
                                type="category"
                                dataKey="model"
                                stroke={CHART_X_DATE_STROKE}
                                tick={CHART_Y_TICK_11}
                                width={120}
                                reversed
                              />
                              <Tooltip
                                contentStyle={CHART_TOOLTIP_STYLE}
                                formatter={(value: number) => [`${formatChartNumber(value)} min`, "Screen time"]}
                              />
                              <Bar dataKey="minutes" name="Screen time" radius={[0, 4, 4, 0]} barSize={18}>
                                {screenTimeByModelInstantRows.map((entry) => (
                                  <Cell key={entry.key} fill={entry.fill} fillOpacity={0.95} />
                                ))}
                                <LabelList dataKey="barLabel" content={BarEndPercentLabel} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-line pt-3">
                          {activeModelChartSeries.map((series) => (
                            <span key={series.bucket} className="inline-flex items-center gap-2 text-xs text-muted">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: series.color }}
                                aria-hidden
                              />
                              {series.label}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted">No screen time for the selected models in this range yet.</p>
                    )
                  ) : (
                    <p className="text-sm text-muted">Select at least one submodel under Show to view screen time.</p>
                  )
                ) : screenTimeByServiceRows.length ? (
                  screenTimeView === "over_time" ? (
                    screenTimeOverTimeHasData ? (
                      <div key="screen-service-over-time" className="h-72 w-full sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={screenTimeOverTimeChartRows}
                            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                            <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                            <YAxis stroke={CHART_X_DATE_STROKE} allowDecimals={false} width={32} tick={CHART_Y_TICK} unit=" min" />
                            <Tooltip
                              cursor={{ fill: CHART_CURSOR_FILL }}
                              contentStyle={CHART_TOOLTIP_STYLE}
                              formatter={(value: number, name: string) => [`${formatChartNumber(value)} min`, name]}
                            />
                            <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                            {SCREEN_TIME_OVER_TIME_FILTERS.filter((f) => effectivePromptVolumeAiFilters[f.key]).map(
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
                    <div
                      key="screen-service-instant"
                      className="w-full"
                      style={{ height: screenTimeByServiceSectionHeight }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={screenTimeByServiceRows}
                          layout="vertical"
                          margin={{ top: 4, right: barLabelRightMargin(screenTimeByServiceRows), bottom: 4, left: 4 }}
                          barCategoryGap="12%"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
                          <XAxis type="number" stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK} unit=" min" />
                          <YAxis
                            type="category"
                            dataKey="service"
                            stroke={CHART_X_DATE_STROKE}
                            tick={CHART_Y_TICK_11}
                            width={screenTimeServiceLabelWidth}
                          />
                          <Tooltip
                            contentStyle={CHART_TOOLTIP_STYLE}
                            formatter={(value: number) => [`${formatChartNumber(value)} min`, "Screen time"]}
                          />
                          <Bar dataKey="minutes" name="Screen time" radius={[0, 4, 4, 0]} barSize={18}>
                            {screenTimeByServiceRows.map((entry) => (
                              <Cell key={entry.key} fill={entry.fill} fillOpacity={0.95} />
                            ))}
                            <LabelList dataKey="barLabel" content={BarEndPercentLabel} />
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

              <section className="mb-8 w-full rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
                <div className="mb-3 grid grid-cols-1 items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink sm:justify-self-start">
                    How you spend your time
                  </h2>
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted sm:justify-self-center">
                    {ENGAGEMENT_OVER_TIME_SERIES.map((series) => (
                      <span key={series.dataKey} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />
                        {series.name}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-self-end">
                    {engagementView === "instant" ? (
                      <p className="text-xs font-medium tabular-nums text-muted">{rangeSummaryLabel}</p>
                    ) : null}
                    <StatsChartHorizonToggle value={engagementView} onChange={setEngagementView} />
                  </div>
                </div>
                {engagementView === "over_time" ? (
                  <div key="engagement-over-time">
                  {engagementOverTimeHasData ? (
                    <>
                      <div className="h-72 w-full sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={engagementOverTimeChartRows}
                            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                            <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                            <YAxis stroke={CHART_X_DATE_STROKE} allowDecimals={false} width={32} tick={CHART_Y_TICK} unit=" min" />
                            <Tooltip
                              cursor={{ fill: CHART_CURSOR_FILL }}
                              contentStyle={CHART_TOOLTIP_STYLE}
                              formatter={(value: number, name: string) => [`${formatChartNumber(value)} min`, name]}
                            />
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
                  )}
                  </div>
                ) : engagementInstantPies.length > 0 ? (
                  <div key="engagement-instant">
                    {(() => {
                      const pieRows: (typeof engagementPiesVisible)[] = [];
                      for (let i = 0; i < engagementPiesVisible.length; i += ENGAGEMENT_PIES_INITIAL_COUNT) {
                        pieRows.push(engagementPiesVisible.slice(i, i + ENGAGEMENT_PIES_INITIAL_COUNT));
                      }
                      return pieRows.map((rowPies, rowIndex) => (
                        <div
                          key={`pie-row-${rowIndex}`}
                          className={rowIndex > 0 ? "mt-8 border-t border-line/50 pt-8" : undefined}
                        >
                          <div
                            className={`grid justify-items-center gap-8 ${
                              rowPies.length === 1
                                ? "grid-cols-1 max-w-xs mx-auto"
                                : rowPies.length === 2
                                  ? "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto"
                                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                            }`}
                          >
                            {rowPies.map((pie) => (
                              <ServiceEngagementDonut
                                key={pie.key}
                                label={pie.label}
                                totalMinutes={pie.totalMinutes}
                                slices={pie.slices}
                              />
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                    {engagementPiesHasMore ? (
                      <div className="mt-6 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setEngagementPiesExpanded((prev) => !prev)}
                          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-cream-dark"
                        >
                          {engagementPiesExpanded
                            ? "Show less"
                            : `See more (${engagementInstantPies.length - ENGAGEMENT_PIES_INITIAL_COUNT} more)`}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : engagementByServiceEnabledCount > 0 ? (
                  <p className="text-sm text-muted">
                    {statsGroupMode === "model"
                      ? "No engagement breakdown for the selected models in this range yet."
                      : "No engagement breakdown for the selected services in this range yet."}
                  </p>
                ) : (
                  <p className="text-sm text-muted">Turn on at least one service under Show to view how you spend time.</p>
                )}
              </section>
          </>

          {promptLengthChartRows.length ? (
            <section className="mb-8 w-full rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
              <h2 className="mb-1 text-base font-semibold uppercase tracking-[0.22em] text-ink">
                Prompt length (words)
              </h2>
              <p className="mb-3 text-[11px] text-faint">
                Average prompt length at submit for the selection above — metadata only, never full text.
              </p>
              <div className="w-full" style={{ height: promptLengthSectionHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={promptLengthChartRows}
                    layout="vertical"
                    margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                    barCategoryGap="18%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
                    <XAxis type="number" stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK} allowDecimals />
                    <YAxis
                      type="category"
                      dataKey="label"
                      stroke={CHART_X_DATE_STROKE}
                      tick={CHART_Y_TICK_11}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number) => [`${formatChartNumber(value)} words`, "Avg length"]}
                    />
                    <Bar dataKey="avg_words" name="Avg words" radius={[0, 4, 4, 0]} barSize={16}>
                      {promptLengthChartRows.map((entry) => (
                        <Cell key={entry.key} fill={entry.fill} fillOpacity={0.95} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          {responseTimeSectionHasData ? (
            <section className="mb-8 w-full rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">
                  {statsGroupMode === "model" ? "Average AI response time by model" : "Average AI response time"}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {responseTimeView === "instant" ? (
                    <p className="text-xs font-medium tabular-nums text-muted">{rangeSummaryLabel}</p>
                  ) : null}
                  <StatsChartHorizonToggle value={responseTimeView} onChange={setResponseTimeView} />
                </div>
              </div>
              {statsGroupMode === "model" ? (
                responseTimeView === "over_time" ? (
                  modelResponseTimeOverTimeHasData ? (
                    <>
                      <div key="response-model-over-time" className="h-72 w-full sm:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={modelResponseTimeOverTimeRows}
                            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                            <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                            <YAxis stroke={CHART_X_DATE_STROKE} width={40} tick={CHART_Y_TICK} unit=" s" allowDecimals />
                            <Tooltip
                              cursor={{ fill: CHART_CURSOR_FILL }}
                              contentStyle={CHART_TOOLTIP_STYLE}
                              formatter={(value: number, name: string) => [`${formatChartNumber(value)} s`, name]}
                            />
                            {activeModelChartSeries.map((series, index, visible) => (
                              <Bar
                                key={series.dataKey}
                                dataKey={series.dataKey}
                                name={series.label}
                                stackId="model_response_time"
                                fill={series.color}
                                radius={
                                  index === visible.length - 1
                                    ? ([2, 2, 0, 0] as [number, number, number, number])
                                    : undefined
                                }
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-line pt-3">
                        {activeModelChartSeries.map((series) => (
                          <span key={series.bucket} className="inline-flex items-center gap-2 text-xs text-muted">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: series.color }}
                              aria-hidden
                            />
                            {series.label}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted">No response time over time for the selected models in this range yet.</p>
                  )
                ) : responseTimeByModelRows.length ? (
                  <div
                    key="response-model-instant"
                    className="w-full"
                    style={{ height: responseTimeByServiceSectionHeight }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={responseTimeByModelRows}
                        layout="vertical"
                        margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                        barCategoryGap="18%"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
                        <XAxis type="number" stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK} unit=" s" allowDecimals />
                        <YAxis
                          type="category"
                          dataKey="model"
                          stroke={CHART_X_DATE_STROKE}
                          tick={CHART_Y_TICK_11}
                          width={140}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number) => [`${formatChartNumber(value)} s`, "Average response"]}
                        />
                        <Bar dataKey="seconds" name="Average response" radius={[0, 4, 4, 0]} barSize={16}>
                          {responseTimeByModelRows.map((entry) => (
                            <Cell key={entry.key} fill={entry.fill} fillOpacity={0.95} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted">No response time for the selected models in this range yet.</p>
                )
              ) : responseTimeView === "over_time" ? (
                responseTimeOverTimeHasData ? (
                  <div key="response-service-over-time" className="h-72 w-full sm:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={responseTimeOverTimeRows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                        <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                        <YAxis stroke={CHART_X_DATE_STROKE} width={40} tick={CHART_Y_TICK} unit=" s" allowDecimals />
                        <Tooltip
                          cursor={{ fill: CHART_CURSOR_FILL }}
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number, name: string) => [`${formatChartNumber(value)} s`, name]}
                        />
                        <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                        {SCREEN_TIME_OVER_TIME_FILTERS.filter((f) => effectivePromptVolumeAiFilters[f.key]).map(
                          (filter, index, visible) => (
                            <Bar
                              key={filter.key}
                              dataKey={SCREEN_TIME_TIMELINE_KEY[filter.key]}
                              name={filter.legendName}
                              stackId="response_time"
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
                  <p className="text-sm text-muted">No response time over time for the selected services in this range yet.</p>
                )
              ) : responseTimeByServiceRows.length ? (
                <div
                  key="response-service-instant"
                  className="w-full"
                  style={{ height: responseTimeByServiceSectionHeight }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={responseTimeByServiceRows}
                      layout="vertical"
                      margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                      barCategoryGap="18%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
                      <XAxis type="number" stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK} unit=" s" allowDecimals />
                      <YAxis
                        type="category"
                        dataKey="service"
                        stroke={CHART_X_DATE_STROKE}
                        tick={CHART_Y_TICK_11}
                        width={screenTimeServiceLabelWidth}
                      />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number) => [`${formatChartNumber(value)} s`, "Average response"]}
                      />
                      <Bar dataKey="seconds" name="Average response" radius={[0, 4, 4, 0]} barSize={16}>
                        {responseTimeByServiceRows.map((entry) => (
                          <Cell key={entry.key} fill={entry.fill} fillOpacity={0.95} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted">No response time for the selected services in this range yet.</p>
              )}
            </section>
          ) : null}

          <div className="my-10 border-t border-line" role="separator" />

          <VendorUsageSection user={user} rangeDays={days} />

          <h2 className="mb-6 text-base font-semibold uppercase tracking-[0.22em] text-ink">Promptly Labs Diagnostics</h2>

          {/* Promptly impact scores (left) + average draft chart (right) */}
          {modelTimeChartRows.length ||
          promptDerivedScores?.efficiencyPercent != null ||
          promptDerivedScores?.qualityPercent != null ? (
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-stretch">
              {promptDerivedScores?.efficiencyPercent != null ||
              promptDerivedScores?.qualityPercent != null ? (
                <section
                  className="flex w-full flex-col rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4 lg:w-1/2"
                  style={{ minHeight: modelTimeChartRows.length ? modelTimeSectionHeight : undefined }}
                >
                  <h2 className="mb-3 text-base font-semibold uppercase tracking-[0.22em] text-ink">Promptly impact</h2>
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
                <section className="w-full rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4 lg:w-1/2">
                  <h2 className="mb-3 text-base font-semibold uppercase tracking-[0.22em] text-ink">
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
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
                        <XAxis type="number" stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK} unit="s" />
                        <YAxis
                          type="category"
                          dataKey="model"
                          stroke={CHART_X_DATE_STROKE}
                          tick={CHART_Y_TICK_11}
                          width={72}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number, name: string) => {
                            if (typeof value !== "number" || value <= 0) return ["—", name];
                            return [`${formatChartNumber(value)}s`, name];
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
          <section className="mb-12 rounded-2xl border border-line bg-white p-6 backdrop-blur-md">
            <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">Rewrite vs native turnaround time</h2>
            <div className="mt-4 h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={latencyChartRows} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                  <XAxis dataKey="ai" stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK_11} />
                  <YAxis stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK_11} label={CHART_AXIS_LABEL("Seconds (avg)")} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [`${formatChartNumber(value)} s`, name]}
                  />
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
            <section className="mb-12 rounded-2xl border border-line bg-white p-6 backdrop-blur-md">
              <h2 className="mb-3 text-base font-semibold uppercase tracking-[0.22em] text-ink">Words before Promptly</h2>
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
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                      <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                      <YAxis
                        stroke={CHART_X_DATE_STROKE}
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
                          return [`${formatChartNumber(value)} words (${runs.toLocaleString()} runs)`, name];
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
            <div className="rounded-2xl border border-line bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Improve mode mixes</h3>
              <ModeMiniChart modes={displayStats.breakdowns_from_events.mode} />
            </div>
            <div className="rounded-2xl border border-line bg-white p-6">
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
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                    <YAxis stroke={CHART_X_DATE_STROKE} tick={CHART_Y_TICK} />
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
