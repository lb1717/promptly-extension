import type { PromptVolumeAiFilterState, StatisticsReportTimelineRow } from "@/lib/statisticsReportTypes";

const CHARTGPT = "#10a37f";
const CLAUDE = "#cc785c";
const GEMINI = "#4285f4";
const OTHER = "#64748b";

type BarSeries = { key: keyof Pick<StatisticsReportTimelineRow, "chatgpt" | "claude" | "gemini" | "other">; color: string; on: boolean };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function subsampleLabels(rows: StatisticsReportTimelineRow[], maxLabels: number): Set<string> {
  if (rows.length <= maxLabels) return new Set(rows.map((r) => r.label));
  const step = Math.ceil(rows.length / maxLabels);
  const labels = new Set<string>();
  rows.forEach((row, index) => {
    if (index % step === 0 || index === rows.length - 1) labels.add(row.label);
  });
  return labels;
}

export function ReportStackedPromptVolumeChart({
  rows,
  filters,
  width = 720,
  height = 140
}: {
  rows: StatisticsReportTimelineRow[];
  filters: PromptVolumeAiFilterState;
  width?: number;
  height?: number;
}) {
  const margin = { top: 10, right: 12, bottom: 32, left: 40 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const series = (
    [
      { key: "chatgpt" as const, color: CHARTGPT, on: filters.chatgpt },
      { key: "claude" as const, color: CLAUDE, on: filters.claude },
      { key: "gemini" as const, color: GEMINI, on: filters.gemini },
      { key: "other" as const, color: OTHER, on: filters.other }
    ] satisfies BarSeries[]
  ).filter((s) => s.on);

  if (!rows.length || !series.length) {
    return (
      <svg width={width} height={height} role="img" aria-label="Prompt volume chart empty">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={10} fill="#666">
          No prompt volume in this period
        </text>
      </svg>
    );
  }

  const maxTotal = niceMax(Math.max(...rows.map((r) => r.total)));
  const barGap = 3;
  const barW = Math.max(4, (plotW - barGap * (rows.length - 1)) / rows.length);
  const labelSet = subsampleLabels(rows, 14);
  const yTicks = [0, maxTotal / 2, maxTotal].map((v) => Math.round(v));

  return (
    <svg width={width} height={height} role="img" aria-label="Prompt volume stacked bar chart">
      {yTicks.map((tick) => {
        const y = margin.top + plotH - (tick / maxTotal) * plotH;
        return (
          <g key={tick}>
            <line x1={margin.left} x2={margin.left + plotW} y1={y} y2={y} stroke="#e5e5e5" strokeWidth={1} />
            <text x={margin.left - 6} y={y + 3} textAnchor="end" fontSize={8} fill="#444">
              {tick}
            </text>
          </g>
        );
      })}
      <line
        x1={margin.left}
        x2={margin.left + plotW}
        y1={margin.top + plotH}
        y2={margin.top + plotH}
        stroke="#222"
        strokeWidth={1}
      />
      {rows.map((row, index) => {
        const x = margin.left + index * (barW + barGap);
        const stackH = row.total > 0 ? (row.total / maxTotal) * plotH : 0;
        let yCursor = margin.top + plotH;
        const segments = series
          .map((s) => ({ ...s, value: row[s.key] }))
          .filter((s) => s.value > 0);
        return (
          <g key={`${row.label}-${index}`}>
            {segments.map((seg) => {
              const h = row.total > 0 ? (seg.value / row.total) * stackH : 0;
              yCursor -= h;
              return (
                <rect
                  key={seg.key}
                  x={x}
                  y={yCursor}
                  width={barW}
                  height={Math.max(h, seg.value > 0 ? 1 : 0)}
                  fill={seg.color}
                  stroke="#fff"
                  strokeWidth={0.5}
                />
              );
            })}
            {labelSet.has(row.label) ? (
              <text
                x={x + barW / 2}
                y={margin.top + plotH + 14}
                textAnchor="middle"
                fontSize={7}
                fill="#333"
              >
                {row.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function ReportHorizontalBarChart({
  rows,
  width = 720,
  height
}: {
  rows: Array<{ label: string; minutes: number; color: string }>;
  width?: number;
  height?: number;
}) {
  const rowHeight = 22;
  const computedHeight = height ?? Math.max(72, rows.length * rowHeight + 16);
  const margin = { top: 8, right: 48, bottom: 8, left: 72 };
  const plotW = width - margin.left - margin.right;
  const max = niceMax(Math.max(1, ...rows.map((r) => r.minutes)));

  if (!rows.length) {
    return (
      <svg width={width} height={computedHeight} role="img" aria-label="Screen time chart empty">
        <text x={width / 2} y={computedHeight / 2} textAnchor="middle" fontSize={10} fill="#666">
          No screen time recorded
        </text>
      </svg>
    );
  }

  return (
    <svg width={width} height={computedHeight} role="img" aria-label="Screen time by service">
      {rows.map((row, index) => {
        const y = margin.top + index * rowHeight;
        const barW = (row.minutes / max) * plotW;
        return (
          <g key={row.label}>
            <text x={margin.left - 8} y={y + 12} textAnchor="end" fontSize={9} fill="#111">
              {row.label}
            </text>
            <rect
              x={margin.left}
              y={y + 2}
              width={plotW}
              height={12}
              fill="#f2f2f2"
              stroke="#ccc"
              strokeWidth={0.5}
            />
            <rect
              x={margin.left}
              y={y + 2}
              width={Math.max(row.minutes > 0 ? 2 : 0, barW)}
              height={12}
              fill={row.color}
            />
            <text x={margin.left + plotW + 8} y={y + 12} fontSize={9} fill="#111">
              {row.minutes}m
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ReportEngagementBreakdownChart({
  slices,
  width = 720,
  height = 36
}: {
  slices: Array<{ label: string; minutes: number; color: string }>;
  width?: number;
  height?: number;
}) {
  const margin = { top: 8, right: 12, bottom: 8, left: 12 };
  const plotW = width - margin.left - margin.right;
  const total = slices.reduce((sum, s) => sum + s.minutes, 0);

  if (total <= 0) {
    return (
      <svg width={width} height={height} role="img" aria-label="Engagement breakdown empty">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={9} fill="#666">
          No engagement time recorded
        </text>
      </svg>
    );
  }

  let x = margin.left;
  return (
    <svg width={width} height={height} role="img" aria-label="Engagement time breakdown">
      {slices.map((slice) => {
        const w = (slice.minutes / total) * plotW;
        const rect = (
          <rect
            key={slice.label}
            x={x}
            y={margin.top}
            width={Math.max(w, slice.minutes > 0 ? 2 : 0)}
            height={14}
            fill={slice.color}
            stroke="#fff"
            strokeWidth={0.5}
          />
        );
        x += w;
        return rect;
      })}
    </svg>
  );
}

export const REPORT_CHART_COLORS = {
  drafting: "#c084fc",
  waiting: "#22d3ee",
  reading: "#94a3b8",
  chatgpt: CHARTGPT,
  claude: CLAUDE,
  gemini: GEMINI,
  other: OTHER
};
