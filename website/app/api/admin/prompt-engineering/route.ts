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
      compose_template: typeof b.compose_template === "string" ? b.compose_template : undefined
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
