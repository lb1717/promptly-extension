"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  buildHomeDemoPromptVolume,
  HOME_DEMO_AI_SERIES,
  homeDemoVolumeGrowthPercent
} from "@/lib/homeDemoPromptVolume";
import { useMemo } from "react";
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

const CHART_FONT_FAMILY = "var(--font-roboto-chart), Roboto, sans-serif";
const CHART_Y_TICK = { fill: "#5C5C5C", fontSize: 10, fontFamily: CHART_FONT_FAMILY };
const CHART_X_DATE_TICK = {
  fill: "#2a2a2a",
  fontSize: 11,
  fontWeight: 600 as const,
  fontFamily: CHART_FONT_FAMILY
};
const CHART_X_DATE_STROKE = "#525252";
const CHART_TOOLTIP_STYLE = {
  background: "#FAF8F4",
  border: "1px solid #E0DDD6",
  color: "#111111",
  fontFamily: CHART_FONT_FAMILY
};
const CHART_LEGEND_STYLE = { fontSize: 11, paddingTop: 8, fontFamily: CHART_FONT_FAMILY };
const COLOR_VOLUME_TREND = "#39ff14";

export function HomeAnalyticsSection() {
  const chartRows = useMemo(() => buildHomeDemoPromptVolume(), []);
  const growthPercent = useMemo(() => homeDemoVolumeGrowthPercent(chartRows), [chartRows]);

  return (
    <section id="analytics" className="border-t border-line px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Analytics"
          title="Track AI usage across your firm"
          subtitle="Prompt volume and adoption trends by model."
        />

        <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-cream p-4 shadow-card sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-faint">Prompt volume</h3>
            <p
              className="text-right text-lg font-semibold tabular-nums leading-none text-emerald-800 sm:text-xl"
              title="Illustrative change: first half vs second half of the sample period"
            >
              +{growthPercent}%
            </p>
          </div>
          <p className="mb-4 text-[11px] text-faint">Sample data: weekly prompts across ChatGPT, Claude, and Gemini.</p>

          <div className="h-64 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartRows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
                <YAxis stroke="#8A8A8A" allowDecimals={false} width={32} tick={CHART_Y_TICK} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                {HOME_DEMO_AI_SERIES.map((series, index) => (
                  <Bar
                    key={series.dataKey}
                    dataKey={series.dataKey}
                    name={series.name}
                    stackId="stack"
                    fill={series.color}
                    radius={
                      index === HOME_DEMO_AI_SERIES.length - 1
                        ? ([2, 2, 0, 0] as [number, number, number, number])
                        : undefined
                    }
                  />
                ))}
                <Line
                  type="natural"
                  dataKey="volume_trend"
                  name="Trend"
                  legendType="none"
                  stroke={COLOR_VOLUME_TREND}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

        </div>

        <div className="mx-auto mt-10 max-w-3xl space-y-4 text-center text-sm leading-relaxed text-muted sm:text-base">
          <p>
            Promptly analytics give leaders and ops teams a shared picture of how AI is actually used: which
            models people reach for, whether volume is growing, and where prompting stays efficient versus noisy.
          </p>
          <p>
            Use it to justify licenses, coach teams on structure and intent, and cut wasted tokens across ChatGPT,
            Claude, Gemini, and the rest of your stack.
          </p>
        </div>
      </div>
    </section>
  );
}
