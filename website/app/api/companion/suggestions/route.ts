import { NextResponse } from "next/server";
import {
  buildPromptlyCorsHeaders,
  handlePromptlyPreflight,
  requirePromptlyOptimizeUser
} from "@/lib/server/promptlyBackend";
import {
  loadCompanionPromptEngineeringConfig,
  pickCompanionSuggestions
} from "@/lib/server/companionPromptEngineering";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return handlePromptlyPreflight(request);
}

export async function GET(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    await requirePromptlyOptimizeUser(request);
    const url = new URL(request.url);
    const wordCountRaw = Number(url.searchParams.get("word_count") || 0);
    const wordCount = Number.isFinite(wordCountRaw) ? Math.max(0, Math.floor(wordCountRaw)) : 0;
    const config = await loadCompanionPromptEngineeringConfig({ forceRefresh: true });
    const suggestions = pickCompanionSuggestions(config, wordCount);
    return NextResponse.json(
      {
        suggestions,
        meta: {
          word_count: wordCount,
          suggestion_word_threshold: config.suggestion_word_threshold,
          suggestion_count_short: config.suggestion_count_short,
          suggestion_count_long: config.suggestion_count_long
        }
      },
      { status: 200, headers: buildPromptlyCorsHeaders(origin) }
    );
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = /auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status, headers: buildPromptlyCorsHeaders(origin) });
  }
}
