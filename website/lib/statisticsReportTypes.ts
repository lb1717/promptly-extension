export type PromptVolumeAiKey = "chatgpt" | "claude" | "gemini" | "other";
export type PromptVolumeAiFilterState = Record<PromptVolumeAiKey, boolean>;

export type PromptVolumePeriodChange = {
  percent: number;
  currentTotal: number;
  priorTotal: number;
  comparisonLabel: string;
};

export type StatisticsReportSlice = {
  name: string;
  value: number;
  percent: number;
  color: string;
};

export type StatisticsReportTimelineRow = {
  label: string;
  chatgpt: number;
  claude: number;
  gemini: number;
  other: number;
  total: number;
};

export type StatisticsReportData = {
  generatedAtLabel: string;
  periodTitle: string;
  periodDetail: string;
  comparisonLabel: string;
  promptVolumeChange: PromptVolumePeriodChange | null;
  preImproveWordChangePercent: number | null;
  promptEfficiencyPercent: number | null;
  promptQualityPercent: number | null;
  totals: {
    promptsEstimate: number;
    chatgpt: number;
    claude: number;
    gemini: number;
    other: number;
    promptlySharePercent: number | null;
  };
  timeBalance: {
    draftMinutes: number | null;
    waitMinutes: number | null;
  };
  screenTimeByService: Array<{ label: string; minutes: number; color: string }>;
  engagementByService: Array<{
    label: string;
    accent: string;
    totalMinutes: number;
    slices: StatisticsReportSlice[];
  }>;
  promptTimeline: StatisticsReportTimelineRow[];
  filters: PromptVolumeAiFilterState;
};

type BuildReportParams = {
  days: number;
  granularity: "day" | "week";
  filters: PromptVolumeAiFilterState;
  promptVolumeChange: PromptVolumePeriodChange | null;
  promptEfficiencyPercent: number | null;
  promptQualityPercent: number | null;
  preImproveWordChangePercent: number | null;
  combinedTotals: {
    prompts_estimate: number;
    prompts_chatgpt_surface: number;
    prompts_claude_surface: number;
    prompts_gemini_surface: number;
    prompts_unknown_surface: number;
    promptly_share_of_estimated_prompts_percent: number | null;
  };
  timeBalanceTotals: {
    draft_active_minutes: number | null;
    waiting_for_ai_minutes: number | null;
  } | null;
  screenTimeRows: Array<{ label: string; minutes: number; color: string }>;
  engagementPies: Array<{
    label: string;
    accent: string;
    totalMinutes: number;
    slices: Array<{ name: string; value: number; fill: string }>;
  }>;
  timelineRows: Array<{
    label: string;
    prompts_chatgpt: number;
    prompts_claude: number;
    prompts_gemini: number;
    prompts_unknown: number;
  }>;
};

function bucketTotalForFilters(
  row: {
    prompts_chatgpt: number;
    prompts_claude: number;
    prompts_gemini: number;
    prompts_unknown: number;
  },
  filters: PromptVolumeAiFilterState
): number {
  let total = 0;
  if (filters.chatgpt) total += row.prompts_chatgpt;
  if (filters.claude) total += row.prompts_claude;
  if (filters.gemini) total += row.prompts_gemini;
  if (filters.other) total += row.prompts_unknown;
  return total;
}

function formatSignedPercent(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

function subsampleTimelineRows<T>(rows: T[], maxPoints = 18): T[] {
  if (rows.length <= maxPoints) return rows;
  const step = Math.ceil(rows.length / maxPoints);
  const sampled = rows.filter((_, index) => index % step === 0);
  const last = rows[rows.length - 1];
  if (last && sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
}

export function buildStatisticsReportData(params: BuildReportParams): StatisticsReportData {
  const granularityLabel = params.granularity === "week" ? "weekly (UTC)" : "daily";
  const promptTimeline: StatisticsReportTimelineRow[] = subsampleTimelineRows(params.timelineRows).map((row) => ({
    label: row.label,
    chatgpt: params.filters.chatgpt ? row.prompts_chatgpt : 0,
    claude: params.filters.claude ? row.prompts_claude : 0,
    gemini: params.filters.gemini ? row.prompts_gemini : 0,
    other: params.filters.other ? row.prompts_unknown : 0,
    total: bucketTotalForFilters(row, params.filters)
  }));

  const engagementByService = params.engagementPies.map((pie) => {
    const sliceTotal = pie.slices.reduce((sum, s) => sum + s.value, 0);
    return {
      label: pie.label,
      accent: pie.accent,
      totalMinutes: pie.totalMinutes,
      slices: pie.slices.map((slice) => ({
        name: slice.name,
        value: slice.value,
        color: slice.fill,
        percent: sliceTotal > 0 ? Math.round((slice.value / sliceTotal) * 1000) / 10 : 0
      }))
    };
  });

  return {
    generatedAtLabel: new Date().toLocaleString(undefined, {
      dateStyle: "long",
      timeStyle: "short"
    }),
    periodTitle: `Last ${params.days} days`,
    periodDetail: `${granularityLabel} aggregation · ${params.promptVolumeChange?.comparisonLabel ?? "prior period comparison"}`,
    comparisonLabel: params.promptVolumeChange?.comparisonLabel ?? "vs prior period in range",
    promptVolumeChange: params.promptVolumeChange,
    preImproveWordChangePercent: params.preImproveWordChangePercent,
    promptEfficiencyPercent: params.promptEfficiencyPercent,
    promptQualityPercent: params.promptQualityPercent,
    totals: {
      promptsEstimate: params.combinedTotals.prompts_estimate,
      chatgpt: params.filters.chatgpt ? params.combinedTotals.prompts_chatgpt_surface : 0,
      claude: params.filters.claude ? params.combinedTotals.prompts_claude_surface : 0,
      gemini: params.filters.gemini ? params.combinedTotals.prompts_gemini_surface : 0,
      other: params.filters.other ? params.combinedTotals.prompts_unknown_surface : 0,
      promptlySharePercent: params.combinedTotals.promptly_share_of_estimated_prompts_percent
    },
    timeBalance: {
      draftMinutes: params.timeBalanceTotals?.draft_active_minutes ?? null,
      waitMinutes: params.timeBalanceTotals?.waiting_for_ai_minutes ?? null
    },
    screenTimeByService: params.screenTimeRows,
    engagementByService,
    promptTimeline,
    filters: params.filters
  };
}

export { formatSignedPercent };
