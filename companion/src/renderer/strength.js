function simplePromptHash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function computePromptStrengthPercent(promptText, { aiEnhanced = false } = {}) {
  const trimmed = String(promptText || "").trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const charCount = trimmed.length;
  const h = simplePromptHash(trimmed);

  if (aiEnhanced) {
    const v = 96 + (h % 5);
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  const cap = 59;
  if (wordCount === 0) {
    return Math.max(0, Math.min(22, Math.round(2 + (h % 18))));
  }

  const asymptotic = 1 - Math.exp(-wordCount / 11.5);
  let base = asymptotic * cap * 0.9;
  const organic =
    Math.sin(wordCount * 0.092 + 0.35) * 2.1 +
    Math.sin(charCount * 0.016 + wordCount * 0.058) * 1.45 +
    Math.sin(Math.sqrt(wordCount) * 1.5 + 0.7) * 0.95;
  base += organic * 0.52;
  base = Math.max(7, Math.min(cap, base));
  return Math.round(base);
}

export function strengthLevel(percent) {
  if (percent >= 70) return "high";
  if (percent >= 40) return "mid";
  return "low";
}

export function updateStrengthUi(trackEl, fillEl, promptText, { aiEnhanced = false } = {}) {
  if (!trackEl || !fillEl) return;
  const percent = computePromptStrengthPercent(promptText, { aiEnhanced });
  fillEl.style.width = `${percent}%`;
  fillEl.dataset.level = strengthLevel(percent);
  trackEl.dataset.aiEnhanced = aiEnhanced ? "true" : "false";
}
