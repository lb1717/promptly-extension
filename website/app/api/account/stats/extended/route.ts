import { NextResponse } from "next/server";
import {
  type AccountStatsExtendedGranularity,
  getAccountUsageStatsExtended,
  isPromptlyFirestoreQuotaError,
  requireWebFirebaseUser
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let user;
  try {
    ({ user } = await requireWebFirebaseUser(request));
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawDays = Number(searchParams.get("days") || "30");
    const days = Number.isFinite(rawDays) ? rawDays : 30;
    const rawGrain = String(searchParams.get("granularity") || "day").trim().toLowerCase();
    const granularity: AccountStatsExtendedGranularity = rawGrain === "week" ? "week" : "day";
    const bypassCache = searchParams.get("refresh") === "1";
    const stats = await getAccountUsageStatsExtended(user, days, granularity, { bypassCache });
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const quota = isPromptlyFirestoreQuotaError(error);
    return NextResponse.json(
      {
        error: quota
          ? "Firestore quota exceeded. Try a shorter date range or refresh in a few minutes."
          : message,
        quota_exceeded: quota
      },
      { status: quota ? 503 : 500 }
    );
  }
}
