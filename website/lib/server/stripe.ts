import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

const ENTERPRISE_PRICE_ID = "price_1TbGQtE1kSqm5DoEzuLyhaz6";
const PRO_PRICE_ID = "price_1TdR2QE1kSqm5DoEqQGEdSMh";
const STUDENT_PRICE_ID = "price_1TdQyCE1kSqm5DoEwAxzcAiY";

export function getStripe(): Stripe {
  if (!stripeSingleton) {
    const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeSingleton = new Stripe(key, { typescript: true });
  }
  return stripeSingleton;
}

export function isStripeConfigured(): boolean {
  return Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim());
}

export function isStripeCheckoutAvailableForTier(tier: string): boolean {
  if (!isStripeConfigured()) return false;
  return Boolean(getStripePriceIdForTier(tier));
}

/** Paid plans above Free — stored in Firestore subscriptionTier. */
export type PaidTier = "pro" | "student" | "enterprise";

export function getStripePriceIdForTier(tier: string): string | null {
  const t = tier.toLowerCase();
  if (t === "pro" || t === "plus" || t === "professional") {
    const id = String(process.env.STRIPE_PRICE_ID_PRO || "").trim();
    return id || PRO_PRICE_ID;
  }
  if (t === "student") {
    const id = String(process.env.STRIPE_PRICE_ID_STUDENT || "").trim();
    return id || STUDENT_PRICE_ID;
  }
  if (t === "enterprise") {
    return ENTERPRISE_PRICE_ID;
  }
  return null;
}

export function normalizePaidTier(tier: string): PaidTier | null {
  const t = tier.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (t === "pro" || t === "promptly_pro") return "pro";
  if (t === "student" || t === "promptly_student") return "student";
  if (t === "enterprise" || t === "promptly_enterprise") return "enterprise";
  if (t === "plus" || t === "professional") return "pro";
  return null;
}

function parsePositiveIntEnv(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const intValue = Math.floor(value);
  if (intValue < 1) return null;
  return intValue;
}

export function getStripeTrialDaysForTier(tier: PaidTier): number | null {
  const perTierRaw =
    tier === "pro"
      ? String(process.env.STRIPE_TRIAL_DAYS_PRO || "").trim()
      : tier === "student"
        ? String(process.env.STRIPE_TRIAL_DAYS_STUDENT || "").trim()
        : String(process.env.STRIPE_TRIAL_DAYS_ENTERPRISE || "").trim();
  const globalRaw = String(process.env.STRIPE_TRIAL_DAYS || "").trim();
  const parsedPerTier = perTierRaw ? parsePositiveIntEnv(perTierRaw) : null;
  const parsedGlobal = globalRaw ? parsePositiveIntEnv(globalRaw) : null;
  return parsedPerTier ?? parsedGlobal ?? null;
}

export function getStripeAllowPromotionCodes(): boolean {
  const raw = String(process.env.STRIPE_ALLOW_PROMO_CODES || "true")
    .trim()
    .toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
}

export type StripeCheckoutDiscountItem = { promotion_code: string } | { coupon: string };

/**
 * Stripe Checkout accepts either a promotion code ID (promo_...) or a coupon ID (e.g. CI9wdF2Y).
 * Admins often copy the coupon ID from Product catalogue → Coupons — that uses the coupon field.
 */
export function stripeCheckoutDiscountItem(
  stripeDiscountRef: string | null | undefined
): StripeCheckoutDiscountItem | null {
  const value = String(stripeDiscountRef || "").trim();
  if (!value) return null;
  if (value.startsWith("promo_")) {
    return { promotion_code: value };
  }
  return { coupon: value };
}

export function formatStripeCheckoutError(message: string): string {
  const text = String(message || "");
  if (/no such promotion code/i.test(text)) {
    return "That Stripe discount ID is not a promotion code (promo_…). Paste the coupon ID from the coupon page (e.g. CI9wdF2Y), or create a promotion code and use promo_….";
  }
  if (/no such coupon/i.test(text)) {
    return "Stripe could not find that coupon ID. Copy the ID from Product catalogue → Coupons → your coupon → Details.";
  }
  return text;
}

export function getOriginFromRequest(request: Request): string {
  const env = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (env) return env;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
