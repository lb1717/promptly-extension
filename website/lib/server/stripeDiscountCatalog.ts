import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { getStripe, isStripeConfigured } from "@/lib/server/stripe";
import { SALES_TEAM_OFFER_SPECS } from "@/lib/server/salesTeamOfferMatrix";

const COLLECTION = "promptly_stripe_discount_catalog";
const DOC_ID = "sales_team_master";

type CatalogDoc = {
  coupons: Record<string, string>;
  bootstrappedAt?: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
};

export async function ensureSalesTeamStripeCoupons(): Promise<Record<string, string>> {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY before creating sales team links.");
  }

  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTION).doc(DOC_ID);
  const existing = await ref.get();
  const data = existing.data() as CatalogDoc | undefined;
  const existingCoupons = data?.coupons && typeof data.coupons === "object" ? data.coupons : {};

  const percentSpecs = SALES_TEAM_OFFER_SPECS.filter((s) => s.kind !== "trial");
  const neededKeys = percentSpecs.map((s) => s.catalogKey);
  const missing = neededKeys.filter((key) => !existingCoupons[key]?.trim());
  if (missing.length === 0) {
    return existingCoupons;
  }

  const stripe = getStripe();
  const coupons: Record<string, string> = { ...existingCoupons };

  for (const spec of percentSpecs) {
    if (coupons[spec.catalogKey]?.trim()) continue;
    const percentOff = spec.percentOff ?? 0;
    const months = spec.months ?? 1;
    const created = await stripe.coupons.create({
      percent_off: percentOff,
      duration: "repeating",
      duration_in_months: months,
      name: `Promptly ${percentOff}% off ${months}mo`,
      metadata: {
        promptlyCatalogKey: spec.catalogKey,
        promptlyOfferKind: spec.kind
      }
    });
    coupons[spec.catalogKey] = created.id;
  }

  await ref.set(
    {
      coupons,
      bootstrappedAt: existing.exists ? data?.bootstrappedAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return coupons;
}

export async function getSalesTeamCouponId(catalogKey: string): Promise<string | null> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  const data = snap.data() as CatalogDoc | undefined;
  const id = data?.coupons?.[catalogKey];
  return typeof id === "string" && id.trim() ? id.trim() : null;
}
