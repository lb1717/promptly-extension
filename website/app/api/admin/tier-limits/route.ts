import { requireAdminSession } from "@/lib/adminData";
import { adminGetTierLimits, adminSaveTierLimits } from "@/lib/server/promptlyBackend";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await adminGetTierLimits();
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
    const result = await adminSaveTierLimits({
      free: typeof b.free_daily_token_limit === "number" ? b.free_daily_token_limit : undefined,
      pro: typeof b.pro_daily_token_limit === "number" ? b.pro_daily_token_limit : undefined,
      student: typeof b.student_daily_token_limit === "number" ? b.student_daily_token_limit : undefined,
      enterprise:
        typeof b.enterprise_daily_token_limit === "number" ? b.enterprise_daily_token_limit : undefined,
      global:
        b.global_daily_token_limit === null
          ? null
          : typeof b.global_daily_token_limit === "number"
            ? b.global_daily_token_limit
            : undefined
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
