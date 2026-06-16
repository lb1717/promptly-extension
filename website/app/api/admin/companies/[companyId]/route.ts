import {
  getCompanyAdminDetail,
  requireAdminSession
} from "@/lib/adminData";
import { updateCompany } from "@/lib/server/companyData";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: { companyId: string } }) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const detail = await getCompanyAdminDetail(decodeURIComponent(context.params.companyId));
    return NextResponse.json({ ok: true, ...detail }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 404 });
  }
}

export async function PATCH(request: Request, context: { params: { companyId: string } }) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const patch: { name?: unknown; logo_url?: unknown } = {};
    if (Object.prototype.hasOwnProperty.call(b, "name")) patch.name = b.name;
    if (Object.prototype.hasOwnProperty.call(b, "logo_url")) patch.logo_url = b.logo_url;
    const company = await updateCompany(decodeURIComponent(context.params.companyId), patch);
    return NextResponse.json({ ok: true, company }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}
