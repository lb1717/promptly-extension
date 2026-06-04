import { FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { isSalesTeamJoinLink, SALES_TEAM_JOIN_OFFER_TITLE } from "@/lib/salesTeamOffers";
import { normalizePaidTier, type PaidTier } from "@/lib/server/stripe";

const COLLECTION = "promptly_sales_links";

export type SalesLinkTier = PaidTier;

export type SalesLinkRecord = {
  id: string;
  slug: string;
  recipientName: string;
  tier: SalesLinkTier;
  offerTitle: string;
  offerDescription: string;
  stripePromotionCodeId: string | null;
  stripePromotionCodeLabel: string | null;
  offerFreeTrial: boolean;
  trialDays: number | null;
  skipPaymentMethod: boolean;
  internalNote: string | null;
  salesTeamId: string | null;
  offerKey: string | null;
  offerLabel: string | null;
  active: boolean;
  signupCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PublicSalesLink = {
  slug: string;
  recipientName: string;
  tier: SalesLinkTier;
  offerTitle: string;
  offerDescription: string;
  salesTeamLink: boolean;
};

function slugifyBase(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function generateSlug(recipientName: string, preferred?: string): string {
  const custom = slugifyBase(preferred || "");
  if (custom.length >= 3) {
    return custom;
  }
  const base = slugifyBase(recipientName) || "invite";
  const suffix = randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

function parseTrialDays(raw: unknown, offerFreeTrial: boolean): number | null {
  if (!offerFreeTrial) return null;
  if (raw == null || raw === "") return 7;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error("Trial days must be a positive number.");
  }
  const days = Math.floor(value);
  if (days < 1 || days > 365) {
    throw new Error("Trial days must be between 1 and 365.");
  }
  return days;
}

function docToRecord(id: string, data: FirebaseFirestore.DocumentData | undefined): SalesLinkRecord | null {
  if (!data) return null;
  const tier = normalizePaidTier(String(data.tier || ""));
  if (!tier) return null;
  const slug = String(data.slug || id).trim();
  if (!slug) return null;
  return {
    id,
    slug,
    recipientName: String(data.recipientName || "").trim(),
    tier,
    offerTitle: String(data.offerTitle || "").trim(),
    offerDescription: String(data.offerDescription || "").trim(),
    stripePromotionCodeId:
      typeof data.stripePromotionCodeId === "string" && data.stripePromotionCodeId.trim()
        ? data.stripePromotionCodeId.trim()
        : null,
    stripePromotionCodeLabel:
      typeof data.stripePromotionCodeLabel === "string" && data.stripePromotionCodeLabel.trim()
        ? data.stripePromotionCodeLabel.trim()
        : null,
    offerFreeTrial: data.offerFreeTrial === true,
    trialDays:
      data.offerFreeTrial === true && typeof data.trialDays === "number" && data.trialDays > 0
        ? Math.floor(data.trialDays)
        : data.offerFreeTrial === true
          ? 7
          : null,
    skipPaymentMethod: data.skipPaymentMethod === true,
    internalNote:
      typeof data.internalNote === "string" && data.internalNote.trim() ? data.internalNote.trim() : null,
    salesTeamId:
      typeof data.salesTeamId === "string" && data.salesTeamId.trim() ? data.salesTeamId.trim() : null,
    offerKey: typeof data.offerKey === "string" && data.offerKey.trim() ? data.offerKey.trim() : null,
    offerLabel:
      typeof data.offerLabel === "string" && data.offerLabel.trim() ? data.offerLabel.trim() : null,
    active: data.active !== false,
    signupCount: Math.max(0, Number(data.signupCount || 0)),
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null
  };
}

function toPublicRecord(record: SalesLinkRecord): PublicSalesLink {
  const salesTeamLink = isSalesTeamJoinLink({
    salesTeamId: record.salesTeamId,
    offerKey: record.offerKey,
    offerTitle: record.offerTitle
  });
  return {
    slug: record.slug,
    recipientName: salesTeamLink ? "" : record.recipientName,
    tier: record.tier,
    offerTitle: record.offerTitle,
    offerDescription: record.offerDescription,
    salesTeamLink
  };
}

async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTION).where("slug", "==", slug).limit(2).get();
  return snap.docs.some((doc) => doc.id !== excludeId);
}

export async function adminListSalesLinks(options?: {
  excludeSalesTeam?: boolean;
}): Promise<{ ok: true; links: SalesLinkRecord[] }> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
  const links = snap.docs
    .map((doc) => docToRecord(doc.id, doc.data()))
    .filter((item): item is SalesLinkRecord => Boolean(item))
    .filter((item) => (options?.excludeSalesTeam ? !item.salesTeamId : true));
  return { ok: true, links };
}

