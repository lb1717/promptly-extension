export type HomeDemoPromptVolumeRow = {
  label: string;
  prompts_chatgpt: number;
  prompts_claude: number;
  prompts_gemini: number;
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

/** Illustrative weekly prompt volume — upward trend with natural variation (not live data). */
export function buildHomeDemoPromptVolume(): HomeDemoPromptVolumeRow[] {
  const rows: Omit<HomeDemoPromptVolumeRow, "volume_trend">[] = [];
  let base = 24;

  for (let i = 0; i < WEEK_LABELS.length; i++) {
    const seasonal = Math.sin(i * 0.85) * 3;
    const dip = i === 6 ? -5 : 0;
    const bump = i === 10 ? 4 : 0;
    const total = Math.max(
      14,
      Math.round(base + seasonal + dip + bump + ((i * 17) % 5) - 2)
    );

    const chatgptShare = 0.44 + (i % 3) * 0.02;
    const claudeShare = 0.31 + (i % 4) * 0.015;
    let prompts_chatgpt = Math.max(4, Math.round(total * chatgptShare));
    let prompts_claude = Math.max(3, Math.round(total * claudeShare));
    let prompts_gemini = Math.max(2, total - prompts_chatgpt - prompts_claude);
    const sum = prompts_chatgpt + prompts_claude + prompts_gemini;
    if (sum !== total) {
      prompts_gemini = Math.max(2, prompts_gemini + (total - sum));
    }

    rows.push({
      label: WEEK_LABELS[i],
      prompts_chatgpt,
      prompts_claude,
      prompts_gemini
    });

    base += 2.2 + (i % 3) * 0.8;
  }

  const totals = rows.map((r) => r.prompts_chatgpt + r.prompts_claude + r.prompts_gemini);
  const trend = smoothTrendValues(totals);

  return rows.map((row, i) => ({
    ...row,
    volume_trend: trend[i] ?? 0
  }));
}

export function homeDemoVolumeGrowthPercent(rows: HomeDemoPromptVolumeRow[]): number {
  if (rows.length < 2) return 0;
  const half = Math.max(1, Math.floor(rows.length / 2));
  const prior = rows.slice(0, half).reduce(
    (sum, r) => sum + r.prompts_chatgpt + r.prompts_claude + r.prompts_gemini,
    0
  );
  const recent = rows.slice(-half).reduce(
    (sum, r) => sum + r.prompts_chatgpt + r.prompts_claude + r.prompts_gemini,
    0
  );
  if (prior <= 0) return recent > 0 ? 100 : 0;
  return Math.round(((recent - prior) / prior) * 1000) / 10;
}

export const HOME_DEMO_AI_SERIES = [
  { dataKey: "prompts_chatgpt" as const, name: "ChatGPT", color: "#10a37f" },
  { dataKey: "prompts_claude" as const, name: "Claude", color: "#cc785c" },
  { dataKey: "prompts_gemini" as const, name: "Gemini", color: "#4285f4" }
];
