import { FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { adminCreateSalesLink, adminListSalesLinksForTeam, type SalesLinkRecord } from "@/lib/server/salesLinks";
import { ensureSalesTeamStripeCoupons, getSalesTeamCouponId } from "@/lib/server/stripeDiscountCatalog";
import {
  countSalesTeamLinks,
  SALES_TEAM_JOIN_OFFER_TITLE,
  SALES_TEAM_OFFER_SPECS,
  SALES_TEAM_TIERS,
  salesTeamLinkSlug,
  salesTeamOfferLabel
} from "@/lib/server/salesTeamOfferMatrix";
const COLLECTION = "promptly_sales_team";
const LINKS_COLLECTION = "promptly_sales_links";

export type SalesTeamRecord = {
  id: string;
  name: string;
  slug: string;
  internalNote: string | null;
  active: boolean;
  signupCount: number;
  linkCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

function slugifyBase(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function generateTeamSlug(name: string, preferred?: string): string {
  const custom = slugifyBase(preferred || "");
  if (custom.length >= 3) return custom;
  const base = slugifyBase(name) || "rep";
  return `${base}-${randomBytes(2).toString("hex")}`;
}

async function teamSlugExists(slug: string, excludeId?: string): Promise<boolean> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTION).where("slug", "==", slug).limit(2).get();
  return snap.docs.some((doc) => doc.id !== excludeId);
}

async function salesLinkSlugExists(slug: string): Promise<boolean> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(LINKS_COLLECTION).where("slug", "==", slug).limit(1).get();
  return !snap.empty;
}

function docToTeam(id: string, data: FirebaseFirestore.DocumentData | undefined): SalesTeamRecord | null {
  if (!data) return null;
  const slug = String(data.slug || "").trim();
  const name = String(data.name || "").trim();
  if (!slug || !name) return null;
  return {
    id,
    name,
    slug,
    internalNote:
      typeof data.internalNote === "string" && data.internalNote.trim() ? data.internalNote.trim() : null,
    active: data.active !== false,
    signupCount: Math.max(0, Number(data.signupCount || 0)),
    linkCount: Math.max(0, Number(data.linkCount || 0)),
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null
  };
}

export async function adminListSalesTeam(): Promise<{ ok: true; teams: SalesTeamRecord[] }> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
  const teams = snap.docs
    .map((doc) => docToTeam(doc.id, doc.data()))
    .filter((item): item is SalesTeamRecord => Boolean(item));
  return { ok: true, teams };
}

export async function adminGetSalesTeam(id: string): Promise<SalesTeamRecord | null> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTION).doc(String(id || "").trim()).get();
  return docToTeam(snap.id, snap.data());
}

export type CreateSalesTeamInput = {
  name: string;
  slug?: string | null;
  internalNote?: string | null;
};

