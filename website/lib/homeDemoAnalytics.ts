export type HomeDemoScreenTimeRow = {
  label: string;
  chatgpt: number;
  claude: number;
  gemini: number;
  cursor: number;
};

export type HomeDemoPlanSpendRow = {
  plan: string;
  monthlyUsd: number;
  fill: string;
};

const SCREEN_WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Illustrative daily screen time in minutes — not live data. */
export function buildHomeDemoScreenTime(): HomeDemoScreenTimeRow[] {
  const pattern = [
    { chatgpt: 42, claude: 28, gemini: 12, cursor: 55 },
    { chatgpt: 38, claude: 31, gemini: 10, cursor: 48 },
    { chatgpt: 45, claude: 36, gemini: 14, cursor: 62 },
    { chatgpt: 52, claude: 40, gemini: 11, cursor: 58 },
    { chatgpt: 48, claude: 44, gemini: 16, cursor: 71 },
    { chatgpt: 22, claude: 18, gemini: 8, cursor: 35 },
    { chatgpt: 18, claude: 14, gemini: 6, cursor: 28 }
  ];

  return SCREEN_WEEK_LABELS.map((label, i) => ({
    label,
    ...pattern[i]!
  }));
}

export function homeDemoScreenTimeTotalMinutes(rows: HomeDemoScreenTimeRow[]): number {
  return rows.reduce((sum, row) => sum + row.chatgpt + row.claude + row.gemini + row.cursor, 0);
}

export const HOME_DEMO_SCREEN_TIME_SERIES = [
  { dataKey: "chatgpt" as const, name: "ChatGPT", color: "#10a37f" },
  { dataKey: "claude" as const, name: "Claude", color: "#cc785c" },
  { dataKey: "gemini" as const, name: "Gemini", color: "#4285f4" },
  { dataKey: "cursor" as const, name: "Cursor", color: "#9333ea" }
];

/** Illustrative monthly subscription catalog spend — not live data. */
export function buildHomeDemoPlanSpend(): HomeDemoPlanSpendRow[] {
  return [
    { plan: "Claude Max", monthlyUsd: 100, fill: "#cc785c" },
    { plan: "ChatGPT Plus", monthlyUsd: 20, fill: "#10a37f" },
    { plan: "Cursor Pro+", monthlyUsd: 60, fill: "#9333ea" },
    { plan: "Gemini Advanced", monthlyUsd: 20, fill: "#4285f4" }
  ];
}

export function homeDemoPlanSpendTotal(rows: HomeDemoPlanSpendRow[]): number {
  return rows.reduce((sum, row) => sum + row.monthlyUsd, 0);
}
