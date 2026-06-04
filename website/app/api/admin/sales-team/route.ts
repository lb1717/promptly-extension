import { requireAdminSession } from "@/lib/adminData";
import { adminCreateSalesTeam, adminListSalesTeam } from "@/lib/server/salesTeam";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await adminListSalesTeam();
  return NextResponse.json(data, { status: 200 });
}

export async function POST(request: Request) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  try {
    const result = await adminCreateSalesTeam({
      name: typeof b.name === "string" ? b.name : "",
      slug: typeof b.slug === "string" ? b.slug : null,
      internalNote: typeof b.internal_note === "string" ? b.internal_note : null
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
