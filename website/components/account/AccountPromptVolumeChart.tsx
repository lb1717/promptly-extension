"use client";

import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const ACCOUNT_PROMPT_VOLUME_DAYS = 7;

const COLOR_CHATGPT_WEB = "#0e9068";
const COLOR_CODEX = "#22c997";
const COLOR_CLAUDE_WEB = "#b86b4a";
const COLOR_CLAUDE_CODE = "#e8956f";
const COLOR_GEMINI_WEB = "#4285f4";
const COLOR_CURSOR = "#9333ea";
const COLOR_UNKNOWN = "#64748b";
const COLOR_VOLUME_TREND = "#525252";

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#fdfdfc",
  border: "1px solid #e5e2db",
  borderRadius: 12,
  padding: "10px 12px",
  boxShadow: "0 8px 24px rgba(17, 17, 17, 0.08)"
} as const;

const CHART_LEGEND_STYLE = { fontSize: 11, paddingTop: 8 };

const PROMPT_VOLUME_SERIES = [
  { dataKey: "prompts_chatgpt", name: "ChatGPT (Web)", color: COLOR_CHATGPT_WEB },
  { dataKey: "prompts_claude", name: "Claude (Web)", color: COLOR_CLAUDE_WEB },
  { dataKey: "prompts_gemini", name: "Gemini (Web)", color: COLOR_GEMINI_WEB },
  { dataKey: "prompts_claude_code", name: "Claude Code", color: COLOR_CLAUDE_CODE },
  { dataKey: "prompts_cursor", name: "Cursor", color: COLOR_CURSOR },
  { dataKey: "prompts_codex", name: "Codex", color: COLOR_CODEX },
  { dataKey: "prompts_unknown", name: "Other", color: COLOR_UNKNOWN }
] as const;

type PromptVolumeChartRow = {
  bucket: string;
  label: string;
  prompts_chatgpt: number;
  prompts_claude: number;
  prompts_gemini: number;
  prompts_unknown: number;
  prompts_claude_code: number;
  prompts_cursor: number;
  prompts_codex: number;
  volume_trend: number;
};

type ExtendedStatsPayload = {
  combined_prompt_timeline?: Array<{
    bucket: string;
    prompts_chatgpt: number;
    prompts_claude: number;
    prompts_gemini: number;
    prompts_unknown: number;
  }>;
};

type IdeStatsPayload = {
  prompt_timeline?: Array<{
    bucket: string;
    claude_code: number;
    cursor: number;
    codex: number;
  }>;
};

function formatShortDay(isoYmd: string) {
  if (!isoYmd || isoYmd.length < 10) return isoYmd || "—";
  return isoYmd.slice(5).replace("-", "/");
}

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
  for (const value of smoothed) {
    f = alpha * value + (1 - alpha) * f;
    forward.push(f);
  }

  const backward: number[] = [];
  let b = smoothed[smoothed.length - 1] ?? 0;
  for (let i = smoothed.length - 1; i >= 0; i--) {
    b = alpha * (smoothed[i] ?? 0) + (1 - alpha) * b;
    backward.unshift(b);
  }

  return forward.map((value, index) => Math.max(0, Math.round(((value + backward[index]!) / 2) * 10) / 10));
}

function bucketTotal(row: PromptVolumeChartRow): number {
  return (
    row.prompts_chatgpt +
    row.prompts_claude +
    row.prompts_gemini +
    row.prompts_unknown +
    row.prompts_claude_code +
    row.prompts_cursor +
    row.prompts_codex
  );
}

