import {
  getAccountCompanyContext,
  listCompanyMembers,
  type CompanyMember
} from "@/lib/server/companyData";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import {
  type AccountStatsExtendedGranularity,
  type AccountStatsScopeFilter,
  effectiveDailyTokenLimitFromUserData,
  getAccountIdeUsageStats,
  getAccountUsageStatsExtended,
  loadTierTokenLimits
} from "@/lib/server/promptlyBackend";

const USER_COLLECTION = "users";

type PromptlyUser = {
  uid: string;
  email: string | null;
  plan: string;
  dailyTokenLimit: number;
  promptsImprovedTotal: number;
  allTimeMaxDailyTokenUsage: number;
};

export type CompanyMemberBreakdownMember = {
  user_id: string;
  label: string;
};

export type CompanyMemberBreakdown = {
  members: CompanyMemberBreakdownMember[];
  prompt_timeline: Array<{ bucket: string; by_member: Record<string, number> }>;
  screen_time_timeline: Array<{ bucket: string; by_member: Record<string, number> }>;
  engagement_by_member: Record<
    string,
    {
      drafting_minutes: number;
      waiting_minutes: number;
      reading_idle_minutes: number;
      total_minutes: number;
    }
  >;
};

function companyMemberLabel(member: CompanyMember): string {
  return member.display_name || member.email || member.user_id.slice(0, 8);
}

async function loadPromptlyUserByUid(uid: string): Promise<PromptlyUser> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(USER_COLLECTION).doc(uid).get();
  const existing = (snap.data() || {}) as Record<string, unknown>;
  const limits = await loadTierTokenLimits();
  const dailyTokenLimit = effectiveDailyTokenLimitFromUserData(existing, limits);
  return {
    uid,
    email: typeof existing.email === "string" ? existing.email.trim().toLowerCase() : null,
    plan: String(existing.plan || "free"),
    dailyTokenLimit,
    promptsImprovedTotal: Math.max(0, Math.floor(Number(existing.promptsImprovedTotal || 0) || 0)),
    allTimeMaxDailyTokenUsage: Math.max(0, Math.floor(Number(existing.allTimeMaxDailyTokenUsage || 0) || 0))
  };
}

export async function resolveCompanyStatsMembers(adminUid: string, memberIdsRaw: string[]): Promise<{
  company: NonNullable<Awaited<ReturnType<typeof getAccountCompanyContext>>["company"]>;
  members: CompanyMember[];
  selectedMembers: CompanyMember[];
  selectedMemberIds: string[];
}> {
  const context = await getAccountCompanyContext(adminUid);
  if (!context.company || !context.membership?.is_admin) {
    throw new Error("Company admin access required");
  }
  const members = await listCompanyMembers(context.company.id);
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const requested = [...new Set(memberIdsRaw.map((id) => id.trim()).filter(Boolean))];
  const selectedMembers =
    requested.length > 0
      ? requested.map((id) => memberById.get(id)).filter((member): member is CompanyMember => Boolean(member))
      : members;
  if (!selectedMembers.length) {
    throw new Error("No valid members selected");
  }
  return {
    company: context.company,
    members,
    selectedMembers,
    selectedMemberIds: selectedMembers.map((member) => member.user_id)
  };
}

