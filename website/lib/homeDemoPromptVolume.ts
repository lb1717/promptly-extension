export type HomeDemoPromptVolumeRow = {
  label: string;
  gpt_55: number;
  gpt_54: number;
  gpt_54_mini: number;
  claude_sonnet_46: number;
  claude_opus_48: number;
  volume_trend: number;
};

const WEEK_LABELS = [
  "Nov 4",
  "Nov 11",
  "Nov 18",
  "Nov 25",
  "Dec 2",
  "Dec 9",
  "Dec 16",
  "Dec 23",
  "Dec 30",
  "Jan 6",
  "Jan 13",
  "Jan 20"
] as const;

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

function rowTotal(row: Omit<HomeDemoPromptVolumeRow, "volume_trend">): number {
  return row.gpt_55 + row.gpt_54 + row.gpt_54_mini + row.claude_sonnet_46 + row.claude_opus_48;
}

/** Illustrative weekly prompt volume by model — upward trend with natural variation (not live data). */
export function buildHomeDemoPromptVolume(): HomeDemoPromptVolumeRow[] {
  const rows: Omit<HomeDemoPromptVolumeRow, "volume_trend">[] = [];
  let base = 28;

  for (let i = 0; i < WEEK_LABELS.length; i++) {
    const seasonal = Math.sin(i * 0.85) * 3;
    const dip = i === 6 ? -5 : 0;
    const bump = i === 10 ? 4 : 0;
    const total = Math.max(16, Math.round(base + seasonal + dip + bump + ((i * 17) % 5) - 2));

    const gpt55Share = 0.28 + (i % 3) * 0.015;
    const gpt54Share = 0.14 + (i % 2) * 0.01;
    const gpt54MiniShare = 0.18 + (i % 4) * 0.012;
    const sonnetShare = 0.22 + (i % 3) * 0.01;
    const opusShare = 0.18 + (i % 5) * 0.008;

    let gpt_55 = Math.max(3, Math.round(total * gpt55Share));
    let gpt_54 = Math.max(2, Math.round(total * gpt54Share));
    let gpt_54_mini = Math.max(2, Math.round(total * gpt54MiniShare));
    let claude_sonnet_46 = Math.max(2, Math.round(total * sonnetShare));
    let claude_opus_48 = Math.max(2, Math.round(total * opusShare));

    const sum = gpt_55 + gpt_54 + gpt_54_mini + claude_sonnet_46 + claude_opus_48;
    if (sum !== total) {
      gpt_55 = Math.max(3, gpt_55 + (total - sum));
    }

    rows.push({
      label: WEEK_LABELS[i],
      gpt_55,
      gpt_54,
      gpt_54_mini,
      claude_sonnet_46,
      claude_opus_48
    });

    base += 2.2 + (i % 3) * 0.8;
  }

  const totals = rows.map(rowTotal);
  const trend = smoothTrendValues(totals);

  return rows.map((row, i) => ({
    ...row,
    volume_trend: trend[i] ?? 0
  }));
}

export function homeDemoVolumeGrowthPercent(rows: HomeDemoPromptVolumeRow[]): number {
  if (rows.length < 2) return 0;
  const half = Math.max(1, Math.floor(rows.length / 2));
  const prior = rows.slice(0, half).reduce((sum, r) => sum + rowTotal(r), 0);
  const recent = rows.slice(-half).reduce((sum, r) => sum + rowTotal(r), 0);
  if (prior <= 0) return recent > 0 ? 100 : 0;
  return Math.round(((recent - prior) / prior) * 1000) / 10;
}

export const HOME_DEMO_MODEL_SERIES = [
  { dataKey: "gpt_55" as const, name: "GPT-5.5", color: "#10a37f" },
  { dataKey: "gpt_54" as const, name: "GPT-5.4", color: "#0b6b54" },
  { dataKey: "gpt_54_mini" as const, name: "GPT-5.4-Mini", color: "#6ee7b7" },
  { dataKey: "claude_sonnet_46" as const, name: "Claude Sonnet 4.6", color: "#cc785c" },
  { dataKey: "claude_opus_48" as const, name: "Claude Opus 4.8", color: "#e8956f" }
];

/** @deprecated Use HOME_DEMO_MODEL_SERIES */
export const HOME_DEMO_AI_SERIES = HOME_DEMO_MODEL_SERIES;
