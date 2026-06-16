import { NextResponse } from "next/server";
import { getCompanyStatsForAdmin } from "@/lib/server/companyData";
import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const { searchParams } = new URL(request.url);
    const days = Math.max(1, Math.min(365, Number(searchParams.get("days") || "30")));
    const payload = await getCompanyStatsForAdmin(user.uid, days);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: /access|required/i.test(message) ? 403 : 500 });
  }
}
