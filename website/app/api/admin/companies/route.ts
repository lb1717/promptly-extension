import { NextResponse } from "next/server";
import { createCompany, listCompanies } from "@/lib/server/companyData";
import { requireAdminSession } from "@/lib/adminData";

export const runtime = "nodejs";

export async function GET() {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const companies = await listCompanies();
  return NextResponse.json({ ok: true, companies }, { status: 200 });
}

export async function POST(request: Request) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const company = await createCompany({ name: b.name, logo_url: b.logo_url });
    return NextResponse.json({ ok: true, company }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}
