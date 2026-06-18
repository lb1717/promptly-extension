export type CompanionOutputVerdict = { ok: true } | { ok: false; reason: string };

const REFINE_SUMMARY_MAX_WORDS = 35;

function normalizeCompare(text: string): string {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .trim()
    .toLowerCase();
}

function wordCount(text: string): number {
  const t = String(text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function countSentences(text: string): number {
  const t = String(text || "").trim();
  if (!t) return 0;
  const parts = t.split(/[.!?]+/).map((p) => p.trim()).filter(Boolean);
  return parts.length || 1;
}

export function assessCompanionImproveOutput(output: string, sourcePrompt: string): CompanionOutputVerdict {
  const out = String(output || "").trim();
  const src = String(sourcePrompt || "").trim();

  if (!out) {
    return { ok: false, reason: "Output is empty." };
  }
  if (/^please provide a prompt to rewrite\.?$/i.test(out) && src.length >= 8) {
    return { ok: false, reason: "Model refused to rewrite a valid draft." };
  }
  if (/⬥⬥⬥|<<<refine_input_|<<<promptly_refined/i.test(out)) {
    return { ok: false, reason: "Output contains internal refine markers." };
  }

  const low = out.toLowerCase();
  const echoPhrases = [
    "companion improve mode",
    "your job",
    "hard rules (violating",
    "output only the improved prompt text",
    "do not echo these instructions",
    "rewrite the user's draft prompt"
  ];
  const echoHits = echoPhrases.filter((p) => low.includes(p)).length;
  if (echoHits >= 1) {
    return { ok: false, reason: "Output echoes improve-template instructions instead of rewriting the draft." };
  }

  if (src && normalizeCompare(out) === normalizeCompare(src)) {
    return { ok: false, reason: "Output is identical to the source draft — not rewritten." };
  }
  if (src && out.startsWith(src)) {
    const tail = out.slice(src.length).trim().toLowerCase();
    if (tail.includes("your job") || /^-\s/.test(tail)) {
      return { ok: false, reason: "Output pastes the draft unchanged and appends template bullets." };
    }
  }

  return { ok: true };
}

export function assessCompanionRefineOutput(
  prompt: string,
  summary: string,
  sourcePrompt: string,
  feedback: string
): CompanionOutputVerdict {
  const p = String(prompt || "").trim();
  const s = String(summary || "").trim();
  const src = String(sourcePrompt || "").trim();
  const fb = String(feedback || "").trim();

  if (!p) {
    return { ok: false, reason: "Refine output is missing the edited prompt." };
  }
  if (!s) {
    return { ok: false, reason: "Refine output is missing a one-sentence summary." };
  }
  if (/⬥⬥⬥|<<<refine_input_/i.test(p)) {
    return { ok: false, reason: "Edited prompt still contains input markers." };
  }
  if (fb && normalizeCompare(p) === normalizeCompare(src)) {
    return { ok: false, reason: "Prompt was not modified — feedback was not integrated." };
  }
  if (fb && p.includes(fb)) {
    return { ok: false, reason: "Feedback was pasted into the prompt instead of integrated." };
  }
  if (wordCount(s) > REFINE_SUMMARY_MAX_WORDS) {
    return { ok: false, reason: "Summary must be one sentence (too long)." };
  }
  if (countSentences(s) > 2) {
    return { ok: false, reason: "Summary must be exactly one sentence." };
  }
  if (normalizeCompare(s) === normalizeCompare(p)) {
    return { ok: false, reason: "Summary duplicates the full prompt instead of describing the change." };
  }
  if (src.length > 120 && p.startsWith(src.slice(0, Math.min(400, src.length)))) {
    const growth = Math.abs(p.length - src.length) / Math.max(1, src.length);
    if (growth < 0.08 && fb) {
      return { ok: false, reason: "Prompt barely changed — feedback likely not applied." };
    }
  }

  return { ok: true };
}

function parseCheckJson(raw: string): CompanionOutputVerdict | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const jsonMatch = text.match(/\{[\s\S]*"valid"[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { valid?: unknown; reason?: unknown };
    if (parsed.valid === true) return { ok: true };
    if (parsed.valid === false) {
      const reason = String(parsed.reason || "").trim();
      return { ok: false, reason: reason || "Check round rejected the output." };
    }
  } catch {
    return null;
  }
  return null;
}

function buildImproveCheckMessage(sourcePrompt: string, candidate: string): string {
  return `You validate Companion improve-mode output.

SOURCE DRAFT (user input):
${String(sourcePrompt || "").trim().slice(0, 4000)}

CANDIDATE OUTPUT:
${String(candidate || "").trim().slice(0, 6000)}

Valid ONLY if CANDIDATE is a single cohesive improved prompt the user can paste into another AI — rewritten from the draft, preserving requirements.

Invalid if CANDIDATE:
- Echoes rewrite instructions (YOUR JOB, Companion improve mode, hard rules)
- Is the draft unchanged or draft + appended rubric bullets
- Answers or executes the task instead of improving the prompt
- Contains meta commentary about rewriting

Return ONLY JSON:
{"valid":true}
or
{"valid":false,"reason":"short explanation"}`;
}

function buildRefineCheckMessage(
  sourcePrompt: string,
  feedback: string,
  candidatePrompt: string,
  candidateSummary: string
): string {
  return `You validate Companion refine-mode output.

ORIGINAL PROMPT:
${String(sourcePrompt || "").trim().slice(0, 3500)}

USER FEEDBACK:
${String(feedback || "").trim().slice(0, 1500)}

CANDIDATE EDITED PROMPT:
${String(candidatePrompt || "").trim().slice(0, 5000)}

CANDIDATE SUMMARY:
${String(candidateSummary || "").trim().slice(0, 500)}

Valid ONLY if:
1. CANDIDATE EDITED PROMPT is the original prompt modified in place with feedback woven in (not feedback pasted at the end)
2. CANDIDATE SUMMARY is exactly one sentence describing what changed

Return ONLY JSON:
{"valid":true}
or
{"valid":false,"reason":"short explanation"}`;
}

export async function runCompanionOutputCheckRound(params: {
  mode: "improve" | "refine";
  model: string;
  timeoutMs: number;
  sourcePrompt: string;
  feedback?: string;
  candidatePrompt: string;
  candidateSummary?: string;
}): Promise<CompanionOutputVerdict> {
  const heuristic =
    params.mode === "improve"
      ? assessCompanionImproveOutput(params.candidatePrompt, params.sourcePrompt)
      : assessCompanionRefineOutput(
          params.candidatePrompt,
          String(params.candidateSummary || ""),
          params.sourcePrompt,
          String(params.feedback || "")
        );
  if (!heuristic.ok) {
    return heuristic;
  }

  const checkMessage =
    params.mode === "improve"
      ? buildImproveCheckMessage(params.sourcePrompt, params.candidatePrompt)
      : buildRefineCheckMessage(
          params.sourcePrompt,
          String(params.feedback || ""),
          params.candidatePrompt,
          String(params.candidateSummary || "")
        );

  try {
    const { executeOpenAiOptimizerCall } = await import("@/lib/server/promptlyBackend");
    const result = await executeOpenAiOptimizerCall({
      messages: [{ role: "user", content: checkMessage }],
      requestMode: "create",
      model: params.model,
      timeoutMs: Math.min(12_000, Math.max(6000, params.timeoutMs)),
      maxCompletionTokens: 120,
      createContinuationMaxRounds: 1
    });
    const parsed = parseCheckJson(result.rawText);
    if (parsed) {
      return parsed;
    }
  } catch {
    /* fall through — heuristic pass is enough */
  }

  return { ok: true };
}

export function buildCompanionImproveCheckRetry(reason: string): string {
  const issue = String(reason || "").trim() || "Output was not a valid improved prompt.";
  return `Validation failed: ${issue}

Reply with ONLY the improved prompt — one cohesive rewrite. No template rubric, no YOUR JOB section, no unchanged draft with bullets appended.`;
}

export const COMPANION_REFINE_CHECK_RETRY = `Validation failed.

Output must contain:
1. The PROMPT edited in place (feedback woven into the body — not pasted at the end)
2. Exactly one sentence summary of what you changed

Use the required delimiter markers only:

<<<PROMPTLY_REFINED_PROMPT>>>
(edited prompt)
<<<END_PROMPTLY_REFINED_PROMPT>>>
<<<PROMPTLY_REFINE_SUMMARY>>>
(one sentence)
<<<END_PROMPTLY_REFINE_SUMMARY>>>`;

export function buildCompanionRefineCheckRetry(reason: string): string {
  const issue = String(reason || "").trim();
  if (!issue) return COMPANION_REFINE_CHECK_RETRY;
  return `${COMPANION_REFINE_CHECK_RETRY}\n\nIssue: ${issue}`;
}
