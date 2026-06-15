"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  buildHomeDemoPlanSpend,
  buildHomeDemoScreenTime,
  HOME_DEMO_SCREEN_TIME_SERIES,
  homeDemoPlanSpendTotal,
  homeDemoScreenTimeTotalMinutes,
  type HomeDemoPlanSpendRow
} from "@/lib/homeDemoAnalytics";
import {
  buildHomeDemoPromptVolume,
  HOME_DEMO_AI_SERIES,
  homeDemoVolumeGrowthPercent
} from "@/lib/homeDemoPromptVolume";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const CHART_FONT_FAMILY = "var(--font-roboto-chart), Roboto, sans-serif";
const CHART_Y_TICK = { fill: "#5C5C5C", fontSize: 9, fontFamily: CHART_FONT_FAMILY };
const CHART_X_DATE_TICK = {
  fill: "#2a2a2a",
  fontSize: 10,
  fontWeight: 600 as const,
  fontFamily: CHART_FONT_FAMILY
};
const CHART_X_DATE_STROKE = "#525252";
const CHART_TOOLTIP_STYLE = {
  background: "#FAF8F4",
  border: "1px solid #E0DDD6",
  color: "#111111",
  fontFamily: CHART_FONT_FAMILY,
  fontSize: 11
};
const CHART_LEGEND_STYLE = { fontSize: 10, paddingTop: 6, fontFamily: CHART_FONT_FAMILY };
const COLOR_VOLUME_TREND = "#39ff14";

type AnalyticsCardId = "volume" | "screen" | "spend";

type AnalyticsCardConfig = {
  id: AnalyticsCardId;
  title: string;
  stat: string;
  statLabel: string;
  hint: string;
  baseRotate: number;
  baseX: number;
  baseY: number;
};

const CARD_CONFIG: AnalyticsCardConfig[] = [
  {
    id: "volume",
    title: "Prompt volume",
    stat: "",
    statLabel: "vs prior period",
    hint: "Weekly prompts across ChatGPT, Claude, and Gemini.",
    baseRotate: -10,
    baseX: -118,
    baseY: 18
  },
  {
    id: "screen",
    title: "Screen time",
    stat: "",
    statLabel: "this week",
    hint: "Active minutes per model and agent.",
    baseRotate: 0,
    baseX: 0,
    baseY: -8
  },
  {
    id: "spend",
    title: "Plan spend",
    stat: "",
    statLabel: "catalog total / mo",
    hint: "Subscription plans synced from Claude, OpenAI, and Cursor.",
    baseRotate: 10,
    baseX: 118,
    baseY: 18
  }
];

