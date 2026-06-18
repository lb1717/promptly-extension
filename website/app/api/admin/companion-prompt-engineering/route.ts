import { requireAdminSession } from "@/lib/adminData";
import {
  adminGetCompanionPromptEngineering,
  adminSaveCompanionPromptEngineering,
  getDefaultCompanionImproveTemplate,
  type CompanionPromptEngineeringConfig,
  type CompanionSuggestionGroup
} from "@/lib/server/companionPromptEngineering";
import { getCompanionSuggestionCatalogStats } from "@/lib/server/companionSuggestionPicker";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await adminGetCompanionPromptEngineering();
  return NextResponse.json(
    {
      ...data,
      catalog_stats: getCompanionSuggestionCatalogStats(),
      default_improve_template: getDefaultCompanionImproveTemplate()
    },
    { status: 200 }
  );
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
    if (typeof b.suggestion_picker_model === "string") patch.suggestion_picker_model = b.suggestion_picker_model;
    if (typeof b.suggestion_picker_timeout_ms === "number") {
      patch.suggestion_picker_timeout_ms = b.suggestion_picker_timeout_ms;
    }
    if (typeof b.suggestion_ai_pick_count === "number") patch.suggestion_ai_pick_count = b.suggestion_ai_pick_count;
    if (typeof b.suggestion_display_min === "number") patch.suggestion_display_min = b.suggestion_display_min;
    if (typeof b.suggestion_display_max === "number") patch.suggestion_display_max = b.suggestion_display_max;
    if (typeof b.suggestion_max_per_category === "number") {
      patch.suggestion_max_per_category = b.suggestion_max_per_category;
    }
    const result = await adminSaveCompanionPromptEngineering(patch);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
