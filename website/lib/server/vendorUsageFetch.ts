import { createHash } from "crypto";
import type { VendorUsageProfileSnapshot, VendorUsageProvider, VendorUsageWindow } from "@/lib/server/vendorUsage";
import { normalizeUtilizationPercent, resolveVendorWindowUsedPercent } from "@/lib/vendorPlanPricing";
import type { StoredVendorTokens } from "@/lib/server/vendorUsageSecrets";

const CLAUDE_USAGE_BETA = "oauth-2025-04-20";
const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_CLI_UA = "claude-cli/2.1.9 (external, cli)";

function hashProfileId(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

function parseClaudePlanFromProfile(profile: Record<string, unknown> | null) {
  if (!profile) return { plan_slug: null, plan_display: null, plan_organization_type: null };
  const org = (profile.organization as Record<string, unknown> | undefined) || {};
  const account = (profile.account as Record<string, unknown> | undefined) || {};
  const orgType = typeof org.organization_type === "string" ? org.organization_type.toLowerCase() : "";
  const seatTier = typeof org.seat_tier === "string" ? org.seat_tier.toLowerCase() : "";
  const rateTier = typeof org.rate_limit_tier === "string" ? org.rate_limit_tier.toLowerCase() : "";
  const tierBlob = `${seatTier} ${rateTier} ${orgType}`;
  const isMax = orgType === "claude_max" || account.has_claude_max === true;
  const isPro = orgType === "claude_pro" || account.has_claude_pro === true;

  if (isMax) {
    if (tierBlob.includes("20")) {
      return { plan_slug: "max_20x", plan_display: "Claude Max (20×)", plan_organization_type: orgType || "claude_max" };
    }
    if (tierBlob.includes("5")) {
      return { plan_slug: "max_5x", plan_display: "Claude Max (5×)", plan_organization_type: orgType || "claude_max" };
    }
    return { plan_slug: "max", plan_display: "Claude Max", plan_organization_type: orgType || "claude_max" };
  }
  if (isPro || orgType.includes("pro")) {
    return { plan_slug: "pro", plan_display: "Claude Pro", plan_organization_type: orgType || "claude_pro" };
  }
  if (orgType.startsWith("claude_")) {
    const slug = orgType.replace(/^claude_/, "");
    const label = slug.replace(/_/g, " ");
    return {
      plan_slug: slug,
      plan_display: `Claude ${label.charAt(0).toUpperCase()}${label.slice(1)}`,
      plan_organization_type: orgType
    };
  }
  return { plan_slug: null, plan_display: null, plan_organization_type: orgType || null };
}

async function refreshClaudeAccessToken(refreshToken: string): Promise<string | null> {
  const urls = [
    "https://api.anthropic.com/v1/oauth/token",
    "https://platform.claude.com/v1/oauth/token"
  ];
  for (const url of urls) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": CLAUDE_CLI_UA
      },
      body: JSON.stringify({
        client_id: CLAUDE_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    });
    if (!res.ok) continue;
    const body = (await res.json().catch(() => null)) as { access_token?: string } | null;
    if (typeof body?.access_token === "string" && body.access_token.length > 20) {
      return body.access_token;
    }
  }
  return null;
}

