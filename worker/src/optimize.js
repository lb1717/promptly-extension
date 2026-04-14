import { parseModelJsonLoose } from "./jsonSafe.js";
import { callProvider } from "./providers.js";

/** Rough preflight only (~4 chars/token); billed amount is provider `usage.total_tokens` (OpenAI API units). */
export function estimateTokensFromChars(charCount) {
  return Math.ceil(charCount / 4);
}

const INTERNAL_AUTO_MARKER = "[REWRITE_MODE: AUTO_REWRITE]";
const INTERNAL_MANUAL_MARKER = "[REWRITE_MODE: MANUAL_REWRITE]";

function inferRewriteMode(userPrompt, userInstruction = "") {
  const hint = String(userInstruction || "").trim();
  if (hint.includes(INTERNAL_MANUAL_MARKER)) {
    return "MANUAL";
  }
  if (hint.includes(INTERNAL_AUTO_MARKER)) {
    return "AUTO";
  }
  if (/^rewrite\s+and\s+improve\b/i.test(hint)) {
    return "MANUAL";
  }
  return hint ? "MANUAL" : "AUTO";
}

function buildRewriteMessages(userPrompt, userInstruction = "") {
  const mode = inferRewriteMode(userPrompt, userInstruction);
  const systemPrompt =
    mode === "AUTO"
      ? `Rewrite the user's prompt into a clearer, more effective version while preserving the same goal, meaning, and general tone. Keep it recognizable to the user. Improve wording, clarity, specificity, and structure only where helpful. Remove ambiguity, redundancy, and weak phrasing. Do not change the task, add new goals, or invent facts, requirements, or constraints. Expand the prompt moderately so the final version is typically about 1.5x to 3x the length of the original, but only when it improves usefulness. Return only the rewritten prompt text with no explanation, labels, or quotation marks.`
      : `Rewrite the user's prompt into a stronger, clearer, and more optimized prompt while preserving the user's actual intent. Improve clarity, specificity, constraints, wording, and structure. You may reorganize the prompt for better execution and include concise sections such as objective, context, constraints, format, tone, or success criteria when helpful. Resolve vagueness only when the intended meaning is reasonably clear. Do not invent new goals, unnecessary assumptions, or unsupported details. Make the rewritten prompt typically about 2x to 4x the length of the original, but only where added structure improves quality. Return only the final rewritten prompt text and do not explain your changes.`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: String(userPrompt || "").trim() }
  ];
}

function normalizePlainRewriteOutput(rawText, fallbackPrompt) {
  let t = String(rawText || "").trim();
  if (!t) {
    return { optimized_prompt: fallbackPrompt };
  }
  const fence = t.match(/^```(?:\w+)?\s*([\s\S]*?)```\s*$/);
  if (fence) {
    t = fence[1].trim();
  }
  if (t.startsWith("{") && t.includes("improved_prompt")) {
    const parsed = parseModelJsonLoose(t);
    if (parsed && typeof parsed.improved_prompt === "string" && parsed.improved_prompt.trim()) {
      return { optimized_prompt: parsed.improved_prompt.trim().slice(0, 12000) };
    }
  }
  return { optimized_prompt: t.slice(0, 12000) };
}

function buildGenerateMessages(userPrompt) {
  const systemPrompt = `Transform the user's request into one strong, ready-to-use prompt.

Rules:
- Preserve the original intent
- Improve clarity, structure, constraints, and output format
- Do not answer the request itself
- Do not invent facts or requirements
- Return only the final prompt text
- Keep it concise and practical (target 120-260 words, hard max 320 words)`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: String(userPrompt || "").trim() },
    {
      role: "user",
      content:
        "Length guard: return one high-quality prompt, concise and practical, target 120-260 words, hard max 320 words."
    }
  ];
}

export async function optimizePromptThroughProvider(
  env,
  prompt,
  userInstruction = "",
  requestMode = "rewrite"
) {
  if (requestMode === "rewrite") {
    const messages = buildRewriteMessages(prompt, userInstruction);
    const providerName = String(env.PROVIDER || "openai").toLowerCase();
    const rewriteModel =
      providerName === "openai"
        ? String(env.OPENAI_REWRITE_MODEL || "gpt-5-nano").trim()
        : "";
    const rewriteTimeoutMs = Math.max(
      10000,
      Math.min(60000, Number(env.OPENAI_REWRITE_TIMEOUT_MS || 20000))
    );

    const providerResult = await callProvider(env, messages, rewriteTimeoutMs, {
      useJsonSchema: false,
      ...(rewriteModel ? { modelOverride: rewriteModel } : {}),
      ...(providerName === "openai" ? { gpt5MinTimeoutMs: 0 } : {})
    });
    const normalized = normalizePlainRewriteOutput(providerResult.rawText, prompt || userInstruction);
    return {
      optimized_prompt: normalized.optimized_prompt,
      clarifying_questions: [],
      assumptions: [],
      classification: null,
      provider: providerResult.provider,
      model: providerResult.model,
      usage: providerResult.usage,
      latencyMs: providerResult.latencyMs
    };
  }

  const messages = buildGenerateMessages(prompt);
  const providerName = String(env.PROVIDER || "openai").toLowerCase();
  const createModel =
    providerName === "openai"
      ? String(env.OPENAI_REWRITE_MODEL || env.OPENAI_CREATE_MODEL || "gpt-5-nano").trim()
      : "";
  const createTimeoutMs = Math.max(
    10000,
    Math.min(60000, Number(env.OPENAI_REWRITE_TIMEOUT_MS || env.OPENAI_CREATE_TIMEOUT_MS || 20000))
  );
  const providerResult = await callProvider(env, messages, createTimeoutMs, {
    useJsonSchema: false,
    ...(createModel ? { modelOverride: createModel } : {}),
    ...(providerName === "openai" ? { gpt5MinTimeoutMs: 0 } : {})
  });
  const normalized = normalizePlainRewriteOutput(providerResult.rawText, prompt || userInstruction);
  return {
    optimized_prompt: normalized.optimized_prompt,
    clarifying_questions: [],
    assumptions: [],
    classification: null,
    provider: providerResult.provider,
    model: providerResult.model,
    usage: providerResult.usage,
    latencyMs: providerResult.latencyMs
  };
}
