import { NextResponse } from "next/server";
import {
  buildCreditsEnvelope,
  buildPromptlyCorsHeaders,
  consumeDailyUsage,
  countComposerWordsRough,
  CREDIT_MAX_ESTIMATED_INPUT_TOKENS,
  CREDIT_MAX_INSTRUCTION_CHARS,
  CREDIT_MAX_PROMPT_CHARS,
  estimateBundledInputTokensForOptimize,
  getCreditsForUser,
  getUtcDay,
  getUtcWeekKey,
  handlePromptlyPreflight,
  normalizePromptlyService,
  optimizeCompanionPrompt,
  parseOptimizeTelemetryFromPayload,
  recordOptimizeTelemetryEventSafe,
  requirePromptlyOptimizeUser,
  weeklyTokenLimitFromDaily
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

type CompanionOptimizeMode = "improve" | "refine";

function resolveCompanionMode(raw: unknown): CompanionOptimizeMode | null {
  const mode = String(raw || "").trim().toLowerCase();
  if (mode === "improve" || mode === "refine") return mode;
  return null;
}

export async function OPTIONS(request: Request) {
  return handlePromptlyPreflight(request);
}

export async function POST(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const auth = await requirePromptlyOptimizeUser(request);
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
    const promptFeedback =
      typeof payload.prompt_feedback === "string"
        ? payload.prompt_feedback.trim()
        : typeof payload.feedback === "string"
          ? payload.feedback.trim()
          : "";
    const optimizeMode = resolveCompanionMode(payload.optimize_mode);
    if (!optimizeMode) {
      return NextResponse.json(
        { error: "optimize_mode must be improve or refine" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    if (optimizeMode === "refine") {
      if (!prompt) {
        return NextResponse.json(
          { error: "prompt is required for refine mode" },
          { status: 400, headers: buildPromptlyCorsHeaders(origin) }
        );
      }
      if (!promptFeedback) {
        return NextResponse.json(
          { error: "prompt_feedback is required for refine mode" },
          { status: 400, headers: buildPromptlyCorsHeaders(origin) }
        );
      }
      if (promptFeedback.length > CREDIT_MAX_INSTRUCTION_CHARS) {
        return NextResponse.json(
          { error: `prompt_feedback exceeds ${CREDIT_MAX_INSTRUCTION_CHARS} chars` },
          { status: 413, headers: buildPromptlyCorsHeaders(origin) }
        );
      }
    } else if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required for improve mode" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    if (prompt.length > CREDIT_MAX_PROMPT_CHARS) {
      return NextResponse.json(
        { error: `prompt exceeds ${CREDIT_MAX_PROMPT_CHARS} chars` },
        { status: 413, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    const estimatedInputTokens = estimateBundledInputTokensForOptimize(
      prompt.length + (optimizeMode === "refine" ? promptFeedback.length : 0),
      0
    );
    if (estimatedInputTokens > CREDIT_MAX_ESTIMATED_INPUT_TOKENS) {
      return NextResponse.json(
        { error: "prompt estimated token size too large" },
        { status: 413, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    const weeklyLimit = weeklyTokenLimitFromDaily(auth.user.dailyTokenLimit);
    const creditsBefore = await getCreditsForUser(auth.user, request);
    if (creditsBefore.usage.used >= weeklyLimit) {
      return NextResponse.json(
        {
          error: "Weekly API token limit reached",
          credits: buildCreditsEnvelope(creditsBefore.usage, weeklyLimit, { estimatedInputTokens })
        },
        { status: 429, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    const service = normalizePromptlyService(request.headers.get("x-promptly-service"));
    const telemetrySnapshot = parseOptimizeTelemetryFromPayload(payload as Record<string, unknown>);
    const optimizeStartedAt = Date.now();
    const optimized = await optimizeCompanionPrompt(prompt, promptFeedback, optimizeMode, {
      forceConfigRefresh: true
    });
    const optimizeElapsedMs = Math.max(0, Date.now() - optimizeStartedAt);
    const optimizedText = String(optimized?.optimized_prompt ?? "").trim();
    const optimized_prompt = optimizedText || (optimizeMode === "refine" ? "" : prompt);
    const providerUsagePrompt = Math.max(0, Number(optimized?.usage?.prompt_tokens || 0));
    const providerUsageCompletion = Math.max(0, Number(optimized?.usage?.completion_tokens || 0));
    const providerUsageTotalRaw = Math.max(0, Number(optimized?.usage?.total_tokens || 0));
    const providerUsageDerivedTotal = Math.max(0, providerUsagePrompt + providerUsageCompletion);
    const providerUsageTotal = providerUsageTotalRaw > 0 ? providerUsageTotalRaw : providerUsageDerivedTotal;
    const tokenCost = Math.max(1, providerUsageTotal || estimatedInputTokens);
    const billingBasis =
      providerUsageTotalRaw > 0
        ? "provider_total_tokens"
        : providerUsageDerivedTotal > 0
          ? "provider_prompt_plus_completion"
          : "estimated_input_tokens";

    const usageResult = await consumeDailyUsage({
      user: auth.user,
      optimizeMode,
      day: getUtcWeekKey(),
      tokenCost,
      service,
      responseTimeMs: optimizeElapsedMs
    });

    if (!usageResult.ok) {
      return NextResponse.json(
        {
          error: "Weekly API token limit reached",
          credits: buildCreditsEnvelope(usageResult.usage, weeklyLimit, { estimatedInputTokens })
        },
        { status: 429, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    recordOptimizeTelemetryEventSafe({
      user: auth.user,
      service,
      optimizeMode,
      utcDay: getUtcDay(),
      billedPromptlyTokens: tokenCost,
      optimizeLatencyMs: optimizeElapsedMs,
      billingBasis,
      telemetry: telemetrySnapshot,
      serverComposerCharTotal: Math.min(
        CREDIT_MAX_PROMPT_CHARS,
        prompt.length + (optimizeMode === "refine" ? promptFeedback.length : 0)
      ),
      serverComposerWordTotal: countComposerWordsRough(
        prompt,
        optimizeMode === "refine" ? promptFeedback : ""
      ),
      serverOptimizedWordTotal: countComposerWordsRough(optimized_prompt)
    });

    return NextResponse.json(
      {
        optimized_prompt,
        ...(optimizeMode === "refine" && optimized.refine_summary
          ? { refine_summary: optimized.refine_summary }
          : {}),
        clarifying_questions: [],
        assumptions: [],
        usage: optimized.usage || null,
        billed_tokens: tokenCost,
        billing_basis: billingBasis,
        credits: buildCreditsEnvelope(usageResult.usage, weeklyLimit, { estimatedInputTokens })
      },
      {
        status: 200,
        headers: buildPromptlyCorsHeaders(origin)
      }
    );
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    console.error("[companion optimize] request failed:", message);
    const status = /missing or invalid x-promptly-client|missing firebase auth token/i.test(message)
      ? 400
      : /google account email does not match|invalid google access token|auth/i.test(message)
        ? 401
        : /timeout|provider|model declined/i.test(message)
          ? 502
          : 500;
    return NextResponse.json(
      { error: message },
      {
        status,
        headers: buildPromptlyCorsHeaders(origin)
      }
    );
  }
}
