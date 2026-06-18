import { requireAdminSession } from "@/lib/adminData";
import {
  adminGetCompanionPromptEngineering,
  adminSaveCompanionPromptEngineering,
  type CompanionPromptEngineeringConfig,
  type CompanionSuggestionGroup
} from "@/lib/server/companionPromptEngineering";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await adminGetCompanionPromptEngineering();
  return NextResponse.json(data, { status: 200 });
}

export async function PATCH(request: Request) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  try {
    const patch: Partial<CompanionPromptEngineeringConfig> = {};
    if (typeof b.improve_template === "string") patch.improve_template = b.improve_template;
    if (typeof b.refine_template === "string") patch.refine_template = b.refine_template;
    if (typeof b.improve_model === "string") patch.improve_model = b.improve_model;
    if (typeof b.refine_model === "string") patch.refine_model = b.refine_model;
    if (typeof b.fallback_model === "string") patch.fallback_model = b.fallback_model;
    if (typeof b.improve_timeout_ms === "number") patch.improve_timeout_ms = b.improve_timeout_ms;
    if (typeof b.refine_timeout_ms === "number") patch.refine_timeout_ms = b.refine_timeout_ms;
    if (typeof b.improve_max_completion_tokens === "number") {
      patch.improve_max_completion_tokens = b.improve_max_completion_tokens;
    }
    if (typeof b.refine_max_completion_tokens === "number") {
      patch.refine_max_completion_tokens = b.refine_max_completion_tokens;
    }
    if (typeof b.refine_continuation_max_rounds === "number") {
      patch.refine_continuation_max_rounds = b.refine_continuation_max_rounds;
    }
    if (typeof b.suggestion_word_threshold === "number") {
      patch.suggestion_word_threshold = b.suggestion_word_threshold;
    }
    if (typeof b.suggestion_count_short === "number") patch.suggestion_count_short = b.suggestion_count_short;
    if (typeof b.suggestion_count_long === "number") patch.suggestion_count_long = b.suggestion_count_long;
    if (Array.isArray(b.suggestion_groups)) {
      patch.suggestion_groups = b.suggestion_groups as CompanionSuggestionGroup[];
    }
    const result = await adminSaveCompanionPromptEngineering(patch);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