function mergePromptVolumeTimelines(
  web: ExtendedStatsPayload["combined_prompt_timeline"],
  ide: IdeStatsPayload["prompt_timeline"]
): PromptVolumeChartRow[] {
  const webRows = web ?? [];
  const ideRows = ide ?? [];
  const webMap = new Map(webRows.map((row) => [row.bucket, row]));
  const ideMap = new Map(ideRows.map((row) => [row.bucket, row]));
  const buckets = [...new Set([...webRows.map((row) => row.bucket), ...ideRows.map((row) => row.bucket)])].sort();

  return buckets.map((bucket) => {
    const webRow = webMap.get(bucket);
    const ideRow = ideMap.get(bucket);
    return {
      bucket,
      label: formatShortDay(bucket),
      prompts_chatgpt: webRow?.prompts_chatgpt ?? 0,
      prompts_claude: webRow?.prompts_claude ?? 0,
      prompts_gemini: webRow?.prompts_gemini ?? 0,
      prompts_unknown: webRow?.prompts_unknown ?? 0,
      prompts_claude_code: ideRow?.claude_code ?? 0,
      prompts_cursor: ideRow?.cursor ?? 0,
      prompts_codex: ideRow?.codex ?? 0,
      volume_trend: 0
    };
  });
}

export function AccountPromptVolumeChart({
  user,
  refreshKey = 0
}: {
  user: User;
  refreshKey?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<PromptVolumeChartRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken(false);
      const params = new URLSearchParams({
        days: String(ACCOUNT_PROMPT_VOLUME_DAYS),
        granularity: "day"
      });
      const headers = { Authorization: `Bearer ${token}` };
      const [extendedRes, ideRes] = await Promise.all([
        fetch(`/api/account/stats/extended?${params.toString()}`, { headers }),
        fetch(`/api/account/stats/ide?${params.toString()}`, { headers })
      ]);
      const extendedData = await extendedRes.json().catch(() => ({}));
      const ideData = await ideRes.json().catch(() => ({}));
      if (!extendedRes.ok) {
        throw new Error(extendedData?.error || `Request failed (${extendedRes.status})`);
      }
      if (!ideRes.ok) {
        throw new Error(ideData?.error || `Request failed (${ideRes.status})`);
      }

      const merged = mergePromptVolumeTimelines(
        extendedData.combined_prompt_timeline,
        ideData.prompt_timeline
      );
      const totals = merged.map((row) => bucketTotal(row));
      const trend = smoothTrendValues(totals);
      setRows(
        merged.map((row, index) => ({
          ...row,
          volume_trend: trend[index] ?? 0
        }))
      );
    } catch (e) {
      setRows([]);
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const hasData = useMemo(() => rows.some((row) => bucketTotal(row) > 0), [rows]);

  if (loading) {
    return <p className="mt-4 text-sm text-faint">Loading prompt volume…</p>;
  }

  if (error) {
    return <p className="mt-4 text-sm text-amber-800/90">{error}</p>;
  }

  if (!hasData) {
    return <p className="mt-4 text-sm text-faint">No prompt volume in the last 7 days yet.</p>;
  }

  return (
    <div className="mt-4 h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,17,17,0.06)" vertical={false} />
          <XAxis dataKey="label" stroke="#8A8A8A" tick={{ fontSize: 11, fill: "#8A8A8A" }} />
          <YAxis stroke="#8A8A8A" allowDecimals={false} width={32} tick={{ fontSize: 11, fill: "#8A8A8A" }} />
          <Tooltip
            cursor={{ fill: "rgba(17,17,17,0.04)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const items = payload.filter((entry) => entry.dataKey !== "volume_trend");
              if (!items.length) return null;
              return (
                <div style={CHART_TOOLTIP_STYLE}>
                  {label ? <p className="mb-1.5 text-xs font-semibold text-ink">{label}</p> : null}
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
          {PROMPT_VOLUME_SERIES.map((series, index, visible) => (
            <Bar
              key={series.dataKey}
              dataKey={series.dataKey}
              name={series.name}
              stackId="stack"
              fill={series.color}
              radius={
                index === visible.length - 1 ? ([2, 2, 0, 0] as [number, number, number, number]) : undefined
              }
            />
          ))}
          {rows.length >= 2 ? (
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
  );
}
