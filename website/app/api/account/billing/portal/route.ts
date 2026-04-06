import { NextResponse } from "next/server";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";
import { getOriginFromRequest, getStripe, isStripeConfigured } from "@/lib/server/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
    }
    const { user } = await requireWebFirebaseUser(request);
    const db = getFirebaseAdminDb();
    const snap = await db.collection("users").doc(user.uid).get();
    const customerId = typeof snap.data()?.stripeCustomerId === "string" ? snap.data()?.stripeCustomerId : null;
    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer on file — complete checkout first." },
        { status: 400 }
      );
    }
    const origin = getOriginFromRequest(request);
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/account`
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (message === "Missing Firebase auth token") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
