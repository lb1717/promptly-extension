import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { listVendorUsageProfiles, type VendorUsageProfileView } from "@/lib/server/vendorUsage";

const COMPANIES_COLLECTION = "companies";
const USERS_COLLECTION = "users";
const DAILY_USAGE_COLLECTION = "promptly_usage_daily";
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
    total_tokens: 0,
    by_member: Object.fromEntries(
      members.map((member) => [
        member.user_id,
        { prompts: 0, tokens: 0, auto: 0, manual: 0, generated: 0 }
      ])
    ) as Record<string, { prompts: number; tokens: number; auto: number; manual: number; generated: number }>
  }));
  const timelineByDay = new Map(timeline.map((row) => [row.day, row]));
  const memberTotals = new Map(
    members.map((member) => [
      member.user_id,
      { prompts: 0, tokens: 0, auto: 0, manual: 0, generated: 0, plan_monthly_usd: 0 }
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
    const tokens = Math.max(0, Math.floor(Number(raw.used || 0) || 0));
    const auto = Math.max(0, Math.floor(Number(raw.auto || 0) || 0));
    const manual = Math.max(0, Math.floor(Number(raw.manual || 0) || 0));
    const generated = Math.max(0, Math.floor(Number(raw.generated || 0) || 0));
    bucket.total_prompts += prompts;
    bucket.total_tokens += tokens;
    bucket.by_member[rowUid] = { prompts, tokens, auto, manual, generated };
    member.prompts += prompts;
    member.tokens += tokens;
    member.auto += auto;
    member.manual += manual;
    member.generated += generated;
  }

  const profilesByMember = await Promise.all(
    members.map(async (member) => ({
      member,
      profiles: await listVendorUsageProfiles(member.user_id).catch(() => [] as VendorUsageProfileView[])
    }))
  );

  const planUsagePoints = new Map<string, Record<string, number | string>>();
  for (const { member, profiles } of profilesByMember) {
    const pricedProfiles = profiles.filter((profile) => profile.plan_monthly_usd != null);
    const totals = memberTotals.get(member.user_id);
    if (totals) {
      totals.plan_monthly_usd = pricedProfiles.reduce((sum, profile) => sum + (profile.plan_monthly_usd ?? 0), 0);
    }
    for (const profile of profiles) {
      const window = activeWindow(profile);
      const history = profile.secondary_window ? profile.usage_history.secondary : profile.usage_history.primary;
      const points = history.length ? history : window ? [{ at_ms: profile.synced_at_ms, utilization: window.utilization }] : [];
      for (const point of points) {
        if (!point.at_ms || point.at_ms < Date.now() - rangeDays * 86_400_000) continue;
        const key = new Date(point.at_ms).toISOString().slice(0, 10);
        const row = planUsagePoints.get(key) || { day: key };
        row[member.user_id] = Math.max(0, Math.min(150, Math.round(Number(point.utilization || 0))));
        planUsagePoints.set(key, row);
      }
    }
  }

  const totals = [...memberTotals.values()].reduce(
    (acc, row) => {
      acc.prompts += row.prompts;
      acc.tokens += row.tokens;
      acc.auto += row.auto;
      acc.manual += row.manual;
      acc.generated += row.generated;
      acc.plan_monthly_usd += row.plan_monthly_usd;
      return acc;
    },
    { prompts: 0, tokens: 0, auto: 0, manual: 0, generated: 0, plan_monthly_usd: 0 }
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
        tokens: 0,
        auto: 0,
        manual: 0,
        generated: 0,
        plan_monthly_usd: 0
      }
    })),
    totals,
    timeline,
    plan_usage_timeline: [...planUsagePoints.values()].sort((a, b) =>
      String(a.day).localeCompare(String(b.day))
    ),
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
