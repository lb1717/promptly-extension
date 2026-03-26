import { estimateTokensFromChars } from "./optimize.js";

export const CREDIT_MAX_PROMPT_CHARS = 12000;
export const CREDIT_MAX_INSTRUCTION_CHARS = 3000;
export const CREDIT_MAX_ESTIMATED_INPUT_TOKENS = 4000;
/**
 * Max single-request planned tokens in preflight (heuristic cap on char-based estimates).
 * Real billing uses provider `usage.total_tokens` (OpenAI-style API tokens).
 */
export const DAILY_BILL_PLAN_CAP = 250_000;

/**
 * Daily allowance in the same units as OpenAI `usage.total_tokens` (input + output per call).
 * Tuned for **gpt-5-nano** list pricing ($0.05/M input, $0.40/M output, platform.openai.com/docs/models/gpt-5-nano):
 * ~$1/day order-of-magnitude at a typical rewrite mix (roughly ~$0.25–0.30 per 1M total tokens blended).
 */
export const DAILY_API_TOKEN_LIMIT_DEFAULT = 4_000_000;
/** Env `DAILY_TOKEN_LIMIT` values below this are ignored (legacy tiny caps). */
export const DAILY_API_TOKEN_LIMIT_ENV_MIN = 50_000;

/**
 * Same combined length rule as /optimize for token estimates.
 */
export function estimateBundledInputTokens(promptLen, instructionLen) {
  const p = Math.min(CREDIT_MAX_PROMPT_CHARS, Math.max(0, Math.floor(Number(promptLen) || 0)));
  const i = Math.min(CREDIT_MAX_INSTRUCTION_CHARS, Math.max(0, Math.floor(Number(instructionLen) || 0)));
  return estimateTokensFromChars(p + i);
}

/**
 * Mirrors /optimize preflight: planned charge before provider returns real total_tokens.
 */
export function conservativeBillFromEstimatedInput(estimatedInputTokens, dailyLimit) {
  const et = Math.max(0, Number(estimatedInputTokens) || 0);
  const cap = Math.max(1, Math.floor(Number(dailyLimit) || 1));
  const plannedBillTokens = Math.min(cap, Math.max(1, Math.ceil(et * 2.5)));
  return Math.min(DAILY_BILL_PLAN_CAP, plannedBillTokens);
}

export function toCreditsView(raw) {
  const used = Math.max(0, Number(raw.used || 0));
  const limit = Math.max(1, Number(raw.limit || 1));
  const remaining = Math.max(0, Number(raw.remaining ?? Math.max(0, limit - used)));
  const rawUsedPercent = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
  const usedPercent = used > 0 ? Math.max(1, rawUsedPercent) : 0;
  const leftPercent = Math.max(0, Math.min(100, 100 - usedPercent));
  return {
    used,
    max: limit,
    remaining,
    used_percent: usedPercent,
    left_percent: leftPercent
  };
}

/**
 * @param {object} usageRow - Durable Object daily-credit status/consume shape
 * @param {number} dailyLimit
 * @param {{ estimatedInputTokens?: number|null }} options
 */
export function buildCreditsEnvelope(usageRow, dailyLimit, options = {}) {
  const credits = toCreditsView(usageRow);
  const used = credits.used;
  const limit = credits.max;
  const remainingBudget = Math.max(0, limit - used);

  let plannedBillEstimate = null;
  let canRunEstimatedPrompt = null;
  const est = options.estimatedInputTokens;
  if (est != null && Number.isFinite(est) && est >= 0) {
    plannedBillEstimate = conservativeBillFromEstimatedInput(est, dailyLimit);
    if (est > CREDIT_MAX_ESTIMATED_INPUT_TOKENS) {
      canRunEstimatedPrompt = false;
    } else {
      canRunEstimatedPrompt = used + plannedBillEstimate <= limit;
    }
  }

  return {
    ...credits,
    remaining: remainingBudget,
    hard_exhausted: used >= limit,
    planned_bill_estimate: plannedBillEstimate,
    can_run_estimated_prompt: canRunEstimatedPrompt
  };
}
