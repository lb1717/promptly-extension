import { NextResponse } from "next/server";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";
import {
  getOriginFromRequest,
  getStripe,
  getStripePriceIdForTier,
  isStripeConfigured,
  normalizePaidTier
} from "@/lib/server/stripe";

export const runtime = "nodejs";

type Body = { tier?: string };

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
    const paidTier = normalizePaidTier(String(body.tier || "pro"));
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/account?checkout=success`,
      cancel_url: `${origin}/account?checkout=cancel`,
      client_reference_id: user.uid,
      customer: existingCustomer,
      customer_email: existingCustomer ? undefined : user.email || undefined,
      metadata: { firebaseUid: user.uid },
      subscription_data: {
        metadata: { firebaseUid: user.uid, subscriptionTier: paidTier }
      }
    });

    if (!session.url) {
      return NextResponse.json({ error: "Checkout session missing URL" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (message.includes("401") || message.toLowerCase().includes("auth")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
