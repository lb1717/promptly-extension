import { parseModelJsonLoose } from "./jsonSafe.js";
import { callProvider } from "./providers.js";

/** Rough preflight only (~4 chars/token); billed amount is provider `usage.total_tokens` (OpenAI API units). */
export function estimateTokensFromChars(charCount) {
  return Math.ceil(charCount / 4);
}

/** Keep in sync with `website/lib/server/promptOptimizeEngine.ts` (worker has no Firestore templates). */
export function resolveOptimizeModeFromPayload(payload) {
  const m = String(payload?.optimize_mode || "").trim().toLowerCase();
  if (m === "auto" || m === "improve" || m === "generate") {
    return m;
  }
  const rm = String(payload?.request_mode || "").trim().toLowerCase();
  if (rm === "create") {
    return "generate";
  }
  const instr = String(payload?.user_instruction || "");
  if (instr.includes("MANUAL") || /^rewrite\s+and\s+improve\b/i.test(instr)) {
    return "improve";
  }
  if (rm === "rewrite") {
    return "auto";
  }
  return "auto";
}

function buildAutoTaskTurn(userPrompt) {
  const slot = String(userPrompt || "").trim();
  return `Using the framework and instructions in my previous message, interpret the following user input and transform it into the best possible LLM-ready prompt. Reply with only the final prompt—no preamble, labels, or meta-commentary.

---USER_INPUT---
${slot}
---END---`;
}

function buildImproveTaskTurn(userPrompt) {
  const slot = String(userPrompt || "").trim();
  return `Using the framework and instructions in my previous message, rewrite and improve the following user prompt. Reply with only the final improved prompt—no preamble, labels, or meta-commentary.

---USER_PROMPT---
${slot}
---END---`;
}

function buildGenerateTaskTurn(userPrompt) {
  const slot = String(userPrompt || "").trim();
  return `Using the framework and instructions in my previous message, generate one ready-to-paste task prompt from the following user request and the provided instructions. Reply with only that prompt (plain text, or JSON if the framework requires it).

---USER_REQUEST---
${slot}
---END---`;
}

function normalizePromptTextForCompare(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
}

function buildAutoModeMessages(userPrompt) {
  const sharedConstraints = `

Constraints:
- You receive two user messages: this framework, then a labeled input block. Follow both together.
- Preserve facts, names, numbers, URLs, tone, and constraints from the input; do not invent requirements.
- Reply with only the final LLM-ready prompt—no preamble or meta-commentary.
- Use blank lines between paragraphs in your output (literal newlines).`;

  const metaInstructions = `Auto mode — built-in framework (worker has no Prompt engineering admin).${sharedConstraints}

Interpret the user's input and produce the best possible single prompt for another LLM.`;

  return [
    { role: "user", content: metaInstructions },
    { role: "user", content: buildAutoTaskTurn(userPrompt) }
  ];
}

function buildImproveModeMessages(userPrompt) {
  const sharedConstraints = `

Constraints:
- You receive two user messages: this framework, then a labeled prompt block. Follow both together.
- Full rewrite: change wording throughout; do not paste the source and append generic bullets.
- Reply with only the final improved prompt—no preamble or meta-commentary.
- Use blank lines between paragraphs in your output (literal newlines).`;

  const metaInstructions = `Improve mode — built-in framework (worker has no Prompt engineering admin).${sharedConstraints}`;

  return [
    { role: "user", content: metaInstructions },
    { role: "user", content: buildImproveTaskTurn(userPrompt) }
  ];
}

