import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { interpolateDailyUtilizationMap, normalizeUtilizationPercent } from "@/lib/vendorPlanPricing";
import { listVendorUsageProfiles, type VendorUsageProfileView } from "@/lib/server/vendorUsage";

const COMPANIES_COLLECTION = "companies";
const USERS_COLLECTION = "users";
const DAILY_USAGE_COLLECTION = "promptly_usage_daily";
const IDE_EVENTS_COLLECTION = "promptly_ide_events";
const COMPANY_EMAIL_INVITES_COLLECTION = "company_email_invites";
const PENDING_INVITES_SUBCOLLECTION = "pending_invites";
const MAX_COMPANY_LOGO_DATA_URL_CHARS = 220_000;

export type CompanyRole = "admin" | "member";

export type CompanyRecord = {
  id: string;
  name: string;
  logo_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CompanyMember = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: CompanyRole;
  subscription_tier: string;
};

export type CompanyPendingInvite = {
  email: string;
  role: CompanyRole;
  created_at: string | null;
};

function timestampToIso(value: unknown): string | null {
  if (!value || typeof value !== "object" || typeof (value as { toDate?: unknown }).toDate !== "function") {
    return null;
  }
  try {
    return (value as { toDate: () => Date }).toDate().toISOString();
  } catch {
    return null;
  }
}

function sanitizeCompanyName(raw: unknown): string {
  const name = String(raw || "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name) throw new Error("Company name is required");
  return name;
}

function sanitizeLogoDataUrl(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  if (!/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(value)) {
    throw new Error("Logo must be a base64 image data URL");
  }
  if (value.length > MAX_COMPANY_LOGO_DATA_URL_CHARS) {
    throw new Error("Logo is too large");
  }
  return value;
}

function readCompany(id: string, raw: Record<string, unknown>): CompanyRecord {
  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled company",
    logo_url: typeof raw.logoUrl === "string" && raw.logoUrl.trim() ? raw.logoUrl.trim() : null,
    created_at: timestampToIso(raw.createdAt),
    updated_at: timestampToIso(raw.updatedAt)
  };
}

function readRole(raw: unknown): CompanyRole {
  return raw === "admin" ? "admin" : "member";
}

function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

function msToStatMinutes(ms: number): number {
  return Math.round((ms / 60000) * 10) / 10;
}

function screenMsFromIdeEvent(raw: Record<string, unknown>): number {
  const ik = String(raw.interactionKind ?? raw.interaction_kind ?? "").toLowerCase();
  if (ik === "engagement_segment" || ik === "engagement") {
    const catRaw = raw.engagementCategory ?? raw.engagement_category;
    const cat = typeof catRaw === "string" ? catRaw.trim().toLowerCase() : "";
    const durRaw = raw.engagementDurationMs ?? raw.engagement_duration_ms ?? raw.duration_ms ?? raw.durationMs;
    const durMs = typeof durRaw === "number" && Number.isFinite(durRaw) ? Math.floor(durRaw) : 0;
    if ((cat === "drafting" || cat === "waiting" || cat === "reading_idle") && durMs >= 500) {
      return durMs;
    }
    return 0;
  }
  if (ik === "response_latency") {
    const hlRaw = raw.hostResponseLatencyMs ?? raw.host_response_latency_ms;
    const hlMs = typeof hlRaw === "number" && Number.isFinite(hlRaw) ? Math.floor(hlRaw) : 0;
    return hlMs > 0 ? hlMs : 0;
  }
  return 0;
}

async function getCompanyById(companyId: string): Promise<CompanyRecord> {
  const snap = await getFirebaseAdminDb().collection(COMPANIES_COLLECTION).doc(companyId).get();
  if (!snap.exists) throw new Error("Company not found");
  return readCompany(snap.id, (snap.data() || {}) as Record<string, unknown>);
}

