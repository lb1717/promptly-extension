import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import {
  appendInvoiceIfNew,
  attachDefaultPaymentMethod,
  syncUserBillingFromSubscription
} from "@/lib/server/stripeBillingSync";
import { getStripe } from "@/lib/server/stripe";

export const runtime = "nodejs";

async function firebaseUidFromSubscription(
  stripe: Stripe,
  subscriptionId: string
): Promise<string | null> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const uid = sub.metadata?.firebaseUid;
  return uid && uid.trim() ? uid.trim() : null;
}

export async function POST(request: Request) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Webhook signature: ${msg}` }, { status: 400 });
  }

  const db = getFirebaseAdminDb();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const firebaseUid =
          (session.metadata?.firebaseUid && session.metadata.firebaseUid.trim()) ||
          (session.client_reference_id && session.client_reference_id.trim()) ||
          null;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (firebaseUid && subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await syncUserBillingFromSubscription(db, firebaseUid, sub);
          const customerId =
            typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
          if (customerId) {
            await attachDefaultPaymentMethod(db, firebaseUid, stripe, customerId);
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const firebaseUid =
          subscription.metadata?.firebaseUid && subscription.metadata.firebaseUid.trim()
            ? subscription.metadata.firebaseUid.trim()
            : null;
        const uid = firebaseUid || (await firebaseUidFromSubscription(stripe, subscription.id));
        if (uid) {
          await syncUserBillingFromSubscription(db, uid, subscription);
          const customerId =
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer?.id;
          if (customerId && subscription.status !== "canceled") {
            await attachDefaultPaymentMethod(db, uid, stripe, customerId);
          }
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (!subId) break;
        const uid = await firebaseUidFromSubscription(stripe, subId);
        if (uid) {
          await appendInvoiceIfNew(db, uid, invoice);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("stripe webhook handler error", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
