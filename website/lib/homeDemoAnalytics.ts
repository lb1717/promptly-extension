export type HomeDemoScreenTimeRow = {
  label: string;
  chatgpt: number;
  claude: number;
  gemini: number;
  cursor: number;
};

export type HomeDemoSpendTimelineRow = {
  label: string;
  budget: number;
  claude_max: number;
  chatgpt_plus: number;
  cursor_pro: number;
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

const MONTH_LABELS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"] as const;
const MONTHLY_BUDGET = 380;

/** Compact USD for chart axes and headlines — e.g. $1.2k, $96. */
export function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const scaled = value / 1_000_000;
    return `$${scaled.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (abs >= 1000) {
    const scaled = value / 1000;
    return `$${scaled.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `$${Math.round(value)}`;
}

/**
 * Illustrative subscription spend vs budget — not live data.
 * At the latest month: Claude Max ends above budget (red), ChatGPT Plus and Cursor Pro end below (green).
 */
export function buildHomeDemoSpendTimeline(): HomeDemoSpendTimelineRow[] {
  const claude = [348, 372, 361, 389, 395, 418];
  const chatgpt = [820, 780, 700, 580, 440, 260];
  const cursor = [860, 820, 760, 640, 500, 220];

  return MONTH_LABELS.map((label, i) => ({
    label,
    budget: MONTHLY_BUDGET,
    claude_max: claude[i]!,
    chatgpt_plus: chatgpt[i]!,
    cursor_pro: cursor[i]!
  }));
}

/** Illustrative monthly savings from subscriptions trending under budget (not live data). */
export function homeDemoSpendSavedUsd(rows: HomeDemoSpendTimelineRow[]): number {
  if (rows.length < 2) return 0;
  const first = rows[0]!;
  const latest = rows[rows.length - 1]!;
  const chatgptSaved = Math.max(0, first.chatgpt_plus - latest.chatgpt_plus);
  const cursorSaved = Math.max(0, first.cursor_pro - latest.cursor_pro);
  return chatgptSaved + cursorSaved;
}

export const HOME_DEMO_SPEND_SERIES = [
  { dataKey: "chatgpt_plus" as const, name: "ChatGPT Plus", color: "#16a34a", tone: "green" as const },
  { dataKey: "cursor_pro" as const, name: "Cursor Pro", color: "#22c55e", tone: "green" as const },
  { dataKey: "claude_max" as const, name: "Claude Max", color: "#dc2626", tone: "red" as const }
];

export const HOME_DEMO_BUDGET_KEY = "budget" as const;