function readMember(docId: string, raw: Record<string, unknown>): CompanyMember {
  return {
    user_id: String(raw.uid || docId),
    email: typeof raw.email === "string" ? raw.email : null,
    display_name: typeof raw.displayName === "string" ? raw.displayName : null,
    role: readRole(raw.companyRole),
    subscription_tier: typeof raw.subscriptionTier === "string" ? raw.subscriptionTier : typeof raw.plan === "string" ? raw.plan : "free"
  };
}

export async function listCompanies(): Promise<CompanyRecord[]> {
  const snap = await getFirebaseAdminDb().collection(COMPANIES_COLLECTION).orderBy("name", "asc").get();
  return snap.docs.map((doc) => readCompany(doc.id, (doc.data() || {}) as Record<string, unknown>));
}

export async function createCompany(input: { name: unknown; logo_url?: unknown }): Promise<CompanyRecord> {
  const db = getFirebaseAdminDb();
  const name = sanitizeCompanyName(input.name);
  const logoUrl = sanitizeLogoDataUrl(input.logo_url);
  const ref = db.collection(COMPANIES_COLLECTION).doc();
  await ref.set({
    name,
    logoUrl,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  const snap = await ref.get();
  return readCompany(ref.id, (snap.data() || {}) as Record<string, unknown>);
}

export async function updateCompany(
  companyId: string,
  input: { name?: unknown; logo_url?: unknown }
): Promise<CompanyRecord> {
  const id = String(companyId || "").trim();
  if (!id) throw new Error("Missing company id");
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (Object.prototype.hasOwnProperty.call(input, "name")) patch.name = sanitizeCompanyName(input.name);
  if (Object.prototype.hasOwnProperty.call(input, "logo_url")) patch.logoUrl = sanitizeLogoDataUrl(input.logo_url);
  const ref = getFirebaseAdminDb().collection(COMPANIES_COLLECTION).doc(id);
  await ref.set(patch, { merge: true });
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Company not found");
  return readCompany(ref.id, (snap.data() || {}) as Record<string, unknown>);
}

export async function listCompanyPendingInvites(companyId: string): Promise<CompanyPendingInvite[]> {
  const id = String(companyId || "").trim();
  if (!id) return [];
  const snap = await getFirebaseAdminDb()
    .collection(COMPANIES_COLLECTION)
    .doc(id)
    .collection(PENDING_INVITES_SUBCOLLECTION)
    .get();
  return snap.docs
    .map((doc) => {
      const raw = (doc.data() || {}) as Record<string, unknown>;
      return {
        email: typeof raw.email === "string" ? raw.email : doc.id,
        role: readRole(raw.role),
        created_at: timestampToIso(raw.createdAt)
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function getCompanyAdminDetail(companyId: string) {
  const company = await getCompanyById(companyId);
  const [members, pending_invites] = await Promise.all([
    listCompanyMembers(companyId),
    listCompanyPendingInvites(companyId)
  ]);
  return { company, members, pending_invites };
}

export async function listCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  const id = String(companyId || "").trim();
  if (!id) return [];
  const snap = await getFirebaseAdminDb().collection(USERS_COLLECTION).where("companyId", "==", id).get();
  return snap.docs
    .map((doc) => readMember(doc.id, (doc.data() || {}) as Record<string, unknown>))
    .sort((a, b) => (a.email || a.user_id).localeCompare(b.email || b.user_id));
}

export async function getAccountCompanyContext(uid: string): Promise<{
  company: CompanyRecord | null;
  membership: { role: CompanyRole; is_admin: boolean } | null;
}> {
  const db = getFirebaseAdminDb();
  const userSnap = await db.collection(USERS_COLLECTION).doc(String(uid || "").trim()).get();
  if (!userSnap.exists) return { company: null, membership: null };
  const raw = (userSnap.data() || {}) as Record<string, unknown>;
  const companyId = typeof raw.companyId === "string" ? raw.companyId.trim() : "";
  if (!companyId) return { company: null, membership: null };
  const companySnap = await db.collection(COMPANIES_COLLECTION).doc(companyId).get();
  const company = companySnap.exists
    ? readCompany(companySnap.id, (companySnap.data() || {}) as Record<string, unknown>)
    : {
        id: companyId,
        name: typeof raw.companyName === "string" && raw.companyName.trim() ? raw.companyName.trim() : "Company",
        logo_url: typeof raw.companyLogoUrl === "string" ? raw.companyLogoUrl : null,
        created_at: null,
        updated_at: null
      };
  const role = readRole(raw.companyRole);
  return { company, membership: { role, is_admin: role === "admin" } };
}

export async function adminUpdateUserCompanyMembership(
  userId: string,
  patch: { company_id?: unknown; company_role?: unknown }
) {
  const uid = String(userId || "").trim();
  if (!uid) throw new Error("Missing user id");
  const db = getFirebaseAdminDb();
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new Error("User not found");

  const companyId =
    Object.prototype.hasOwnProperty.call(patch, "company_id") && patch.company_id != null
      ? String(patch.company_id || "").trim()
      : null;
  const removeCompany =
    Object.prototype.hasOwnProperty.call(patch, "company_id") &&
    (patch.company_id === null || String(patch.company_id || "").trim() === "");
  const role = patch.company_role === "admin" ? "admin" : "member";

  if (removeCompany) {
    await userRef.set(
      {
        companyId: FieldValue.delete(),
        companyRole: FieldValue.delete(),
        companyName: FieldValue.delete(),
        companyLogoUrl: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    return { ok: true as const, user_id: uid, company: null, role: null };
  }

  if (!companyId) {
    await userRef.set({ companyRole: role, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const context = await getAccountCompanyContext(uid);
    return { ok: true as const, user_id: uid, company: context.company, role };
  }

  const companySnap = await db.collection(COMPANIES_COLLECTION).doc(companyId).get();
  if (!companySnap.exists) throw new Error("Company not found");
  const company = readCompany(companySnap.id, (companySnap.data() || {}) as Record<string, unknown>);
  await userRef.set(
    {
      companyId,
      companyRole: role,
      companyName: company.name,
      companyLogoUrl: company.logo_url,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  return { ok: true as const, user_id: uid, company, role };
}

export async function assignEmailToCompany(companyId: string, email: unknown, role: unknown) {
  const id = String(companyId || "").trim();
  if (!id) throw new Error("Missing company id");
  const normalized = normalizeInviteEmail(String(email || ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Invalid email address");
  }
  const companyRole: CompanyRole = role === "admin" ? "admin" : "member";
  const company = await getCompanyById(id);
  const db = getFirebaseAdminDb();

  const usersSnap = await db.collection(USERS_COLLECTION).where("email", "==", normalized).limit(8).get();
  const activeUser = usersSnap.docs.find((doc) => {
    const raw = (doc.data() || {}) as Record<string, unknown>;
    return !raw.duplicateDisabled && typeof raw.mergedIntoUid !== "string";
  });

  if (activeUser) {
    await adminUpdateUserCompanyMembership(activeUser.id, {
      company_id: id,
      company_role: companyRole
    });
    await removeCompanyPendingInvite(id, normalized);
    return {
      ok: true as const,
      assigned: "user" as const,
      user_id: activeUser.id,
      email: normalized,
      role: companyRole,
      company
    };
  }

  const inviteRef = db.collection(COMPANIES_COLLECTION).doc(id).collection(PENDING_INVITES_SUBCOLLECTION).doc(normalized);
  const globalRef = db.collection(COMPANY_EMAIL_INVITES_COLLECTION).doc(normalized);
  await db.runTransaction(async (tx) => {
    tx.set(inviteRef, {
      email: normalized,
      role: companyRole,
      companyId: id,
      createdAt: FieldValue.serverTimestamp()
    });
    tx.set(globalRef, {
      email: normalized,
      role: companyRole,
      companyId: id,
      companyName: company.name,
      companyLogoUrl: company.logo_url,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  return {
    ok: true as const,
    assigned: "pending" as const,
    email: normalized,
    role: companyRole,
    company
  };
}

export async function removeCompanyPendingInvite(companyId: string, email: string) {
  const id = String(companyId || "").trim();
  const normalized = normalizeInviteEmail(email);
  if (!id || !normalized) return;
  const db = getFirebaseAdminDb();
  await Promise.all([
    db.collection(COMPANIES_COLLECTION).doc(id).collection(PENDING_INVITES_SUBCOLLECTION).doc(normalized).delete(),
    db.collection(COMPANY_EMAIL_INVITES_COLLECTION).doc(normalized).delete()
  ]);
}

export async function removeUserFromCompany(userId: string) {
  return adminUpdateUserCompanyMembership(userId, { company_id: null, company_role: "member" });
}

export async function applyPendingCompanyInviteForUser(uid: string, email: string | null) {
  const normalized = email ? normalizeInviteEmail(email) : "";
  if (!normalized || !uid) return;

  const db = getFirebaseAdminDb();
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) return;
  const userRaw = (userSnap.data() || {}) as Record<string, unknown>;
  if (typeof userRaw.companyId === "string" && userRaw.companyId.trim()) return;

  const inviteSnap = await db.collection(COMPANY_EMAIL_INVITES_COLLECTION).doc(normalized).get();
  if (!inviteSnap.exists) return;
  const invite = (inviteSnap.data() || {}) as Record<string, unknown>;
  const companyId = String(invite.companyId || "").trim();
  if (!companyId) return;

  const role = readRole(invite.role);
  await adminUpdateUserCompanyMembership(uid, { company_id: companyId, company_role: role });
  await removeCompanyPendingInvite(companyId, normalized);
}

async function queryMemberScreenTimeByDay(
  memberIds: string[],
  startDay: string,
  endDay: string,
  daysList: string[]
) {
  const db = getFirebaseAdminDb();
  const memberScreenMs = new Map(memberIds.map((id) => [id, 0]));
  const timeline = daysList.map((day) => ({
    day,
    total_screen_time_minutes: 0,
    by_member: Object.fromEntries(memberIds.map((id) => [id, 0])) as Record<string, number>
  }));
  const timelineByDay = new Map(timeline.map((row) => [row.day, row]));

  await Promise.all(
    memberIds.map(async (uid) => {
      try {
        const snap = await db
          .collection(IDE_EVENTS_COLLECTION)
          .where("uid", "==", uid)
          .where("utcDay", ">=", startDay)
          .where("utcDay", "<=", endDay)
          .get();
        for (const doc of snap.docs) {
          const raw = (doc.data() || {}) as Record<string, unknown>;
          const utcDay = String(raw.utcDay || "").trim();
          if (!utcDay) continue;
          const ms = screenMsFromIdeEvent(raw);
          if (ms <= 0) continue;
          memberScreenMs.set(uid, (memberScreenMs.get(uid) || 0) + ms);
          const bucket = timelineByDay.get(utcDay);
          if (!bucket) continue;
          const minutes = msToStatMinutes(ms);
          bucket.by_member[uid] = (bucket.by_member[uid] || 0) + minutes;
          bucket.total_screen_time_minutes += minutes;
        }
      } catch {
        // Skip members whose IDE events cannot be queried.
      }
    })
  );

  return { timeline, memberScreenMs };
}

function recentUtcDays(days: number): string[] {
  const range = Math.max(1, Math.min(365, Math.floor(days || 30)));
  const out: string[] = [];
  const now = new Date();
  for (let i = range - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function memberLabel(member: CompanyMember): string {
  return member.display_name || member.email || member.user_id.slice(0, 8);
}

function planUsageSeriesKey(memberId: string, profile: VendorUsageProfileView): string {
  return `${memberId}__${profile.provider}__${profile.profile_id}`;
}

function planUsageSeriesLabel(memberLabel: string, profile: VendorUsageProfileView): string {
  const provider =
    profile.provider === "claude_code" ? "Claude" : profile.provider === "codex" ? "Codex" : "Cursor";
  const plan = profile.plan_display || "Plan";
  const email = profile.vendor_email ? ` · ${profile.vendor_email}` : "";
  return `${memberLabel} · ${provider} ${plan}${email}`;
}

function activeWindow(profile: VendorUsageProfileView) {
  return profile.secondary_window || profile.primary_window;
}

export async function getCompanyStatsForAdmin(uid: string, days: number) {
  const context = await getAccountCompanyContext(uid);
  if (!context.company || !context.membership?.is_admin) {
    throw new Error("Company admin access required");
  }

  const company = context.company;
  const members = await listCompanyMembers(company.id);
  const memberIds = new Set(members.map((member) => member.user_id));
  const rangeDays = Math.max(1, Math.min(365, Math.floor(days || 30)));
  const daysList = recentUtcDays(rangeDays);
  const startDay = daysList[0]!;
  const endDay = daysList[daysList.length - 1]!;
  const db = getFirebaseAdminDb();

  const usageSnap = await db
    .collection(DAILY_USAGE_COLLECTION)
    .where("day", ">=", startDay)
    .where("day", "<=", endDay)
    .get();

  const timeline = daysList.map((day) => ({
    day,
    total_prompts: 0,
    by_member: Object.fromEntries(
      members.map((member) => [
        member.user_id,
        { prompts: 0, auto: 0, manual: 0, generated: 0 }
      ])
    ) as Record<string, { prompts: number; auto: number; manual: number; generated: number }>
  }));
  const timelineByDay = new Map(timeline.map((row) => [row.day, row]));
  const memberTotals = new Map(
    members.map((member) => [
      member.user_id,
      { prompts: 0, auto: 0, manual: 0, generated: 0, plan_monthly_usd: 0, screen_time_minutes: 0 }
    ])
  );

  for (const doc of usageSnap.docs) {
    const raw = (doc.data() || {}) as Record<string, unknown>;
    const rowUid = String(raw.uid || "").trim();
    if (!memberIds.has(rowUid)) continue;
    const day = String(raw.day || "").trim();
    const bucket = timelineByDay.get(day);
    const member = memberTotals.get(rowUid);
    if (!bucket || !member) continue;
    const prompts = Math.max(0, Math.floor(Number(raw.promptsImproved || 0) || 0));
    const auto = Math.max(0, Math.floor(Number(raw.auto || 0) || 0));
    const manual = Math.max(0, Math.floor(Number(raw.manual || 0) || 0));
    const generated = Math.max(0, Math.floor(Number(raw.generated || 0) || 0));
    bucket.total_prompts += prompts;
    bucket.by_member[rowUid] = { prompts, auto, manual, generated };
    member.prompts += prompts;
    member.auto += auto;
    member.manual += manual;
    member.generated += generated;
  }

  const { timeline: screenTimeTimeline, memberScreenMs } = await queryMemberScreenTimeByDay(
    members.map((member) => member.user_id),
    startDay,
    endDay,
    daysList
  );
  for (const [uid, ms] of memberScreenMs.entries()) {
    const member = memberTotals.get(uid);
    if (member) member.screen_time_minutes = msToStatMinutes(ms);
  }

  const profilesByMember = await Promise.all(
    members.map(async (member) => ({
      member,
      profiles: await listVendorUsageProfiles(member.user_id).catch(() => [] as VendorUsageProfileView[])
    }))
  );

  const planUsagePoints = new Map<string, Record<string, number | string>>();
  const planUsageSeries: Array<{ key: string; label: string; member_id: string }> = [];
  const planUsageSeriesKeys = new Set<string>();
  const sparsePlanUsageBySeries = new Map<string, Map<string, number>>();
  const exactPlanUsageEndBySeries = new Map<string, { day: string; utilization: number }>();
  for (const { member, profiles } of profilesByMember) {
    const pricedProfiles = profiles.filter((profile) => profile.plan_monthly_usd != null);
    const totals = memberTotals.get(member.user_id);
    if (totals) {
      totals.plan_monthly_usd = pricedProfiles.reduce((sum, profile) => sum + (profile.plan_monthly_usd ?? 0), 0);
    }
    const label = memberLabel(member);
    for (const profile of profiles) {
      const window = activeWindow(profile);
      const history = profile.secondary_window ? profile.usage_history.secondary : profile.usage_history.primary;
      const points = history.length ? history : window ? [{ at_ms: profile.synced_at_ms, utilization: window.utilization }] : [];
      if (!points.length) continue;
      const seriesKey = planUsageSeriesKey(member.user_id, profile);
      if (!planUsageSeriesKeys.has(seriesKey)) {
        planUsageSeriesKeys.add(seriesKey);
        planUsageSeries.push({
          key: seriesKey,
          label: planUsageSeriesLabel(label, profile),
          member_id: member.user_id
        });
      }
      const sparse = sparsePlanUsageBySeries.get(seriesKey) || new Map<string, number>();
      for (const point of points) {
        if (!point.at_ms || point.at_ms < Date.now() - rangeDays * 86_400_000) continue;
        const key = new Date(point.at_ms).toISOString().slice(0, 10);
        sparse.set(key, Math.max(0, Math.min(150, Math.round(normalizeUtilizationPercent(Number(point.utilization || 0))))));
      }
      sparsePlanUsageBySeries.set(seriesKey, sparse);
      if (window) {
        exactPlanUsageEndBySeries.set(seriesKey, {
          day: endDay,
          utilization: normalizeUtilizationPercent(window.utilization)
        });
      }
    }
  }

  for (const series of planUsageSeries) {
    const filled = interpolateDailyUtilizationMap(sparsePlanUsageBySeries.get(series.key) || new Map(), daysList, {
      anchorStartDay: startDay,
      anchorStartUtil: 0,
      exactEndDay: exactPlanUsageEndBySeries.get(series.key)?.day,
      exactEndUtil: exactPlanUsageEndBySeries.get(series.key)?.utilization ?? null
    });
    for (const day of daysList) {
      const value = filled.get(day);
      if (value == null) continue;
      const row = planUsagePoints.get(day) || { day };
      row[series.key] = Math.max(0, Math.min(150, Math.round(value)));
      planUsagePoints.set(day, row);
    }
  }

  const totals = [...memberTotals.values()].reduce(
    (acc, row) => {
      acc.prompts += row.prompts;
      acc.auto += row.auto;
      acc.manual += row.manual;
      acc.generated += row.generated;
      acc.plan_monthly_usd += row.plan_monthly_usd;
      acc.screen_time_minutes += row.screen_time_minutes;
      return acc;
    },
    { prompts: 0, auto: 0, manual: 0, generated: 0, plan_monthly_usd: 0, screen_time_minutes: 0 }
  );

  return {
    ok: true as const,
    range_days: rangeDays,
    company,
    viewer_role: context.membership.role,
    members: members.map((member) => ({
      ...member,
      label: memberLabel(member),
      totals: memberTotals.get(member.user_id) || {
        prompts: 0,
        auto: 0,
        manual: 0,
        generated: 0,
        plan_monthly_usd: 0,
        screen_time_minutes: 0
      }
    })),
    totals,
    timeline,
    screen_time_timeline: screenTimeTimeline,
    plan_usage_timeline: [...planUsagePoints.values()].sort((a, b) =>
      String(a.day).localeCompare(String(b.day))
    ),
    plan_usage_series: planUsageSeries.sort((a, b) => a.label.localeCompare(b.label)),
    subscription_profiles: profilesByMember.flatMap(({ member, profiles }) =>
      profiles.map((profile) => ({
        member_id: member.user_id,
        member_label: memberLabel(member),
        provider: profile.provider,
        profile_id: profile.profile_id,
        plan_display: profile.plan_display,
        plan_monthly_usd: profile.plan_monthly_usd,
        primary_window: profile.primary_window,
        secondary_window: profile.secondary_window,
        synced_at_ms: profile.synced_at_ms
      }))
    )
  };
}
