import { NextResponse } from "next/server";
import { getAccountCompanyContext } from "@/lib/server/companyData";
import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const context = await getAccountCompanyContext(user.uid);
    return NextResponse.json({ ok: true, ...context }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 401 });
  }
}
