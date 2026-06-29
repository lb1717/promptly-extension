import { NextResponse } from "next/server";
import { markCompanionDesktopAdopted } from "@/lib/server/companionAdoption";
import {
  buildPromptlyCorsHeaders,
  handlePromptlyPreflight,
  requirePromptlyOptimizeUser
} from "@/lib/server/promptlyBackend";
import { loadCompanionPromptEngineeringConfig } from "@/lib/server/companionPromptEngineering";
import {
  getCompanionSuggestionCatalogStats,
  pickCompanionSuggestionsForPrompt
} from "@/lib/server/companionSuggestionPicker";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return handlePromptlyPreflight(request);
}

async function handleSuggestionsRequest(request: Request, promptText: string) {
  const origin = request.headers.get("Origin");
  const auth = await requirePromptlyOptimizeUser(request);
  await markCompanionDesktopAdopted(auth.user.uid);
  const prompt = String(promptText || "").trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "prompt is required" },
      { status: 400, headers: buildPromptlyCorsHeaders(origin) }
    );
  }

  const config = await loadCompanionPromptEngineeringConfig({ forceRefresh: true });
  const suggestions = await pickCompanionSuggestionsForPrompt(prompt, config);
  const catalogStats = getCompanionSuggestionCatalogStats();

  return NextResponse.json(
    {
      suggestions,
      meta: {
        picker: "ai",
        catalog_total: catalogStats.total,
        catalog_categories: catalogStats.categories.length,
        suggestion_ai_pick_count: config.suggestion_ai_pick_count,
        suggestion_display_min: config.suggestion_display_min,
        suggestion_display_max: config.suggestion_display_max
      }
    },
    { status: 200, headers: buildPromptlyCorsHeaders(origin) }
  );
}

export async function GET(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const url = new URL(request.url);
    const prompt = String(url.searchParams.get("prompt") || "").trim();
    return await handleSuggestionsRequest(request, prompt);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = /auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status, headers: buildPromptlyCorsHeaders(origin) });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const payload = await request.json().catch(() => null);
    const prompt =
      payload && typeof payload === "object" && typeof (payload as { prompt?: unknown }).prompt === "string"
        ? String((payload as { prompt: string }).prompt)
        : "";
    return await handleSuggestionsRequest(request, prompt);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = /auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status, headers: buildPromptlyCorsHeaders(origin) });
  }
}
