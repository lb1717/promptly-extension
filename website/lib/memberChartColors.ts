/**
 * Per-person chart colors for company stats: red → green → blue,
 * skipping bright yellow by moving quickly into light/mid green.
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map 0..1 position along the team palette to a hue (degrees). */
function memberHue(t: number): number {
  const x = clamp01(t);
  if (x <= 0.18) {
    return lerp(356, 12, x / 0.18);
  }
  if (x <= 0.32) {
    return lerp(12, 148, (x - 0.18) / 0.14);
  }
  if (x <= 0.68) {
    return lerp(148, 178, (x - 0.32) / 0.36);
  }
  return lerp(178, 225, (x - 0.68) / 0.32);
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const chroma = sat * Math.min(light, 1 - light);
  const hueToRgb = (n: number) => {
    const k = (n + h / 30) % 12;
    const channel = light - chroma * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * channel)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${hueToRgb(0)}${hueToRgb(8)}${hueToRgb(4)}`;
}

export function getMemberChartColor(index: number, total: number): string {
  const count = Math.max(1, Math.floor(total));
  const safeIndex = Math.max(0, Math.min(count - 1, Math.floor(index)));
  const t = count <= 1 ? 0.5 : safeIndex / (count - 1);
  const hue = memberHue(t);
  const sat = lerp(58, 68, clamp01(t));
  const light = lerp(44, 48, clamp01(t));
  return hslToHex(hue, sat, light);
}

export function getMemberChartColors(total: number): string[] {
  const count = Math.max(1, Math.floor(total));
  return Array.from({ length: count }, (_, index) => getMemberChartColor(index, count));
}

export function buildMemberColorLookup<T extends { user_id: string }>(members: T[]): Map<string, string> {
  const map = new Map<string, string>();
  const total = members.length;
  members.forEach((member, index) => {
    map.set(member.user_id, getMemberChartColor(index, total));
  });
  return map;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length !== 6) return null;
  const n = Number.parseInt(normalized, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Slightly lighter/darker variants for multiple plan lines under one person. */
export function getMemberPlanLineColors(memberColor: string, planCount: number): string[] {
  const rgb = hexToRgb(memberColor);
  if (!rgb || planCount <= 0) return [];
  if (planCount === 1) return [memberColor];
  return Array.from({ length: planCount }, (_, index) => {
    const t = planCount <= 1 ? 0 : index / (planCount - 1);
    const mix = lerp(-28, 28, t);
    return rgbToHex(rgb.r + mix, rgb.g + mix, rgb.b + mix);
  });
}
