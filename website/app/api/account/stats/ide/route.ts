import { NextResponse } from "next/server";
import {
  type AccountStatsExtendedGranularity,
  type PromptlyIdeTool,
  getAccountIdeUsageStats,
  requireWebFirebaseUser
} from "@/lib/server/promptlyBackend";

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

export async function GET(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
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
    const stats = await getAccountIdeUsageStats(user, days, granularity, emailFilters);
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401 }
    );
  }
}