async function fetchClaudeSnapshot(
  tokenRow: NonNullable<StoredVendorTokens["claude_code"]>,
  profileId: string | undefined,
  existingWindows: { primary: VendorUsageWindow | null; secondary: VendorUsageWindow | null } = {
    primary: null,
    secondary: null
  }
): Promise<VendorUsageProfileSnapshot | null> {
  let accessToken = tokenRow.access_token;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "anthropic-beta": CLAUDE_USAGE_BETA,
    Accept: "application/json",
    "User-Agent": CLAUDE_CLI_UA
  };
  let usageRes = await fetch("https://api.anthropic.com/api/oauth/usage", { headers });
  if (usageRes.status === 401 && tokenRow.refresh_token) {
    const refreshed = await refreshClaudeAccessToken(tokenRow.refresh_token);
    if (refreshed) {
      accessToken = refreshed;
      headers.Authorization = `Bearer ${accessToken}`;
      usageRes = await fetch("https://api.anthropic.com/api/oauth/usage", { headers });
    }
  }
  if (!usageRes.ok) return null;
  const [usage, profileRes] = await Promise.all([
    usageRes.json(),
    fetch("https://api.anthropic.com/api/oauth/profile", { headers })
  ]);
  const profile = profileRes.ok ? ((await profileRes.json()) as Record<string, unknown>) : null;
  const five = (usage as Record<string, unknown>)?.five_hour || (usage as Record<string, unknown>)?.fiveHour;
  const seven = (usage as Record<string, unknown>)?.seven_day || (usage as Record<string, unknown>)?.sevenDay;
  const account = (profile?.account as Record<string, unknown> | undefined) || {};
  const email =
    (typeof account.email === "string" && account.email) ||
    (typeof profile?.email === "string" && profile.email) ||
    null;
  const plan = parseClaudePlanFromProfile(profile);
  const fiveRow = five as Record<string, unknown> | undefined;
  const sevenRow = seven as Record<string, unknown> | undefined;
  const fiveResetsAt =
    (typeof fiveRow?.resets_at === "string" && fiveRow.resets_at) ||
    (typeof fiveRow?.resetsAt === "string" && fiveRow.resetsAt) ||
    null;
  const sevenResetsAt =
    (typeof sevenRow?.resets_at === "string" && sevenRow.resets_at) ||
    (typeof sevenRow?.resetsAt === "string" && sevenRow.resetsAt) ||
    null;
  return {
    provider: "claude_code",
    profile_id: profileId || hashProfileId("claude_subscription"),
    profile_label: "Claude subscription",
    config_dir: null,
    vendor_email: email,
    plan_slug: plan.plan_slug,
    plan_display: plan.plan_display,
    plan_organization_type: plan.plan_organization_type,
    primary_window: fiveRow
      ? {
          utilization: resolveVendorWindowUsedPercent(fiveRow, {
            previousUtilization: existingWindows.primary?.utilization ?? null,
            previousResetsAt: existingWindows.primary?.resets_at ?? null,
            resetsAt: fiveResetsAt,
            windowSeconds: 5 * 3600
          }),
          resets_at: fiveResetsAt,
          window_seconds: 5 * 3600
        }
      : null,
    secondary_window: sevenRow
      ? {
          utilization: resolveVendorWindowUsedPercent(sevenRow, {
            previousUtilization: existingWindows.secondary?.utilization ?? null,
            previousResetsAt: existingWindows.secondary?.resets_at ?? null,
            resetsAt: sevenResetsAt,
            windowSeconds: 7 * 86400
          }),
          resets_at: sevenResetsAt,
          window_seconds: 7 * 86400
        }
      : null,
    sync_error: null,
    synced_at_ms: Date.now()
  };
}

function codexWindowResetsAt(window: Record<string, unknown> | undefined): string | null {
  if (!window) return null;
  const resetAt = window.reset_at;
  return resetAt ? new Date(Number(resetAt) * 1000).toISOString() : null;
}