export async function adminCreateSalesTeam(
  input: CreateSalesTeamInput
): Promise<{ ok: true; team: SalesTeamRecord; links: SalesLinkRecord[] }> {
  const name = String(input.name || "").trim();
  if (!name) {
    throw new Error("Salesperson name is required.");
  }

  let slug = generateTeamSlug(name, input.slug || undefined).toLowerCase();
  if (await teamSlugExists(slug)) {
    slug = generateTeamSlug(name);
  }
  if (await teamSlugExists(slug)) {
    throw new Error("Could not generate a unique slug. Try a custom slug.");
  }

  const coupons = await ensureSalesTeamStripeCoupons();
  const db = getFirebaseAdminDb();
  const teamRef = db.collection(COLLECTION).doc();
  const internalNote =
    typeof input.internalNote === "string" && input.internalNote.trim() ? input.internalNote.trim() : null;

  await teamRef.set({
    name,
    slug,
    internalNote,
    active: true,
    signupCount: 0,
    linkCount: countSalesTeamLinks(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  const links: SalesLinkRecord[] = [];
  const genericTitle = SALES_TEAM_JOIN_OFFER_TITLE;
  const genericDescription = "Subscribe to Promptly with the offer from your sales link.";

  for (const tier of SALES_TEAM_TIERS) {
    for (const spec of SALES_TEAM_OFFER_SPECS) {
      const linkSlug = salesTeamLinkSlug(slug, tier, spec.offerKey);
      if (await salesLinkSlugExists(linkSlug)) {
        throw new Error(`Link slug already exists: ${linkSlug}`);
      }

      const offerLabel = salesTeamOfferLabel(tier, spec);
      let stripePromotionCodeId: string | null = null;
      let stripePromotionCodeLabel: string | null = null;
      let offerFreeTrial = false;
      let trialDays: number | null = null;

      if (spec.kind === "trial") {
        offerFreeTrial = true;
        trialDays = spec.trialDays ?? 7;
      } else {
        const couponId = coupons[spec.catalogKey] || (await getSalesTeamCouponId(spec.catalogKey));
        if (!couponId) {
          throw new Error(`Missing Stripe coupon for offer ${spec.catalogKey}. Try again.`);
        }
        stripePromotionCodeId = couponId;
        stripePromotionCodeLabel = spec.catalogKey;
      }

      const { link } = await adminCreateSalesLink({
        recipientName: "",
        tier,
        offerTitle: genericTitle,
        offerDescription: genericDescription,
        stripePromotionCodeId,
        stripePromotionCodeLabel,
        offerFreeTrial,
        trialDays,
        skipPaymentMethod: false,
        internalNote: internalNote,
        slug: linkSlug,
        active: true,
        salesTeamId: teamRef.id,
        offerKey: spec.offerKey,
        offerLabel
      });
      links.push(link);
    }
  }

  const teamSnap = await teamRef.get();
  const team = docToTeam(teamSnap.id, teamSnap.data());
  if (!team) {
    throw new Error("Failed to read created sales team.");
  }

  return { ok: true, team, links };
}

export async function adminSetSalesTeamActive(
  id: string,
  active: boolean
): Promise<{ ok: true; team: SalesTeamRecord }> {
  const cleanId = String(id || "").trim();
  if (!cleanId) throw new Error("Missing sales team id.");

  const db = getFirebaseAdminDb();
  const teamRef = db.collection(COLLECTION).doc(cleanId);
  const existing = await teamRef.get();
  if (!existing.exists) throw new Error("Sales team not found.");

  await teamRef.set({ active, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  const linksSnap = await db.collection(LINKS_COLLECTION).where("salesTeamId", "==", cleanId).get();
  const batch = db.batch();
  for (const doc of linksSnap.docs) {
    batch.set(doc.ref, { active, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (!linksSnap.empty) {
    await batch.commit();
  }

  const saved = await teamRef.get();
  const team = docToTeam(saved.id, saved.data());
  if (!team) throw new Error("Failed to read updated sales team.");
  return { ok: true, team };
}

export async function adminDeleteSalesTeam(id: string): Promise<{ ok: true }> {
  const cleanId = String(id || "").trim();
  if (!cleanId) throw new Error("Missing sales team id.");

  const db = getFirebaseAdminDb();
  const teamRef = db.collection(COLLECTION).doc(cleanId);
  const existing = await teamRef.get();
  if (!existing.exists) throw new Error("Sales team not found.");

  const linksSnap = await db.collection(LINKS_COLLECTION).where("salesTeamId", "==", cleanId).get();
  const batch = db.batch();
  for (const doc of linksSnap.docs) {
    batch.delete(doc.ref);
  }
  batch.delete(teamRef);
  await batch.commit();
  return { ok: true };
}

export async function adminGetSalesTeamWithLinks(id: string): Promise<{
  ok: true;
  team: SalesTeamRecord;
  links: SalesLinkRecord[];
}> {
  const team = await adminGetSalesTeam(id);
  if (!team) throw new Error("Sales team not found.");
  const { links } = await adminListSalesLinksForTeam(id);
  return { ok: true, team, links };
}

export async function incrementSalesTeamSignupCount(salesTeamId: string): Promise<void> {
  const cleanId = String(salesTeamId || "").trim();
  if (!cleanId) return;
  const db = getFirebaseAdminDb();
  await db
    .collection(COLLECTION)
    .doc(cleanId)
    .set(
      {
        signupCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
}
