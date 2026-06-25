"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  buildHomeDemoScreenTime,
  buildHomeDemoSpendTimeline,
  HOME_DEMO_BUDGET_KEY,
  HOME_DEMO_SCREEN_TIME_SERIES,
  HOME_DEMO_SPEND_SERIES,
  homeDemoScreenTimeTotalMinutes,
  homeDemoSpendSavedUsd,
  formatCompactUsd
} from "@/lib/homeDemoAnalytics";
import {
  buildHomeDemoPromptVolume,
  HOME_DEMO_MODEL_SERIES,
  homeDemoVolumeGrowthPercent
} from "@/lib/homeDemoPromptVolume";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis
} from "recharts";

const CHART_FONT_FAMILY = "var(--font-roboto-chart), Roboto, sans-serif";
const CHART_Y_TICK = { fill: "#5C5C5C", fontSize: 9, fontFamily: CHART_FONT_FAMILY };
const CHART_SPEND_Y_TICK = { fill: "#5C5C5C", fontSize: 11, fontWeight: 600 as const, fontFamily: CHART_FONT_FAMILY };
const CHART_X_DATE_TICK = {
  fill: "#2a2a2a",
  fontSize: 10,
  fontWeight: 600 as const,
  fontFamily: CHART_FONT_FAMILY
};
const CHART_X_DATE_STROKE = "#525252";
const COLOR_VOLUME_TREND = "#1e3a8a";
const CHART_MARGIN = { top: 6, right: 10, bottom: 4, left: 4 };
const CHART_Y_AXIS_WIDTH = 38;
const CAROUSEL_MS = 1500;

type AnalyticsCardId = "volume" | "screen" | "spend";

/** Carousel order: left → middle → right (reversed from prior). */
const CAROUSEL_ORDER: AnalyticsCardId[] = ["volume", "screen", "spend"];

const BASE_Z_INDEX: Record<AnalyticsCardId, number> = {
  spend: 30,
  screen: 20,
  volume: 10
};

function getStackZIndex(focused: AnalyticsCardId, cardId: AnalyticsCardId): number {
  if (cardId === focused) return 40;

  if (focused === "screen") {
    return 15;
  }

  if (focused === "volume") {
    if (cardId === "screen") return 20;
    if (cardId === "spend") return 10;
  }

  if (focused === "spend") {
    if (cardId === "screen") return 20;
    if (cardId === "volume") return 10;
  }

  return BASE_Z_INDEX[cardId];
}

type AnalyticsCardConfig = {
  id: AnalyticsCardId;
  title: string;
  statValue: string;
  statSuffix: string;
  subtitle: string;
  baseRotate: number;
  baseX: number;
  baseY: number;
};

const CARD_CONFIG: AnalyticsCardConfig[] = [
  {
    id: "volume",
    title: "Prompt volume",
    statValue: "",
    statSuffix: "since last week",
    subtitle: "Weekly prompts by model",
    baseRotate: -8,
    baseX: -228,
    baseY: 20
  },
  {
    id: "screen",
    title: "Screen time",
    statValue: "",
    statSuffix: "across all services",
    subtitle: "Time spent by service this week",
    baseRotate: 0,
    baseX: 0,
    baseY: -6
  },
  {
    id: "spend",
    title: "Plan spend",
    statValue: "",
    statSuffix: "saved on subscriptions",
    subtitle: "Subscription expenditure overview",
    baseRotate: 8,
    baseX: 228,
    baseY: 20
  }
];