async function fetchCodexSnapshot(
  tokenRow: NonNullable<StoredVendorTokens["codex"]>,
  profileId: string | undefined,
  existingWindows: { primary: VendorUsageWindow | null; secondary: VendorUsageWindow | null } = {
    primary: null,
    secondary: null
  }
): Promise<VendorUsageProfileSnapshot | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${tokenRow.access_token}`,
    Accept: "application/json"
  };
  if (tokenRow.account_id) headers["ChatGPT-Account-Id"] = tokenRow.account_id;
  const res = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers });
  if (!res.ok) return null;
  const usage = (await res.json()) as Record<string, unknown>;
  const rateLimit = (usage.rate_limit as Record<string, unknown> | undefined) || {};
  const primary = rateLimit.primary_window as Record<string, unknown> | undefined;
  const secondary = rateLimit.secondary_window as Record<string, unknown> | undefined;
  const limitReached = rateLimit.limit_reached === true;
  const primaryResetsAt = codexWindowResetsAt(primary);
  const secondaryResetsAt = codexWindowResetsAt(secondary);
  const planType = usage.plan_type || usage.planType;
  let email: string | null = null;
  try {
    const meRes = await fetch("https://chatgpt.com/backend-api/me", { headers });
    if (meRes.ok) {
      const me = (await meRes.json()) as Record<string, unknown>;
      const account = me.account as Record<string, unknown> | undefined;
      email = (typeof me.email === "string" && me.email) || (typeof account?.email === "string" && account.email) || null;
    }
  } catch {
    /* optional */
  }
  const planSlug = typeof planType === "string" ? planType : null;
  return {
    provider: "codex",
    profile_id: profileId || hashProfileId("codex_default"),
    profile_label: "Default",
    config_dir: null,
    vendor_email: email,
    plan_slug: planSlug,
    plan_display: planSlug ? planSlug.charAt(0).toUpperCase() + planSlug.slice(1) : null,
    plan_organization_type: null,
    primary_window: primary
      ? {
          utilization: resolveVendorWindowUsedPercent(primary, {
            limitReached,
            previousUtilization: existingWindows.primary?.utilization ?? null,
            previousResetsAt: existingWindows.primary?.resets_at ?? null,
            resetsAt: primaryResetsAt
          }),
          resets_at: primaryResetsAt,
          window_seconds: Number(primary.limit_window_seconds ?? 5 * 3600)
        }
      : null,
    secondary_window: secondary
      ? {
          utilization: resolveVendorWindowUsedPercent(secondary, {
            limitReached,
            previousUtilization: existingWindows.secondary?.utilization ?? null,
            previousResetsAt: existingWindows.secondary?.resets_at ?? null,
            resetsAt: secondaryResetsAt
          }),
          resets_at: secondaryResetsAt,
          window_seconds: Number(secondary.limit_window_seconds ?? 7 * 86400)
        }
      : null,
    sync_error: null,
    synced_at_ms: Date.now()
  };
}

function formatCursorPlanDisplay(planSlug: string | null | undefined): string | null {
  if (!planSlug) return null;
  return planSlug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchCursorSnapshot(
  tokenRow: NonNullable<StoredVendorTokens["cursor"]>,
  profileId: string | undefined,
  existingWindows: { primary: VendorUsageWindow | null; secondary: VendorUsageWindow | null } = {
    primary: null,
    secondary: null
  }
): Promise<VendorUsageProfileSnapshot | null> {
  const res = await fetch("https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenRow.access_token}`,
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1"
    },
    body: "{}"
  });
  if (!res.ok) return null;
  const usage = (await res.json()) as Record<string, unknown>;
  const planUsage = (usage.planUsage as Record<string, unknown> | undefined) || {};
  const totalPercent = Number(planUsage.totalPercentUsed ?? planUsage.apiPercentUsed ?? 0);
  const apiPercent = Number(planUsage.apiPercentUsed ?? totalPercent);
  const cycleEndMs = Number(usage.billingCycleEnd ?? 0);
  const cycleStartMs = Number(usage.billingCycleStart ?? 0);
  const windowSeconds =
    cycleEndMs > cycleStartMs ? Math.max(86400, Math.round((cycleEndMs - cycleStartMs) / 1000)) : 30 * 86400;
  const cycleEndIso = cycleEndMs > 0 ? new Date(cycleEndMs).toISOString() : null;
  const planSlug = tokenRow.plan_slug || null;
  return {
    provider: "cursor",
    profile_id: profileId || hashProfileId("cursor_default"),
    profile_label: "Default",
    config_dir: null,
    vendor_email: tokenRow.email || null,
    plan_slug: planSlug,
    plan_display: formatCursorPlanDisplay(planSlug),
    plan_organization_type: null,
    primary_window: {
      utilization: resolveVendorWindowUsedPercent(
        {
          used_percent: apiPercent,
          utilization: apiPercent,
          resets_at: cycleEndIso,
          limit_window_seconds: 5 * 3600
        },
        {
          previousUtilization: existingWindows.primary?.utilization ?? null,
          previousResetsAt: existingWindows.primary?.resets_at ?? null,
          resetsAt: cycleEndIso,
          windowSeconds: 5 * 3600
        }
      ),
      resets_at: cycleEndIso,
      window_seconds: 5 * 3600
    },
    secondary_window: {
      utilization: resolveVendorWindowUsedPercent(
        {
          used_percent: totalPercent,
          utilization: totalPercent,
          totalPercentUsed: totalPercent,
          resets_at: cycleEndIso,
          limit_window_seconds: windowSeconds
        },
        {
          previousUtilization: existingWindows.secondary?.utilization ?? null,
          previousResetsAt: existingWindows.secondary?.resets_at ?? null,
          resetsAt: cycleEndIso,
          windowSeconds
        }
      ),
      resets_at: cycleEndIso,
      window_seconds: windowSeconds
    },
    sync_error: null,
    synced_at_ms: Date.now()
  };
}

export async function fetchLiveVendorUsageSnapshots(
  tokens: StoredVendorTokens,
  existingProfileIds: Partial<Record<VendorUsageProvider, string>> = {},
  existingProfiles: Partial<Record<VendorUsageProvider, VendorUsageProfileSnapshot>> = {}
): Promise<VendorUsageProfileSnapshot[]> {
  const snapshots: VendorUsageProfileSnapshot[] = [];
  if (tokens.claude_code?.access_token) {
    const existing = existingProfiles.claude_code;
    const row = await fetchClaudeSnapshot(tokens.claude_code, existingProfileIds.claude_code, {
      primary: existing?.primary_window ?? null,
      secondary: existing?.secondary_window ?? null
    });
    if (row) snapshots.push(row);
  }
  if (tokens.codex?.access_token) {
    const existing = existingProfiles.codex;
    const row = await fetchCodexSnapshot(tokens.codex, existingProfileIds.codex, {
      primary: existing?.primary_window ?? null,
      secondary: existing?.secondary_window ?? null
    });
    if (row) snapshots.push(row);
  }
  if (tokens.cursor?.access_token) {
    const existing = existingProfiles.cursor;
    const row = await fetchCursorSnapshot(tokens.cursor, existingProfileIds.cursor, {
      primary: existing?.primary_window ?? null,
      secondary: existing?.secondary_window ?? null
    });
    if (row) snapshots.push(row);
  }
  return snapshots;
}