function sumCombinedTotals(
  rows: Awaited<ReturnType<typeof getAccountUsageStatsExtended>>[]
): Awaited<ReturnType<typeof getAccountUsageStatsExtended>>["combined_totals"] {
  return rows.reduce(
    (acc, row) => {
      const t = row.combined_totals;
      acc.prompts_estimate += t.prompts_estimate;
      acc.prompts_native_only_observed_sends += t.prompts_native_only_observed_sends;
      acc.prompts_with_promptly_optimize_events += t.prompts_with_promptly_optimize_events;
      acc.prompts_chatgpt_surface += t.prompts_chatgpt_surface;
      acc.prompts_claude_surface += t.prompts_claude_surface;
      acc.prompts_gemini_surface += t.prompts_gemini_surface;
      acc.prompts_unknown_surface += t.prompts_unknown_surface;
      acc.mirror_rows_synced_to_host_telemetry += t.mirror_rows_synced_to_host_telemetry;
      acc.native_sends_observed = (acc.native_sends_observed ?? 0) + (t.native_sends_observed ?? 0);
      return acc;
    },
    {
      prompts_estimate: 0,
      prompts_native_only_observed_sends: 0,
      prompts_with_promptly_optimize_events: 0,
      prompts_chatgpt_surface: 0,
      prompts_claude_surface: 0,
      prompts_gemini_surface: 0,
      prompts_unknown_surface: 0,
      mirror_rows_synced_to_host_telemetry: 0,
      native_sends_observed: 0,
      promptly_share_of_estimated_prompts_percent: null
    }
  );
}

function memberPromptCountForBucket(
  webStats: Awaited<ReturnType<typeof getAccountUsageStatsExtended>>,
  ideStats: Awaited<ReturnType<typeof getAccountIdeUsageStats>>,
  bucket: string
): number {
  const webRow = webStats.combined_prompt_timeline.find((row) => row.bucket === bucket);
  const ideRow = ideStats.prompt_timeline.find((row) => row.bucket === bucket);
  const webTotal = webRow?.prompts_total_bucket ?? 0;
  const ideTotal = (ideRow?.claude_code ?? 0) + (ideRow?.cursor ?? 0) + (ideRow?.codex ?? 0);
  return webTotal + ideTotal;
}

function memberScreenMinutesForBucket(
  webStats: Awaited<ReturnType<typeof getAccountUsageStatsExtended>>,
  ideStats: Awaited<ReturnType<typeof getAccountIdeUsageStats>>,
  bucket: string
): number {
  const webRow = webStats.screen_time_timeline.find((row) => row.bucket === bucket);
  const ideRow = ideStats.screen_time_timeline.find((row) => row.bucket === bucket);
  const webTotal =
    (webRow?.chatgpt_minutes ?? 0) +
    (webRow?.claude_minutes ?? 0) +
    (webRow?.gemini_minutes ?? 0);
  const ideTotal =
    (ideRow?.claude_code_minutes ?? 0) +
    (ideRow?.cursor_minutes ?? 0) +
    (ideRow?.codex_minutes ?? 0);
  return Math.round((webTotal + ideTotal) * 10) / 10;
}

function buildCompanyMemberBreakdown(
  selectedMembers: CompanyMember[],
  webStatsByMember: Map<string, Awaited<ReturnType<typeof getAccountUsageStatsExtended>>>,
  ideStatsByMember: Map<string, Awaited<ReturnType<typeof getAccountIdeUsageStats>>>,
  granularity: AccountStatsExtendedGranularity
): CompanyMemberBreakdown {
  const members = selectedMembers.map((member) => ({
    user_id: member.user_id,
    label: companyMemberLabel(member)
  }));
  const bucketSet = new Set<string>();
  for (const stats of webStatsByMember.values()) {
    for (const row of stats.combined_prompt_timeline) bucketSet.add(row.bucket);
    for (const row of stats.screen_time_timeline) bucketSet.add(row.bucket);
  }
  for (const stats of ideStatsByMember.values()) {
    for (const row of stats.prompt_timeline) bucketSet.add(row.bucket);
    for (const row of stats.screen_time_timeline) bucketSet.add(row.bucket);
  }
  const buckets = [...bucketSet].sort();
  const prompt_timeline = buckets.map((bucket) => ({
    bucket,
    by_member: Object.fromEntries(
      selectedMembers.map((member) => [
        member.user_id,
        memberPromptCountForBucket(
          webStatsByMember.get(member.user_id)!,
          ideStatsByMember.get(member.user_id)!,
          bucket
        )
      ])
    )
  }));
  const screen_time_timeline = buckets.map((bucket) => ({
    bucket,
    by_member: Object.fromEntries(
      selectedMembers.map((member) => [
        member.user_id,
        memberScreenMinutesForBucket(
          webStatsByMember.get(member.user_id)!,
          ideStatsByMember.get(member.user_id)!,
          bucket
        )
      ])
    )
  }));
  const engagement_by_member: CompanyMemberBreakdown["engagement_by_member"] = {};
  for (const member of selectedMembers) {
    const web = webStatsByMember.get(member.user_id);
    const ide = ideStatsByMember.get(member.user_id);
    const drafting =
      (web?.engagement_totals.drafting_minutes ?? 0) +
      (ide?.totals.engagement_minutes.drafting ?? 0);
    const waiting =
      (web?.engagement_totals.waiting_minutes ?? 0) + (ide?.totals.engagement_minutes.waiting ?? 0);
    const reading =
      (web?.engagement_totals.reading_idle_minutes ?? 0) +
      (ide?.totals.engagement_minutes.reading_idle ?? 0);
    engagement_by_member[member.user_id] = {
      drafting_minutes: drafting,
      waiting_minutes: waiting,
      reading_idle_minutes: reading,
      total_minutes: drafting + waiting + reading
    };
  }
  void granularity;
  return { members, prompt_timeline, screen_time_timeline, engagement_by_member };
}

