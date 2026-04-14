import { requireAdminSession } from "@/lib/adminData";
import { adminGetPromptEngineering, adminSavePromptEngineering } from "@/lib/server/promptlyBackend";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await adminGetPromptEngineering();
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
    const result = await adminSavePromptEngineering({
      rewrite_auto_template:
        typeof b.rewrite_auto_template === "string" ? b.rewrite_auto_template : undefined,
      rewrite_manual_template:
        typeof b.rewrite_manual_template === "string" ? b.rewrite_manual_template : undefined,
      compose_template: typeof b.compose_template === "string" ? b.compose_template : undefined,
      rewrite_auto_model:
        typeof b.rewrite_auto_model === "string" ? b.rewrite_auto_model : undefined,
      rewrite_manual_model:
        typeof b.rewrite_manual_model === "string" ? b.rewrite_manual_model : undefined,
      create_model:
        typeof b.create_model === "string" ? b.create_model : undefined,
      rewrite_fallback_model:
        typeof b.rewrite_fallback_model === "string" ? b.rewrite_fallback_model : undefined,
      create_fallback_model:
        typeof b.create_fallback_model === "string" ? b.create_fallback_model : undefined,
      rewrite_timeout_ms:
        typeof b.rewrite_timeout_ms === "number" ? b.rewrite_timeout_ms : undefined,
      create_timeout_ms:
        typeof b.create_timeout_ms === "number" ? b.create_timeout_ms : undefined,
      rewrite_max_completion_tokens:
        typeof b.rewrite_max_completion_tokens === "number" ? b.rewrite_max_completion_tokens : undefined,
      rewrite_auto_hard_cap_tokens:
        typeof b.rewrite_auto_hard_cap_tokens === "number" ? b.rewrite_auto_hard_cap_tokens : undefined,
      create_max_completion_tokens:
        typeof b.create_max_completion_tokens === "number" ? b.create_max_completion_tokens : undefined,
      create_continuation_max_rounds:
        typeof b.create_continuation_max_rounds === "number" ? b.create_continuation_max_rounds : undefined,
      create_template_max_chars:
        typeof b.create_template_max_chars === "number" ? b.create_template_max_chars : undefined,
      create_user_slot_max_chars:
        typeof b.create_user_slot_max_chars === "number" ? b.create_user_slot_max_chars : undefined
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
