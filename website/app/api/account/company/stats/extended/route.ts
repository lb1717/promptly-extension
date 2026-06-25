import { NextResponse } from "next/server";
import { parseAccountStatsScopeFilter } from "@/lib/accountStatsScopeFilter";
import {
  type AccountStatsExtendedGranularity,
  isPromptlyFirestoreQuotaError,
  requireWebFirebaseUser
} from "@/lib/server/promptlyBackend";
import { getCompanyUsageStatsExtended } from "@/lib/server/companyStatsAggregation";

export const runtime = "nodejs";

function parseMemberIds(searchParams: URLSearchParams): string[] {
  const raw = String(searchParams.get("member_ids") || searchParams.get("members") || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

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
    const scopeFilter = parseAccountStatsScopeFilter(searchParams);
    const memberIds = parseMemberIds(searchParams);
    const stats = await getCompanyUsageStatsExtended(user.uid, memberIds, days, granularity, {
      bypassCache,
      scopeFilter
    });
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const quota = isPromptlyFirestoreQuotaError(error);
    const forbidden = /access|required|valid members/i.test(message);
    return NextResponse.json(
      {
        error: quota
          ? "Firestore quota exceeded. Try a shorter date range or refresh in a few minutes."
          : message,
        quota_exceeded: quota
      },
      { status: quota ? 503 : forbidden ? 403 : 500 }
    );
  }
}