export async function adminListSalesLinksForTeam(
  salesTeamId: string
): Promise<{ ok: true; links: SalesLinkRecord[] }> {
  const cleanId = String(salesTeamId || "").trim();
  if (!cleanId) {
    return { ok: true, links: [] };
  }
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTION).where("salesTeamId", "==", cleanId).get();
  const links = snap.docs
    .map((doc) => docToRecord(doc.id, doc.data()))
    .filter((item): item is SalesLinkRecord => Boolean(item))
  return { ok: true, links };
}

async function isSalesTeamActive(salesTeamId: string): Promise<boolean> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection("promptly_sales_team").doc(salesTeamId).get();
  if (!snap.exists) return false;
  return snap.data()?.active !== false;
}

export async function getActiveSalesLinkBySlug(slug: string): Promise<SalesLinkRecord | null> {
  const clean = String(slug || "").trim().toLowerCase();
  if (!clean) return null;
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTION).where("slug", "==", clean).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  const record = docToRecord(doc.id, doc.data());
  if (!record || !record.active) return null;
  if (record.salesTeamId) {
    const teamOk = await isSalesTeamActive(record.salesTeamId);
    if (!teamOk) return null;
  }
  return record;
}

export async function getPublicSalesLinkBySlug(slug: string): Promise<PublicSalesLink | null> {
  const record = await getActiveSalesLinkBySlug(slug);
  return record ? toPublicRecord(record) : null;
}

export type CreateSalesLinkInput = {
  recipientName: string;
  tier: string;
  offerTitle: string;
  offerDescription: string;
  stripePromotionCodeId?: string | null;
  stripePromotionCodeLabel?: string | null;
  offerFreeTrial?: boolean;
  trialDays?: number | null;
  skipPaymentMethod?: boolean;
  internalNote?: string | null;
  slug?: string | null;
  active?: boolean;
  salesTeamId?: string | null;
  offerKey?: string | null;
  offerLabel?: string | null;
};

export async function adminCreateSalesLink(input: CreateSalesLinkInput): Promise<{ ok: true; link: SalesLinkRecord }> {
  const recipientName = String(input.recipientName || "").trim();
  const offerTitle = String(input.offerTitle || "").trim();
  const offerDescription = String(input.offerDescription || "").trim();
  const tier = normalizePaidTier(String(input.tier || ""));
  if (!offerTitle) {
    throw new Error("Offer headline is required.");
  }
  if (!offerDescription) {
    throw new Error("Offer description is required.");
  }
  if (!tier) {
    throw new Error('Plan tier must be "pro", "student", or "enterprise".');
  }

  let slug = generateSlug(recipientName, input.slug || undefined).toLowerCase();
  if (await slugExists(slug)) {
    slug = generateSlug(recipientName);
  }
  if (await slugExists(slug)) {
    throw new Error("Could not generate a unique link slug. Try a custom slug.");
  }

  const promoId =
    typeof input.stripePromotionCodeId === "string" && input.stripePromotionCodeId.trim()
      ? input.stripePromotionCodeId.trim()
      : null;
  const promoLabel =
    typeof input.stripePromotionCodeLabel === "string" && input.stripePromotionCodeLabel.trim()
      ? input.stripePromotionCodeLabel.trim()
      : null;
  const internalNote =
    typeof input.internalNote === "string" && input.internalNote.trim() ? input.internalNote.trim() : null;
  const offerFreeTrial = input.offerFreeTrial === true;
  const trialDays = parseTrialDays(input.trialDays, offerFreeTrial);
  const skipPaymentMethod = input.skipPaymentMethod === true;

  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTION).doc();
  const salesTeamId =
    typeof input.salesTeamId === "string" && input.salesTeamId.trim() ? input.salesTeamId.trim() : null;
  const offerKey = typeof input.offerKey === "string" && input.offerKey.trim() ? input.offerKey.trim() : null;
  const offerLabel =
    typeof input.offerLabel === "string" && input.offerLabel.trim() ? input.offerLabel.trim() : null;

  const payload = {
    slug,
    recipientName,
    tier,
    offerTitle,
    offerDescription,
    stripePromotionCodeId: promoId,
    stripePromotionCodeLabel: promoLabel,
    offerFreeTrial,
    trialDays,
    skipPaymentMethod,
    internalNote,
    salesTeamId,
    offerKey,
    offerLabel,
    active: input.active !== false,
    signupCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  await ref.set(payload);
  const saved = await ref.get();
  const link = docToRecord(saved.id, saved.data());
  if (!link) {
    throw new Error("Failed to read saved sales link.");
  }
  return { ok: true, link };
}

