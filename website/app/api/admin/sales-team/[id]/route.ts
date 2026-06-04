import { requireAdminSession } from "@/lib/adminData";
import {
  adminDeleteSalesTeam,
  adminGetSalesTeamWithLinks,
  adminSetSalesTeamActive
} from "@/lib/server/salesTeam";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await adminGetSalesTeamWithLinks(params.id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  try {
    if (typeof b.active === "boolean") {
      const result = await adminSetSalesTeamActive(params.id, b.active);
      return NextResponse.json(result, { status: 200 });
    }
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await adminDeleteSalesTeam(params.id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
