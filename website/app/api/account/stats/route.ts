import { NextResponse } from "next/server";
import { getAccountUsageStats, requireWebFirebaseUser } from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const { searchParams } = new URL(request.url);
    const rawDays = Number(searchParams.get("days") || "14");
    const days = Number.isFinite(rawDays) ? rawDays : 14;
    const stats = await getAccountUsageStats(user, days);
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401 }
    );
  }
}