export type UpdateSalesLinkInput = Partial<{
  recipientName: string;
  tier: string;
  offerTitle: string;
  offerDescription: string;
  stripePromotionCodeId: string | null;
  stripePromotionCodeLabel: string | null;
  offerFreeTrial: boolean;
  trialDays: number | null;
  skipPaymentMethod: boolean;
  internalNote: string | null;
  active: boolean;
}>;

export async function adminUpdateSalesLink(
  id: string,
  patch: UpdateSalesLinkInput
): Promise<{ ok: true; link: SalesLinkRecord }> {
  const cleanId = String(id || "").trim();
  if (!cleanId) {
    throw new Error("Missing sales link id.");
  }
  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTION).doc(cleanId);
  const existing = await ref.get();
  if (!existing.exists) {
    throw new Error("Sales link not found.");
  }

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (typeof patch.recipientName === "string") {
    update.recipientName = patch.recipientName.trim();
  }
  if (typeof patch.offerTitle === "string") {
    const title = patch.offerTitle.trim();
    if (!title) throw new Error("Offer headline cannot be empty.");
    update.offerTitle = title;
  }
  if (typeof patch.offerDescription === "string") {
    const desc = patch.offerDescription.trim();
    if (!desc) throw new Error("Offer description cannot be empty.");
    update.offerDescription = desc;
  }
  if (typeof patch.tier === "string") {
    const tier = normalizePaidTier(patch.tier);
    if (!tier) throw new Error('Plan tier must be "pro", "student", or "enterprise".');
    update.tier = tier;
  }
  if (patch.stripePromotionCodeId !== undefined) {
    update.stripePromotionCodeId =
      typeof patch.stripePromotionCodeId === "string" && patch.stripePromotionCodeId.trim()
        ? patch.stripePromotionCodeId.trim()
        : null;
  }
  if (patch.stripePromotionCodeLabel !== undefined) {
    update.stripePromotionCodeLabel =
      typeof patch.stripePromotionCodeLabel === "string" && patch.stripePromotionCodeLabel.trim()
        ? patch.stripePromotionCodeLabel.trim()
        : null;
  }
  if (typeof patch.offerFreeTrial === "boolean") {
    update.offerFreeTrial = patch.offerFreeTrial;
    if (!patch.offerFreeTrial) {
      update.trialDays = null;
    } else if (patch.trialDays !== undefined) {
      update.trialDays = parseTrialDays(patch.trialDays, true);
    } else if (existing.data()?.offerFreeTrial !== true) {
      update.trialDays = 7;
    }
  } else if (patch.trialDays !== undefined && existing.data()?.offerFreeTrial === true) {
    update.trialDays = parseTrialDays(patch.trialDays, true);
  }
  if (typeof patch.skipPaymentMethod === "boolean") {
    update.skipPaymentMethod = patch.skipPaymentMethod;
  }
  if (patch.internalNote !== undefined) {
    update.internalNote =
      typeof patch.internalNote === "string" && patch.internalNote.trim() ? patch.internalNote.trim() : null;
  }
  if (typeof patch.active === "boolean") {
    update.active = patch.active;
  }

  await ref.set(update, { merge: true });
  const saved = await ref.get();
  const link = docToRecord(saved.id, saved.data());
  if (!link) {
    throw new Error("Failed to read updated sales link.");
  }
  return { ok: true, link };
}

export async function adminDeleteSalesLink(id: string): Promise<{ ok: true }> {
  const cleanId = String(id || "").trim();
  if (!cleanId) {
    throw new Error("Missing sales link id.");
  }
  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTION).doc(cleanId);
  const existing = await ref.get();
  if (!existing.exists) {
    throw new Error("Sales link not found.");
  }
  await ref.delete();
  return { ok: true };
}

export async function incrementSalesLinkSignupCount(slug: string): Promise<void> {
  const clean = String(slug || "").trim().toLowerCase();
  if (!clean) return;
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTION).where("slug", "==", clean).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return;
  const record = docToRecord(doc.id, doc.data());
  if (!record) return;

  await doc.ref.set(
    {
      signupCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  if (record.salesTeamId) {
    const { incrementSalesTeamSignupCount } = await import("@/lib/server/salesTeam");
    await incrementSalesTeamSignupCount(record.salesTeamId).catch((err) => {
      console.error("sales team signup count increment failed", err);
    });
  }
}
