import { NextResponse } from "next/server";
import {
  type AccountStatsExtendedGranularity,
  getAccountIdeUsageStats,
  requireWebFirebaseUser
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const { searchParams } = new URL(request.url);
    const rawDays = Number(searchParams.get("days") || "30");
    const days = Number.isFinite(rawDays) ? rawDays : 30;
    const rawGrain = String(searchParams.get("granularity") || "day").trim().toLowerCase();
    const granularity: AccountStatsExtendedGranularity = rawGrain === "week" ? "week" : "day";
    const stats = await getAccountIdeUsageStats(user, days, granularity);
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401 }
    );
  }
}