function looksLikeRewriteInstructionEcho(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 2400) {
    return false;
  }
  const low = t.toLowerCase();
  const strong = [
    "rewrite the user prompt",
    "rewrite the user's prompt",
    "do not include any meta-commentary",
    "output only the rewritten prompt",
    "meta-commentary about prompts",
    "clearly executable brief for a language model"
  ];
  if (strong.some((p) => low.includes(p))) {
    return true;
  }
  if (
    low.includes("---end---") &&
    (low.includes("---user_prompt---") ||
      low.includes("---user_input---") ||
      low.includes("---user_request---")) &&
    (low.includes("rewrite the entire prompt below") ||
      low.includes("improve or rewrite it into one cohesive prompt") ||
      low.includes("transform it into the best possible") ||
      low.includes("generate one ready-to-paste task prompt"))
  ) {
    return true;
  }
  const rubric = [
    "preserving its purpose and constraints",
    "preserving the same goal",
    "tighten grammar",
    "specificity, and reliability",
    "while preserving its purpose"
  ];
  const hits = rubric.filter((p) => low.includes(p)).length;
  return hits >= 2 && t.length < 900;
}

function stripLeadingSourceNormalizedPrefix(output, source) {
  const o = String(output || "");
  const s = String(source || "").trim();
  if (!o.trim() || s.length < 80) {
    return o.trim();
  }
  const want = normalizePromptTextForCompare(s);
  if (!want || want.length < 40) {
    return o.trim();
  }
  for (let i = 1; i <= o.length; i++) {
    const prefixNorm = normalizePromptTextForCompare(o.slice(0, i));
    if (prefixNorm.length < want.length) {
      continue;
    }
    if (prefixNorm === want) {
      const rest = o.slice(i).replace(/^\s+/, "").trim();
      if (rest.length >= 40) {
        return rest;
      }
      return o.trim();
    }
    if (prefixNorm.length > want.length + 4) {
      break;
    }
  }
  return o.trim();
}

function stripVerbatimSourceAppend(output, source) {
  const o = String(output || "").trim();
  const s = String(source || "").trim();
  if (!o || !s || s.length < 80 || o === s) {
    return o;
  }
  const variants = [s, s.replace(/\r\n/g, "\n"), s.replace(/\r/g, "\n")];
  for (const variant of variants) {
    for (const sep of [`${variant}\n\n`, `${variant}\n`, variant]) {
      if (o.startsWith(sep)) {
        const tail = o.slice(sep.length).trim();
        if (tail.length >= 40) {
          return tail;
        }
      }
    }
  }
  if (o.startsWith(s)) {
    const tail = o.slice(s.length).trim();
    if (tail.length >= 40 && tail.length + 40 < o.length) {
      return tail;
    }
  }
  const normalizedTail = stripLeadingSourceNormalizedPrefix(o, s);
  if (normalizedTail.length >= 40 && normalizedTail.length < o.length) {
    return normalizedTail;
  }
  return o;
}

function stripEchoedOptimizeUserPackage(output) {
  const t = String(output || "").trim();
  if (!t) {
    return t;
  }
  const hasDelimited =
    t.includes("---USER_PROMPT---") || t.includes("---USER_INPUT---") || t.includes("---USER_REQUEST---");
  if (!hasDelimited) {
    return t;
  }
  const parts = t.split(/---END---/i);
  const after = parts.length > 1 ? parts[parts.length - 1].trim() : "";
  if (after.length >= 40) {
    return after;
  }
  return "";
}

const ABBREV_BEFORE_PERIOD = /(?:^|\s)(?:Mr|Mrs|Ms|Mx|Dr|Prof|Sr|Jr|St|Vs|etc)\s*$/i;

