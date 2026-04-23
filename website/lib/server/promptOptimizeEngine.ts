import { PROMPTLY_USER_CONTENT_TOKEN } from "./promptEngineeringConstants";

/** Product modes for /api/optimize (extension + admin templates). */
export type OptimizeEngineMode = "auto" | "improve" | "generate";

const ENGINE_MODES = new Set<string>(["auto", "improve", "generate"]);

export function isOptimizeEngineMode(value: string): value is OptimizeEngineMode {
  return ENGINE_MODES.has(String(value || "").trim().toLowerCase());
}

/**
 * Resolves explicit `optimize_mode` when present; otherwise maps legacy `request_mode` + markers.
 */
export function resolveOptimizeEngineMode(payload: {
  optimize_mode?: unknown;
  request_mode?: unknown;
  user_instruction?: unknown;
}): OptimizeEngineMode {
  const explicit = String(payload?.optimize_mode || "").trim().toLowerCase();
  if (isOptimizeEngineMode(explicit)) {
    return explicit;
  }
  const legacyRm = String(payload?.request_mode || "").trim().toLowerCase();
  if (legacyRm === "create") {
    return "generate";
  }
  const instr = String(payload?.user_instruction || "");
  if (instr.includes("MANUAL") || /^rewrite\s+and\s+improve\b/i.test(instr)) {
    return "improve";
  }
  if (legacyRm === "rewrite") {
    return "auto";
  }
  // Ambiguous legacy payloads (no mode hints): safe default for API callers without optimize_mode.
  return "auto";
}

/** Framework text: template split at the user token (Prompt 1). */
export function extractFrameworkInstructionsFromTemplate(template: string): string {
  const t = String(template || "").trim();
  const tok = PROMPTLY_USER_CONTENT_TOKEN;
  if (!t.includes(tok)) {
    throw new Error(
      `Prompt engineering template must include the token ${tok} exactly as shown (you may place it anywhere).`
    );
  }
  const parts = t.split(tok);
  if (parts.length !== 2) {
    throw new Error(`${tok} must appear exactly once in the template (found ${parts.length - 1}).`);
  }
  const [before, after] = parts;
  const instructions = [before.trim(), after.trim()].filter(Boolean).join("\n\n").trim();
  if (!instructions) {
    throw new Error(
      "Template has no instruction text before/after the user content token; add your meta-prompt around the token."
    );
  }
  return instructions;
}

export function buildPrompt1FrameworkFromTemplate(template: string): string {
  return extractFrameworkInstructionsFromTemplate(template);
}

/** Task turn (Prompt 2): mode-specific instruction + delimited user slot. */
export function buildPrompt2TaskForMode(mode: OptimizeEngineMode, userSlot: string): string {
  const slot = String(userSlot || "").trim();
  switch (mode) {
    case "auto":
      return `Using the framework and instructions in my previous message, interpret the following user input and transform it into the best possible LLM-ready prompt. Reply with only the final prompt—no preamble, labels, or meta-commentary.

---USER_INPUT---
${slot}
---END---`;
    case "improve":
      return `Using the framework and instructions in my previous message, rewrite and improve the following user prompt. Reply with only the final improved prompt—no preamble, labels, or meta-commentary.

---USER_PROMPT---
${slot}
---END---`;
    case "generate":
      return `Using the framework and instructions in my previous message, generate one ready-to-paste task prompt from the following user request and the provided instructions. Reply with only that prompt (plain text, or JSON if the framework requires it).

---USER_REQUEST---
${slot}
---END---`;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export type EngineTemplateFields = {
  rewrite_auto_template: string;
  rewrite_manual_template: string;
  compose_template: string;
};

export function pickTemplateStringForMode(
  mode: OptimizeEngineMode,
  templates: EngineTemplateFields,
  createTemplateMaxChars: number,
  defaultTemplates: EngineTemplateFields
): string {
  const raw =
    mode === "generate"
      ? templates.compose_template
      : mode === "improve"
        ? templates.rewrite_manual_template
        : templates.rewrite_auto_template;
  if (mode === "generate" && String(raw || "").length > createTemplateMaxChars) {
    return defaultTemplates.compose_template;
  }
  return raw;
}

export function pickPrimaryModelForMode(
  mode: OptimizeEngineMode,
  models: {
    rewrite_auto_model: string;
    rewrite_manual_model: string;
    create_model: string;
  }
): string {
  if (mode === "generate") {
    return models.create_model;
  }
  if (mode === "improve") {
    return models.rewrite_manual_model;
  }
  return models.rewrite_auto_model;
}

export function pickProviderRequestMode(mode: OptimizeEngineMode): "rewrite" | "create" {
  return mode === "generate" ? "create" : "rewrite";
}

export function pickTimeoutMsForMode(
  mode: OptimizeEngineMode,
  timeouts: { rewrite_timeout_ms: number; create_timeout_ms: number }
): number {
  return mode === "generate" ? timeouts.create_timeout_ms : timeouts.rewrite_timeout_ms;
}

export function buildDualUserTurnMessages(
  frameworkInstructions: string,
  taskTurn: string
): Array<{ role: "user"; content: string }> {
  return [
    { role: "user", content: String(frameworkInstructions || "").trim() },
    { role: "user", content: String(taskTurn || "").trim() }
  ];
}
