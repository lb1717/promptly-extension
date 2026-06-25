import { NextResponse } from "next/server";
import { parseAccountStatsScopeFilter } from "@/lib/accountStatsScopeFilter";
import {
  type AccountStatsExtendedGranularity,
  type PromptlyIdeTool,
  isPromptlyFirestoreQuotaError,
  requireWebFirebaseUser
} from "@/lib/server/promptlyBackend";
import { getCompanyIdeUsageStats } from "@/lib/server/companyStatsAggregation";

export const runtime = "nodejs";

function parseEmailFilter(searchParams: URLSearchParams, tool: PromptlyIdeTool): Set<string> | undefined {
  const raw = searchParams.get(`${tool}_emails`);
  if (!raw) return undefined;
  const emails = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  return emails.length ? new Set(emails) : undefined;
}

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
    const emailFilters: Partial<Record<PromptlyIdeTool, Set<string>>> = {};
    for (const tool of ["claude_code", "cursor", "codex"] as PromptlyIdeTool[]) {
      const filter = parseEmailFilter(searchParams, tool);
      if (filter) {
        emailFilters[tool] = filter;
      }
    }
    const bypassCache = searchParams.get("refresh") === "1";
    const scopeFilter = parseAccountStatsScopeFilter(searchParams);
    const memberIds = parseMemberIds(searchParams);
    const stats = await getCompanyIdeUsageStats(user.uid, memberIds, days, granularity, emailFilters, {
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