function PromptVolumeChart() {
  const chartRows = useMemo(() => buildHomeDemoPromptVolume(), []);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartRows} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} interval={2} />
        <YAxis stroke="#8A8A8A" allowDecimals={false} width={CHART_Y_AXIS_WIDTH} tick={CHART_Y_TICK} tickMargin={4} />
        {HOME_DEMO_MODEL_SERIES.map((series, index) => (
          <Bar
            key={series.dataKey}
            dataKey={series.dataKey}
            name={series.name}
            stackId="stack"
            fill={series.color}
            radius={
              index === HOME_DEMO_MODEL_SERIES.length - 1
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
      <BarChart data={chartRows} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
        <YAxis
          stroke="#8A8A8A"
          allowDecimals={false}
          width={CHART_Y_AXIS_WIDTH}
          tick={CHART_Y_TICK}
          tickMargin={4}
          unit="m"
        />
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

function PlanSpendChart() {
  const chartRows = useMemo(() => buildHomeDemoSpendTimeline(), []);
  const spendMax = useMemo(
    () =>
      Math.max(
        ...chartRows.flatMap((row) => [row.budget, row.claude_max, row.chatgpt_plus, row.cursor_pro])
      ),
    [chartRows]
  );
  const yDomainMax = Math.ceil(spendMax / 20) * 20 + 40;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartRows} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis dataKey="label" stroke={CHART_X_DATE_STROKE} tick={CHART_X_DATE_TICK} />
        <YAxis
          stroke="#8A8A8A"
          allowDecimals={false}
          width={44}
          tick={CHART_SPEND_Y_TICK}
          tickMargin={4}
          tickFormatter={(value: number) => formatCompactUsd(value)}
          domain={[200, yDomainMax]}
        />
        <Line
          type="linear"
          dataKey={HOME_DEMO_BUDGET_KEY}
          name="Budget"
          stroke="#525252"
          strokeWidth={2}
          strokeDasharray="6 5"
          dot={false}
          isAnimationActive={false}
        />
        {HOME_DEMO_SPEND_SERIES.map((series) => (
          <Line
            key={series.dataKey}
            type="linear"
            dataKey={series.dataKey}
            name={series.name}
            stroke={series.color}
            strokeWidth={series.tone === "red" ? 2.5 : 2}
            dot={{ r: 2.5, fill: series.color, strokeWidth: 0 }}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function AnalyticsFanCard({
  config,
  isFocused,
  dimmed,
  zIndex,
  onHover,
  children
}: {
  config: AnalyticsCardConfig;
  isFocused: boolean;
  dimmed: boolean;
  zIndex: number;
  onHover: (id: AnalyticsCardId | null) => void;
  children: React.ReactNode;
}) {
  const rotate = isFocused ? config.baseRotate * 0.2 : config.baseRotate;
  const scale = isFocused ? 1.07 : dimmed ? 0.88 : 0.93;
  const y = isFocused ? config.baseY - 18 : config.baseY;

  return (
    <article
      className="absolute left-1/2 top-8 w-[min(94vw,400px)] cursor-pointer transition-[transform,opacity,box-shadow] duration-500 ease-out sm:top-10 lg:w-[440px]"
      style={{
        transform: `translate(calc(-50% + ${config.baseX}px), ${y}px) rotate(${rotate}deg) scale(${scale})`,
        zIndex,
        opacity: dimmed ? 0.9 : 1
      }}
      onMouseEnter={() => onHover(config.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(config.id)}
      onBlur={() => onHover(null)}
      tabIndex={0}
      aria-label={`${config.title} chart`}
    >
      <div
        className={`rounded-2xl border bg-white p-4 shadow-card transition-shadow duration-500 sm:p-5 ${
          isFocused ? "border-ink/25 shadow-[0_28px_56px_rgba(17,17,17,0.16)]" : "border-line"
        }`}
      >
        <div className="mb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink">{config.title}</h3>
          <p className="mt-2 text-sm text-muted">{config.subtitle}</p>
          <p className="mt-2 leading-snug">
            <span
              className={`tabular-nums ${
                config.id === "spend"
                  ? "text-base font-semibold text-emerald-500 sm:text-lg"
                  : "text-lg font-semibold text-ink sm:text-xl"
              }`}
            >
              {config.id === "spend" ? `${config.statValue} saved` : config.statValue}
            </span>{" "}
            {config.id !== "spend" ? (
              <span className="text-sm font-normal text-muted">{config.statSuffix}</span>
            ) : (
              <span className="text-sm font-normal text-muted">on subscriptions</span>
            )}
          </p>
        </div>
        <div className="h-40 w-full rounded-xl bg-white sm:h-44">{children}</div>
      </div>
    </article>
  );
}

export function HomeAnalyticsSection() {
  const [hoveredCard, setHoveredCard] = useState<AnalyticsCardId | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const pauseUntilRef = useRef(0);

  const volumeRows = useMemo(() => buildHomeDemoPromptVolume(), []);
  const screenRows = useMemo(() => buildHomeDemoScreenTime(), []);
  const spendRows = useMemo(() => buildHomeDemoSpendTimeline(), []);

  const growthPercent = useMemo(() => homeDemoVolumeGrowthPercent(volumeRows), [volumeRows]);
  const screenTotal = useMemo(() => homeDemoScreenTimeTotalMinutes(screenRows), [screenRows]);
  const savedUsd = useMemo(() => homeDemoSpendSavedUsd(spendRows), [spendRows]);

  const activeCarouselId = CAROUSEL_ORDER[carouselIndex % CAROUSEL_ORDER.length] ?? "volume";
  const focusedId = hoveredCard ?? activeCarouselId;

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      setCarouselIndex((prev) => (prev + 1) % CAROUSEL_ORDER.length);
    }, CAROUSEL_MS);

    return () => window.clearInterval(timer);
  }, []);

  const handleHover = (id: AnalyticsCardId | null) => {
    setHoveredCard(id);
    if (id) {
      pauseUntilRef.current = Date.now() + CAROUSEL_MS * 2;
      const idx = CAROUSEL_ORDER.indexOf(id);
      if (idx >= 0) setCarouselIndex(idx);
    }
  };

  const cards = CARD_CONFIG.map((card) => {
    if (card.id === "volume") return { ...card, statValue: `+${growthPercent}%` };
    if (card.id === "screen") return { ...card, statValue: `${screenTotal.toLocaleString()} min` };
    return { ...card, statValue: formatCompactUsd(savedUsd) };
  });

  return (
    <section id="analytics" className="relative z-10 px-4 pb-16 pt-3 sm:pb-20 sm:pt-5">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          className="mb-8 sm:mb-10"
          title="Track your AI usage"
          subtitle="Get statistics on your prompt volume, time spent on AI and your subscription expenditure. One dashboard for individuals, firm leaders, or operations teams."
        />

        <div className="relative mx-auto hidden h-[min(52vw,360px)] max-h-[360px] min-h-[300px] w-full max-w-6xl sm:block sm:min-h-[320px]">
          {cards.map((card) => {
            const isFocused = focusedId === card.id;
            const dimmed = !isFocused;
            const zIndex = getStackZIndex(focusedId, card.id);

            return (
              <AnalyticsFanCard
                key={card.id}
                config={card}
                isFocused={isFocused}
                dimmed={dimmed}
                zIndex={zIndex}
                onHover={handleHover}
              >
                {card.id === "volume" ? (
                  <PromptVolumeChart />
                ) : card.id === "screen" ? (
                  <ScreenTimeChart />
                ) : (
                  <PlanSpendChart />
                )}
              </AnalyticsFanCard>
            );
          })}
        </div>

        <div className="mx-auto max-w-lg space-y-4 sm:hidden">
          {cards.map((card) => (
            <article key={card.id} className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink">{card.title}</h3>
              <p className="mt-2 text-sm text-muted">{card.subtitle}</p>
              <p className="mt-2 leading-snug">
                <span
                  className={`tabular-nums ${
                    card.id === "spend"
                      ? "text-base font-semibold text-emerald-500 sm:text-lg"
                      : "text-lg font-semibold text-ink"
                  }`}
                >
                  {card.id === "spend" ? `${card.statValue} saved` : card.statValue}
                </span>{" "}
                {card.id !== "spend" ? (
                  <span className="text-sm font-normal text-muted">{card.statSuffix}</span>
                ) : (
                  <span className="text-sm font-normal text-muted">on subscriptions</span>
                )}
              </p>
              <div className="mt-3 h-40 w-full rounded-xl bg-white">
                {card.id === "volume" ? (
                  <PromptVolumeChart />
                ) : card.id === "screen" ? (
                  <ScreenTimeChart />
                ) : (
                  <PlanSpendChart />
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
