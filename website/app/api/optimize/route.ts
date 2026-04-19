import { NextResponse } from "next/server";
import {
  buildCreditsEnvelope,
  buildPromptlyCorsHeaders,
  consumeDailyUsage,
  CREDIT_MAX_ESTIMATED_INPUT_TOKENS,
  CREDIT_MAX_INSTRUCTION_CHARS,
  CREDIT_MAX_PROMPT_CHARS,
  estimateBundledInputTokensForOptimize,
  getCreditsForUser,
  getModeFromInstruction,
  getUtcDay,
  handlePromptlyPreflight,
  optimizePrompt,
  requirePromptlyUser
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return handlePromptlyPreflight(request);
}

export async function POST(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const auth = await requirePromptlyUser(request);
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
    const userInstruction =
      typeof payload.user_instruction === "string" ? payload.user_instruction.trim() : "";
    const requestMode =
      typeof payload.request_mode === "string" ? payload.request_mode.trim().toLowerCase() : "rewrite";

    if (!prompt && !userInstruction) {
      return NextResponse.json(
        { error: "prompt or user_instruction is required" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }
    if (prompt.length > CREDIT_MAX_PROMPT_CHARS) {
      return NextResponse.json(
        { error: `prompt exceeds ${CREDIT_MAX_PROMPT_CHARS} chars` },
        { status: 413, headers: buildPromptlyCorsHeaders(origin) }
      );
    }
    if (userInstruction.length > CREDIT_MAX_INSTRUCTION_CHARS) {
      return NextResponse.json(
        { error: `user_instruction exceeds ${CREDIT_MAX_INSTRUCTION_CHARS} chars` },
        { status: 413, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    const estimatedInputTokens = estimateBundledInputTokensForOptimize(prompt.length, userInstruction.length);
    if (estimatedInputTokens > CREDIT_MAX_ESTIMATED_INPUT_TOKENS) {
      return NextResponse.json(
        { error: "prompt estimated token size too large" },
        { status: 413, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    const creditsBefore = await getCreditsForUser(auth.user, request);
    if (creditsBefore.usage.used >= auth.user.dailyTokenLimit) {
      return NextResponse.json(
        {
          error: "Daily API token limit reached",
          credits: buildCreditsEnvelope(creditsBefore.usage, auth.user.dailyTokenLimit, { estimatedInputTokens })
        },
        { status: 429, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    const optimized = await optimizePrompt(prompt, userInstruction, requestMode, { forceConfigRefresh: true });
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
      requestMode,
      rewriteMode: requestMode === "rewrite" ? getModeFromInstruction(userInstruction) : undefined,
      day: getUtcDay(),
      tokenCost
    });

    if (!usageResult.ok) {
      return NextResponse.json(
        {
          error: "Daily API token limit reached",
          credits: buildCreditsEnvelope(usageResult.usage, auth.user.dailyTokenLimit, { estimatedInputTokens })
        },
        { status: 429, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    return NextResponse.json(
      {
        optimized_prompt: optimized.optimized_prompt,
        clarifying_questions: [],
        assumptions: [],
        usage: optimized.usage || null,
        billed_tokens: tokenCost,
        billing_basis: billingBasis,
        credits: buildCreditsEnvelope(usageResult.usage, auth.user.dailyTokenLimit, { estimatedInputTokens })
      },
      {
        status: 200,
        headers: buildPromptlyCorsHeaders(origin)
      }
    );
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    console.error("[promptly optimize] request failed:", message);
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
