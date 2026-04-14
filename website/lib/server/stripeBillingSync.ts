import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { applyBillingDerivedDailyTokenLimit } from "@/lib/server/promptlyBackend";

function tierFromSubscriptionMetadata(metaRaw: string): string {
  const meta = metaRaw.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (meta === "pro" || meta === "promptly_pro") return "pro";
  if (meta === "plus" || meta === "professional") return "pro";
  return "free";
}

function resolvedSubscriptionTier(subscription: Stripe.Subscription): string {
  const status = subscription.status;
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") return "free";
  const fromMeta = tierFromSubscriptionMetadata(String(subscription.metadata?.subscriptionTier || ""));
  if (fromMeta === "pro") return "pro";
  if (status === "active" || status === "trialing" || status === "past_due") return "pro";
  return "free";
}

export async function syncUserBillingFromSubscription(
  db: Firestore,
  firebaseUid: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const ref = db.collection("users").doc(firebaseUid);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;
  const status = subscription.status;
  const subscriptionTier = resolvedSubscriptionTier(subscription);

  const periodEnd =
    subscription.current_period_end != null
      ? Timestamp.fromMillis(subscription.current_period_end * 1000)
      : null;

  await ref.set(
    {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      subscriptionTier,
      subscriptionStatus: status,
      currentPeriodEnd: periodEnd,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  await applyBillingDerivedDailyTokenLimit(firebaseUid);
}

export async function attachDefaultPaymentMethod(
  db: Firestore,
  firebaseUid: string,
  stripe: Stripe,
  customerId: string
): Promise<void> {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"]
  });
  if (customer.deleted) return;
  const pm = customer.invoice_settings?.default_payment_method;
  if (!pm || typeof pm === "string") return;
  const card = "card" in pm && pm.card ? pm.card : null;
  if (!card?.last4) return;
  await db.collection("users").doc(firebaseUid).set(
    {
      paymentMethod: {
        brand: card.brand || "Card",
        last4: card.last4,
        expMonth: card.exp_month ?? null,
        expYear: card.exp_year ?? null
      }
    },
    { merge: true }
  );
}

export async function appendInvoiceIfNew(
  db: Firestore,
  firebaseUid: string,
  invoice: Stripe.Invoice
): Promise<void> {
  const ref = db.collection("users").doc(firebaseUid);
  const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;
  const row = {
    id: invoice.id,
    date: new Date(paidAt * 1000).toISOString(),
    amount: invoice.amount_paid,
    currency: (invoice.currency || "usd").toUpperCase(),
    status: invoice.status || "paid",
    description:
      invoice.description || invoice.lines?.data[0]?.description || "Subscription"
  };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const payments = (snap.data()?.billingPayments as unknown[]) || [];
    const exists = payments.some(
      (p) => p && typeof p === "object" && "id" in p && (p as { id: string }).id === invoice.id
    );
    if (exists) return;
    const next = { billingPayments: [...payments, row], updatedAt: FieldValue.serverTimestamp() };
    if (snap.exists) {
      tx.update(ref, next);
    } else {
      tx.set(ref, next, { merge: true });
    }
  });
}