function insertParagraphBreaksAtSentences(block) {
  return block.replace(/([.!?])(\s+)(?=[\u201c"'A-Za-z\u00c0-\u024f(\[])/g, (full, punct, spaces, offset) => {
    const before = block.slice(0, offset);
    if (ABBREV_BEFORE_PERIOD.test(before)) {
      return full;
    }
    return `${punct}\n\n${spaces.replace(/^\n+/, "")}`;
  });
}

function formatDenseParagraphBlocks(t) {
  return t
    .split(/\n\n+/)
    .map((raw) => {
      const b = raw.trim();
      if (b.length < 120) {
        return b;
      }
      const lines = b.split("\n");
      const listLines = lines.filter((ln) => /^\s*(-\s|\*\s|\d{1,3}\.\s)/.test(ln)).length;
      if (listLines >= Math.max(2, Math.ceil(lines.length * 0.4))) {
        return b;
      }
      if (!/[.!?][\s\u00a0]+[\u201c"'A-Za-z\u00c0-\u024f(\[]/.test(b)) {
        return b;
      }
      return insertParagraphBreaksAtSentences(b);
    })
    .filter((p) => p.length > 0)
    .join("\n\n");
}

function postFormatPlainTextForApi(s) {
  let t = String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u2028|\u2029/g, "\n")
    .trim();
  if (!t) {
    return t;
  }
  if (t.includes("\\n")) {
    t = t.replace(/\\n/g, "\n");
  }
  t = t.replace(/([^\n])\n(-\s|\*\s|\d{1,2}\.\s)/g, "$1\n\n$2");
  t = formatDenseParagraphBlocks(t);
  if (!/\n\n/.test(t)) {
    if (t.length >= 80) {
      t = insertParagraphBreaksAtSentences(t);
    }
    if (!/\n\n/.test(t) && t.length >= 200) {
      t = t.replace(/;\s+/g, ";\n\n");
    }
  }
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function tryDecodeStructuredRewriteParagraphsJson(raw) {
  let t = String(raw || "").trim();
  const jsonFence = t.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (jsonFence) {
    t = jsonFence[1].trim();
  }
  if (!t.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(t);
    if (!parsed || !Array.isArray(parsed.paragraphs) || parsed.paragraphs.length === 0) {
      return null;
    }
    const parts = [];
    for (const p of parsed.paragraphs) {
      const s = String(p ?? "").trim();
      if (s) {
        parts.push(s);
      }
    }
    if (!parts.length) {
      return null;
    }
    return parts.join("\n\n");
  } catch {
    return null;
  }
}

function stripComposeMetaForbiddenSections(s) {
  let t = String(s || "");
  t = t.replace(/<forbidden\b[^>]*>[\s\S]*?<\/forbidden>/gi, (block) => {
    const inner = block.replace(/<\/?forbidden\b[^>]*>/gi, "").toLowerCase();
    const looksLikePromptMetaPolice =
      /generic\s+prompts?|meta[-\s]?content|prompt\s+engineering|compose\s+(a\s+)?prompt|write\s+a\s+prompt|output\s+anything\s+besides|anything\s+besides\s+the|only\s+output\s+the|not\s+output\s+generic|meta[-\s]?instructions?\s+about|rubric\s+for\s+writing|lessons\s+on\s+prompts/i.test(
        inner
      );
    return looksLikePromptMetaPolice ? "" : block;
  });
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function normalizePlainRewriteOutput(rawText, fallbackPrompt, sourceForStrip = "", composeGeneratedPrompt = false) {
  let t = String(rawText || "").trim();
  if (!t) {
    return { optimized_prompt: fallbackPrompt };
  }
  const structuredPlain = tryDecodeStructuredRewriteParagraphsJson(t);
  if (structuredPlain != null) {
    t = postFormatPlainTextForApi(structuredPlain.replace(/\r\n/g, "\n").trim());
    return { optimized_prompt: t.slice(0, 12000) };
  }
  const fence = t.match(/^```(?:\w+)?\s*([\s\S]*?)```\s*$/);
  if (fence) {
    t = fence[1].trim();
  }
  if (t.startsWith("{") && /"prompt"\s*:/.test(t)) {
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed.prompt === "string" && parsed.prompt.trim()) {
        t = parsed.prompt.trim();
      }
    } catch (_e) {
      /* keep t */
    }
  }
  if (t.startsWith("{") && t.includes("improved_prompt")) {
    const parsed = parseModelJsonLoose(t);
    if (parsed && typeof parsed.improved_prompt === "string" && parsed.improved_prompt.trim()) {
      t = parsed.improved_prompt.trim();
    }
  }
  if (looksLikeRewriteInstructionEcho(t)) {
    return { optimized_prompt: String(fallbackPrompt || "").trim().slice(0, 12000) };
  }
  if (sourceForStrip && String(sourceForStrip).trim().length > 0) {
    t = stripEchoedOptimizeUserPackage(t);
    if (!t.trim()) {
      throw new Error("Model echoed request wrapper instead of improved prompt");
    }
    if (String(sourceForStrip).trim().length >= 80) {
      t = stripVerbatimSourceAppend(t, sourceForStrip);
    }
  }
  t = postFormatPlainTextForApi(t);
  if (composeGeneratedPrompt) {
    t = stripComposeMetaForbiddenSections(t);
  }
  return { optimized_prompt: t.slice(0, 12000) };
}

function buildGenerateModeMessages(userPrompt) {
  const metaInstructions = `Generate mode — built-in framework (worker has no Prompt engineering admin).

The user's next message (after this one) includes a labeled request. Output ONE ready-to-paste prompt the LLM can follow to DO THAT TASK.

Do NOT return meta-text about composing prompts. The output must BE the task prompt itself.

Layout: blank line between sections (two newlines); "- " or "1. " for lists. Plain text only—no # markdown headings, no code fences.

Target 220–600 words when the task needs detail; shorter if trivial. Hard max 900 words.`;

  return [
    { role: "user", content: metaInstructions },
    { role: "user", content: buildGenerateTaskTurn(userPrompt) }
  ];
}

export async function optimizePromptThroughProvider(env, prompt, userInstruction = "", optimizeMode = "improve") {
  const mode = String(optimizeMode || "improve").toLowerCase();
  const providerName = String(env.PROVIDER || "openai").toLowerCase();

  if (mode === "generate") {
    const messages = buildGenerateModeMessages(prompt);
    const createModel =
      providerName === "openai"
        ? String(env.OPENAI_REWRITE_MODEL || env.OPENAI_CREATE_MODEL || "gpt-5-nano").trim()
        : "";
    const createTimeoutMs = Math.max(
      10000,
      Math.min(90000, Number(env.OPENAI_CREATE_TIMEOUT_MS || env.OPENAI_REWRITE_TIMEOUT_MS || 45000))
    );
    const providerResult = await callProvider(env, messages, createTimeoutMs, {
      useJsonSchema: false,
      ...(createModel ? { modelOverride: createModel } : {}),
      ...(providerName === "openai" ? { gpt5MinTimeoutMs: 0 } : {})
    });
    const normalized = normalizePlainRewriteOutput(providerResult.rawText, prompt || userInstruction, "", true);
    return {
      optimized_prompt: postFormatPlainTextForApi(normalized.optimized_prompt),
      clarifying_questions: [],
      assumptions: [],
      classification: null,
      provider: providerResult.provider,
      model: providerResult.model,
      usage: providerResult.usage,
      latencyMs: providerResult.latencyMs
    };
  }

  const messages = mode === "auto" ? buildAutoModeMessages(prompt) : buildImproveModeMessages(prompt);
  const rewriteModel =
    providerName === "openai" ? String(env.OPENAI_REWRITE_MODEL || "gpt-5-nano").trim() : "";
  const rewriteTimeoutMs = Math.max(
    10000,
    Math.min(60000, Number(env.OPENAI_REWRITE_TIMEOUT_MS || 20000))
  );

  const providerResult = await callProvider(env, messages, rewriteTimeoutMs, {
    useJsonSchema: false,
    paragraphRewriteSchema: false,
    ...(rewriteModel ? { modelOverride: rewriteModel } : {}),
    ...(providerName === "openai" ? { gpt5MinTimeoutMs: 0 } : {})
  });
  const normalized = normalizePlainRewriteOutput(providerResult.rawText, prompt || userInstruction, prompt, false);
  const optimizedOut = normalized.optimized_prompt;

  return {
    optimized_prompt: postFormatPlainTextForApi(optimizedOut),
    clarifying_questions: [],
    assumptions: [],
    classification: null,
    provider: providerResult.provider,
    model: providerResult.model,
    usage: providerResult.usage,
    latencyMs: providerResult.latencyMs
  };
}
