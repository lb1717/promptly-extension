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

/**
 * Validates template shape for admin saves (token must appear exactly once).
 * Returns the framework-only text without the user slot (instructions joined around the removed token).
 */
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

/**
 * One-shot optimize message: substitute the Firestore/admin template's user slot with actual user text.
 * The template must contain `<<PROMPTLY_USER_CONTENT>>` exactly once.
 */
export function fillPromptTemplateWithUserSlot(template: string, userSlot: string): string {
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
  const slot = String(userSlot || "").trim();
  return `${parts[0]}${slot}${parts[1]}`.trim();
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
