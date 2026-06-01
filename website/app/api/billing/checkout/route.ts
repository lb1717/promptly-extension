import { NextResponse } from "next/server";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";
import { getActiveSalesLinkBySlug } from "@/lib/server/salesLinks";
import {
  formatStripeCheckoutError,
  getStripeAllowPromotionCodes,
  getOriginFromRequest,
  getStripe,
  getStripePriceIdForTier,
  getStripeTrialDaysForTier,
  isStripeConfigured,
  normalizePaidTier,
  stripeCheckoutDiscountItem,
  type PaidTier
} from "@/lib/server/stripe";

export const runtime = "nodejs";

type Body = { tier?: string; salesLinkSlug?: string; onboarding?: boolean };

export async function POST(request: Request) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
    }
    const { user } = await requireWebFirebaseUser(request);
    let body: Body = {};
    try {
      body = (await request.json()) as Body;
    } catch {
      body = {};
    }
    const salesLinkSlug = String(body.salesLinkSlug || "").trim().toLowerCase();
    const salesLink = salesLinkSlug ? await getActiveSalesLinkBySlug(salesLinkSlug) : null;
    if (salesLinkSlug && !salesLink) {
      return NextResponse.json({ error: "This invite link is invalid or no longer active." }, { status: 400 });
    }

    let paidTier: PaidTier | null = salesLink?.tier ?? normalizePaidTier(String(body.tier || "pro"));
    if (!paidTier) {
      return NextResponse.json(
        { error: 'Invalid tier — use "pro", "student", or "enterprise"' },
        { status: 400 }
      );
    }
    const priceId = getStripePriceIdForTier(paidTier);
    if (!priceId) {
      return NextResponse.json(
        { error: `Missing Stripe price id env var for tier "${paidTier}"` },
        { status: 503 }
      );
    }

    const db = getFirebaseAdminDb();
    const snap = await db.collection("users").doc(user.uid).get();
    const existingCustomer =
      typeof snap.data()?.stripeCustomerId === "string" ? snap.data()?.stripeCustomerId : undefined;

    const origin = getOriginFromRequest(request);
    const stripe = getStripe();
    const trialDays = salesLink?.offerFreeTrial
      ? salesLink.trialDays ?? 7
      : salesLink
        ? null
        : getStripeTrialDaysForTier(paidTier);
    const checkoutDiscount = stripeCheckoutDiscountItem(salesLink?.stripePromotionCodeId);
    const allowPromotionCodes = checkoutDiscount ? false : getStripeAllowPromotionCodes();
    const paymentMethodCollection = salesLink?.skipPaymentMethod ? "if_required" : "always";
    const onboarding = body.onboarding === true;
    const returnBase = salesLink
      ? `${origin}/join/${encodeURIComponent(salesLink.slug)}`
      : onboarding
        ? `${origin}/get-started`
        : `${origin}/account`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      payment_method_collection: paymentMethodCollection,
      line_items: [{ price: priceId, quantity: 1 }],
      ...(checkoutDiscount ? { discounts: [checkoutDiscount] } : { allow_promotion_codes: allowPromotionCodes }),
      success_url: `${returnBase}?checkout=success`,
      cancel_url: `${returnBase}?checkout=cancel`,
      client_reference_id: user.uid,
      customer: existingCustomer,
      customer_email: existingCustomer ? undefined : user.email || undefined,
      metadata: {
        firebaseUid: user.uid,
        ...(salesLink ? { salesLinkSlug: salesLink.slug, salesLinkId: salesLink.id } : {})
      },
      subscription_data: {
        ...(trialDays ? { trial_period_days: trialDays } : {}),
        metadata: {
          firebaseUid: user.uid,
          subscriptionTier: paidTier,
          ...(salesLink ? { salesLinkSlug: salesLink.slug, salesLinkId: salesLink.id } : {})
        }
      }
    });

    if (!session.url) {
      return NextResponse.json({ error: "Checkout session missing URL" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    const message = formatStripeCheckoutError(String(error instanceof Error ? error.message : error));
    if (message.includes("401") || message.toLowerCase().includes("auth")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
