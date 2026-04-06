import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";
import { isStripeConfigured } from "@/lib/server/stripe";

export const runtime = "nodejs";

function tsToIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    const s = Number((value as { _seconds: number })._seconds);
    if (Number.isFinite(s)) return new Date(s * 1000).toISOString();
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const db = getFirebaseAdminDb();
    const snap = await db.collection("users").doc(user.uid).get();
    const d = (snap.data() || {}) as Record<string, unknown>;

    const subscriptionTier = String(d.subscriptionTier || d.plan || "free").toLowerCase();
    const subscriptionStatus =
      typeof d.subscriptionStatus === "string" ? d.subscriptionStatus : subscriptionTier === "free" ? "none" : "active";
    const paymentMethod =
      d.paymentMethod && typeof d.paymentMethod === "object"
        ? (d.paymentMethod as { brand?: string; last4?: string; expMonth?: number; expYear?: number })
        : null;
    const payments = Array.isArray(d.billingPayments) ? d.billingPayments : [];

    const stripeCustomerId = typeof d.stripeCustomerId === "string" ? d.stripeCustomerId : null;
    const stripeConfigured = isStripeConfigured();
    const billingPortalAvailable = Boolean(stripeConfigured && stripeCustomerId);

    return NextResponse.json({
      ok: true,
      subscriptionTier,
      subscriptionStatus,
      currentPeriodEnd: tsToIso(d.currentPeriodEnd),
      nextInvoiceAmount: typeof d.nextInvoiceAmount === "number" ? d.nextInvoiceAmount : null,
      currency: typeof d.billingCurrency === "string" ? d.billingCurrency : "USD",
      stripeCustomerId,
      stripeSubscriptionId: typeof d.stripeSubscriptionId === "string" ? d.stripeSubscriptionId : null,
      paymentMethod:
        paymentMethod && paymentMethod.last4
          ? {
              brand: String(paymentMethod.brand || "Card"),
              last4: String(paymentMethod.last4),
              expMonth: paymentMethod.expMonth ?? null,
              expYear: paymentMethod.expYear ?? null
            }
          : null,
      payments,
      stripeConfigured,
      billingPortalAvailable
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401 }
    );
  }
}