function sumEngagementTotals(
  rows: Awaited<ReturnType<typeof getAccountUsageStatsExtended>>[]
): Awaited<ReturnType<typeof getAccountUsageStatsExtended>>["engagement_totals"] {
  return rows.reduce(
    (acc, row) => {
      const e = row.engagement_totals;
      acc.drafting_minutes += e.drafting_minutes;
      acc.waiting_minutes += e.waiting_minutes;
      acc.reading_idle_minutes += e.reading_idle_minutes;
      acc.segment_count += e.segment_count;
      return acc;
    },
    { drafting_minutes: 0, waiting_minutes: 0, reading_idle_minutes: 0, segment_count: 0 }
  );
}

function sumIdeEngagementTotals(
  rows: Awaited<ReturnType<typeof getAccountIdeUsageStats>>[]
): Awaited<ReturnType<typeof getAccountIdeUsageStats>>["totals"]["engagement_minutes"] {
  return rows.reduce(
    (acc, row) => {
      acc.drafting += row.totals.engagement_minutes.drafting;
      acc.waiting += row.totals.engagement_minutes.waiting;
      acc.reading_idle += row.totals.engagement_minutes.reading_idle;
      return acc;
    },
    { drafting: 0, waiting: 0, reading_idle: 0 }
  );
}

export async function getCompanyUsageStatsExtended(
  adminUid: string,
  memberIdsRaw: string[],
  days: number,
  granularity: AccountStatsExtendedGranularity = "day",
  opts?: { bypassCache?: boolean; scopeFilter?: AccountStatsScopeFilter }
) {
  const { selectedMembers, selectedMemberIds } = await resolveCompanyStatsMembers(adminUid, memberIdsRaw);
  const users = await Promise.all(selectedMemberIds.map((uid) => loadPromptlyUserByUid(uid)));

  if (selectedMemberIds.length === 1) {
    const stats = await getAccountUsageStatsExtended(users[0]!, days, granularity, opts);
    return {
      ...stats,
      company_multi_member: false,
      selected_member_ids: selectedMemberIds
    };
  }

  const perMemberWeb = await Promise.all(
    users.map((user) => getAccountUsageStatsExtended(user, days, granularity, opts))
  );
  const perMemberIde = await Promise.all(
    users.map((user) => getAccountIdeUsageStats(user, days, granularity, undefined, opts))
  );
  const base = perMemberWeb[0]!;
  const combined_totals = sumCombinedTotals(perMemberWeb);
  const engagement_totals = sumEngagementTotals(perMemberWeb);
  const webStatsByMember = new Map(selectedMemberIds.map((id, index) => [id, perMemberWeb[index]!]));
  const ideStatsByMember = new Map(selectedMemberIds.map((id, index) => [id, perMemberIde[index]!]));
  const ideEngagement = sumIdeEngagementTotals(perMemberIde);

  return {
    ...base,
    combined_totals,
    engagement_totals: {
      drafting_minutes: engagement_totals.drafting_minutes + ideEngagement.drafting,
      waiting_minutes: engagement_totals.waiting_minutes + ideEngagement.waiting,
      reading_idle_minutes: engagement_totals.reading_idle_minutes + ideEngagement.reading_idle,
      segment_count: engagement_totals.segment_count
    },
    company_multi_member: true,
    selected_member_ids: selectedMemberIds,
    company_member_breakdown: buildCompanyMemberBreakdown(
      selectedMembers,
      webStatsByMember,
      ideStatsByMember,
      granularity
    )
  };
}