function PromptVolumeChart() {
  const chartRows = useMemo(() => buildHomeDemoPromptVolume(), []);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartRows} margin={{ top: 2, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} interval={2} />
        <YAxis stroke="#8A8A8A" allowDecimals={false} width={24} tick={CHART_Y_TICK} />
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
              index === HOME_DEMO_AI_SERIES.length - 1 ? ([2, 2, 0, 0] as [number, number, number, number]) : undefined
            }
          />
        ))}
        <Line
          type="natural"
          dataKey="volume_trend"
          name="Trend"
          legendType="none"
          stroke={COLOR_VOLUME_TREND}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ScreenTimeChart() {
  const chartRows = useMemo(() => buildHomeDemoScreenTime(), []);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartRows} margin={{ top: 2, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
        <YAxis stroke="#8A8A8A" allowDecimals={false} width={28} tick={CHART_Y_TICK} unit="m" />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          formatter={(value: number, name: string) => [`${value} min`, name]}
        />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} />
        {HOME_DEMO_SCREEN_TIME_SERIES.map((series, index, visible) => (
          <Bar
            key={series.dataKey}
            dataKey={series.dataKey}
            name={series.name}
            stackId="screen"
            fill={series.color}
            radius={
              index === visible.length - 1 ? ([2, 2, 0, 0] as [number, number, number, number]) : undefined
            }
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function PlanSpendChart({ rows }: { rows: HomeDemoPlanSpendRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 2, right: 8, bottom: 0, left: 4 }} barCategoryGap="18%">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
        <XAxis type="number" stroke="#8A8A8A" tick={CHART_Y_TICK} unit="$" />
        <YAxis type="category" dataKey="plan" stroke="#8A8A8A" tick={CHART_Y_TICK} width={72} />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number) => [`$${value}/mo`, "Catalog price"]}
        />
        <Bar dataKey="monthlyUsd" name="Monthly" radius={[0, 4, 4, 0]} barSize={14}>
          {rows.map((entry) => (
            <Cell key={entry.plan} fill={entry.fill} fillOpacity={0.92} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function AnalyticsFanCard({
  config,
  active,
  isHovered,
  anyHovered,
  onHover,
  children
}: {
  config: AnalyticsCardConfig;
  active: boolean;
  isHovered: boolean;
  anyHovered: boolean;
  onHover: (id: AnalyticsCardId | null) => void;
  children: React.ReactNode;
}) {
  const isFocused = isHovered || (active && !anyHovered);
  const dimmed = anyHovered && !isFocused;

  const rotate = isFocused ? config.baseRotate * 0.25 : config.baseRotate;
  const scale = isFocused ? 1.06 : dimmed ? 0.9 : 0.94;
  const y = isFocused ? config.baseY - 14 : config.baseY;
  const zIndex = isFocused ? 30 : config.id === "screen" ? 20 : 10;

  return (
    <article
      className="absolute left-1/2 top-1/2 w-[min(92vw,320px)] cursor-pointer transition-[transform,opacity,box-shadow] duration-300 ease-out sm:w-[340px]"
      style={{
        transform: `translate(calc(-50% + ${config.baseX}px), calc(-50% + ${y}px)) rotate(${rotate}deg) scale(${scale})`,
        zIndex,
        opacity: dimmed ? 0.72 : 1
      }}
      onMouseEnter={() => onHover(config.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(config.id)}
      onBlur={() => onHover(null)}
      tabIndex={0}
      aria-label={`${config.title} chart`}
    >
      <div
        className={`rounded-2xl border bg-cream p-3 shadow-card transition-shadow duration-300 sm:p-4 ${
          isFocused ? "border-ink/25 shadow-[0_24px_48px_rgba(17,17,17,0.14)]" : "border-line"
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">{config.title}</h3>
            <p className="mt-1 text-lg font-semibold tabular-nums leading-none text-ink sm:text-xl">{config.stat}</p>
            <p className="mt-0.5 text-[10px] text-faint">{config.statLabel}</p>
          </div>
        </div>
        <p className="mb-2 text-[10px] leading-snug text-faint">{config.hint}</p>
        <div className="h-44 w-full sm:h-48">{children}</div>
      </div>
    </article>
  );
}

export function HomeAnalyticsSection() {
  const [hoveredCard, setHoveredCard] = useState<AnalyticsCardId | null>(null);

  const volumeRows = useMemo(() => buildHomeDemoPromptVolume(), []);
  const screenRows = useMemo(() => buildHomeDemoScreenTime(), []);
  const spendRows = useMemo(() => buildHomeDemoPlanSpend(), []);

  const growthPercent = useMemo(() => homeDemoVolumeGrowthPercent(volumeRows), [volumeRows]);
  const screenTotal = useMemo(() => homeDemoScreenTimeTotalMinutes(screenRows), [screenRows]);
  const spendTotal = useMemo(() => homeDemoPlanSpendTotal(spendRows), [spendRows]);

  const cards = CARD_CONFIG.map((card) => {
    if (card.id === "volume") return { ...card, stat: `+${growthPercent}%` };
    if (card.id === "screen") return { ...card, stat: `${screenTotal.toLocaleString()} min` };
    return { ...card, stat: `$${spendTotal}/mo` };
  });

  return (
    <section id="analytics" className="border-t border-line px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="AI observability"
          title="Track your AI usage across the firm"
          subtitle="Prompt volume, screen time, and subscription spend — one dashboard for leaders and ops teams."
        />

        <div className="relative mx-auto h-[min(72vw,520px)] max-h-[520px] min-h-[400px] w-full max-w-4xl sm:min-h-[460px]">
          {cards.map((card) => (
            <AnalyticsFanCard
              key={card.id}
              config={card}
              active={card.id === "screen"}
              isHovered={hoveredCard === card.id}
              anyHovered={hoveredCard !== null}
              onHover={setHoveredCard}
            >
              {card.id === "volume" ? (
                <PromptVolumeChart />
              ) : card.id === "screen" ? (
                <ScreenTimeChart />
              ) : (
                <PlanSpendChart rows={spendRows} />
              )}
            </AnalyticsFanCard>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-3xl space-y-4 text-center text-sm leading-relaxed text-muted sm:text-base">
          <p>
            Promptly gives you a shared picture of how AI is actually used: which models people reach for, how long
            they stay in each tool, and what your subscription stack costs across Claude, OpenAI, Cursor, and Gemini.
          </p>
          <p>
            Use it to justify licenses, coach teams on structure and intent, and cut wasted tokens before they show up
            on the invoice.
          </p>
        </div>
      </div>
    </section>
  );
}
