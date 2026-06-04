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

export type StatisticsReportEngagementBreakdown = {
  draftingMinutes: number;
  waitingMinutes: number;
  readingMinutes: number;
  totalMinutes: number;
};

export type StatisticsReportData = {
  userName: string;
  userEmail: string;
  generatedAtLabel: string;
  periodTitle: string;
  periodDetail: string;
  comparisonLabel: string;
  promptVolumeChange: PromptVolumePeriodChange | null;
  promptVolumeTotal: number;
  promptsByService: {
    chatgpt: number;
    claude: number;
    gemini: number;
    other: number;
  };
  totalScreenTimeMinutes: number;
  engagementBreakdown: StatisticsReportEngagementBreakdown;
  screenTimeByService: Array<{ label: string; minutes: number; color: string }>;
  promptTimeline: StatisticsReportTimelineRow[];
  filters: PromptVolumeAiFilterState;
};

type BuildReportParams = {
  userName: string;
  userEmail: string;
  days: number;
  granularity: "day" | "week";
  filters: PromptVolumeAiFilterState;
  promptVolumeChange: PromptVolumePeriodChange | null;
  combinedTotals: {
    prompts_chatgpt_surface: number;
    prompts_claude_surface: number;
    prompts_gemini_surface: number;
    prompts_unknown_surface: number;
  };
  engagementTotals: {
    drafting_minutes: number;
    waiting_minutes: number;
    reading_idle_minutes: number;
  };
  totalScreenTimeMinutes: number;
  screenTimeRows: Array<{ label: string; minutes: number; color: string }>;
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
  const promptsByService = {
    chatgpt: params.filters.chatgpt ? params.combinedTotals.prompts_chatgpt_surface : 0,
    claude: params.filters.claude ? params.combinedTotals.prompts_claude_surface : 0,
    gemini: params.filters.gemini ? params.combinedTotals.prompts_gemini_surface : 0,
    other: params.filters.other ? params.combinedTotals.prompts_unknown_surface : 0
  };
  const promptVolumeTotal =
    promptsByService.chatgpt + promptsByService.claude + promptsByService.gemini + promptsByService.other;

  const promptTimeline: StatisticsReportTimelineRow[] = subsampleTimelineRows(params.timelineRows).map((row) => ({
    label: row.label,
    chatgpt: params.filters.chatgpt ? row.prompts_chatgpt : 0,
    claude: params.filters.claude ? row.prompts_claude : 0,
    gemini: params.filters.gemini ? row.prompts_gemini : 0,
    other: params.filters.other ? row.prompts_unknown : 0,
    total: bucketTotalForFilters(row, params.filters)
  }));

  const engagementBreakdown: StatisticsReportEngagementBreakdown = {
    draftingMinutes: params.engagementTotals.drafting_minutes,
    waitingMinutes: params.engagementTotals.waiting_minutes,
    readingMinutes: params.engagementTotals.reading_idle_minutes,
    totalMinutes:
      params.engagementTotals.drafting_minutes +
      params.engagementTotals.waiting_minutes +
      params.engagementTotals.reading_idle_minutes
  };

  return {
    userName: params.userName,
    userEmail: params.userEmail,
    generatedAtLabel: new Date().toLocaleString(undefined, {
      dateStyle: "long",
      timeStyle: "short"
    }),
    periodTitle: `Last ${params.days} days`,
    periodDetail: `${granularityLabel} aggregation · ${params.promptVolumeChange?.comparisonLabel ?? "prior period comparison"}`,
    comparisonLabel: params.promptVolumeChange?.comparisonLabel ?? "vs prior period in range",
    promptVolumeChange: params.promptVolumeChange,
    promptVolumeTotal,
    promptsByService,
    totalScreenTimeMinutes: params.totalScreenTimeMinutes,
    engagementBreakdown,
    screenTimeByService: params.screenTimeRows,
    promptTimeline,
    filters: params.filters
  };
}

export { formatSignedPercent };