export async function getCompanyIdeUsageStats(
  adminUid: string,
  memberIdsRaw: string[],
  days: number,
  granularity: AccountStatsExtendedGranularity = "day",
  emailFilters?: Parameters<typeof getAccountIdeUsageStats>[3],
  opts?: { bypassCache?: boolean; scopeFilter?: AccountStatsScopeFilter }
) {
  const { selectedMembers, selectedMemberIds } = await resolveCompanyStatsMembers(adminUid, memberIdsRaw);
  const users = await Promise.all(selectedMemberIds.map((uid) => loadPromptlyUserByUid(uid)));

  if (selectedMemberIds.length === 1) {
    const stats = await getAccountIdeUsageStats(users[0]!, days, granularity, emailFilters, opts);
    return {
      ...stats,
      company_multi_member: false,
      selected_member_ids: selectedMemberIds
    };
  }

  const perMemberStats = await Promise.all(
    users.map((user) => getAccountIdeUsageStats(user, days, granularity, emailFilters, opts))
  );
  const base = perMemberStats[0]!;
  const ideEngagement = sumIdeEngagementTotals(perMemberStats);
  const webStatsByMember = new Map(
    await Promise.all(
      selectedMemberIds.map(async (id, index) => [
        id,
        await getAccountUsageStatsExtended(users[index]!, days, granularity, opts)
      ] as const)
    )
  );
  const ideStatsByMember = new Map(selectedMemberIds.map((id, index) => [id, perMemberStats[index]!]));

  const totals = perMemberStats.reduce(
    (acc, row) => {
      acc.prompts.claude_code += row.totals.prompts.claude_code;
      acc.prompts.cursor += row.totals.prompts.cursor;
      acc.prompts.codex += row.totals.prompts.codex;
      acc.screen_time_minutes.claude_code += row.totals.screen_time_minutes.claude_code;
      acc.screen_time_minutes.cursor += row.totals.screen_time_minutes.cursor;
      acc.screen_time_minutes.codex += row.totals.screen_time_minutes.codex;
      return acc;
    },
    {
      prompts: { claude_code: 0, cursor: 0, codex: 0 },
      screen_time_minutes: { claude_code: 0, cursor: 0, codex: 0 },
      engagement_minutes: ideEngagement,
      engagement_minutes_by_tool: base.totals.engagement_minutes_by_tool
    }
  );

  return {
    ...base,
    totals: {
      ...base.totals,
      prompts: totals.prompts,
      screen_time_minutes: totals.screen_time_minutes,
      engagement_minutes: {
        drafting: ideEngagement.drafting,
        waiting: ideEngagement.waiting,
        reading_idle: ideEngagement.reading_idle
      }
    },
    company_multi_member: true,
    selected_member_ids: selectedMemberIds,
    company_member_breakdown: buildCompanyMemberBreakdown(
      selectedMembers,
      webStatsByMember,
      ideStatsByMember,
      granularity
    )
  };
}
