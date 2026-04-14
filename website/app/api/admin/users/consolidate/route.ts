import { requireAdminSession } from "@/lib/adminData";
import { adminConsolidateDuplicateUsers } from "@/lib/server/promptlyBackend";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const maxRaw =
    body && typeof body === "object" && "max_email_groups" in (body as Record<string, unknown>)
      ? (body as Record<string, unknown>).max_email_groups
      : undefined;
  const maxEmailGroups =
    typeof maxRaw === "number" && Number.isFinite(maxRaw)
      ? Math.max(1, Math.min(5000, Math.floor(maxRaw)))
      : 500;
  try {
    const result = await adminConsolidateDuplicateUsers(maxEmailGroups);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
