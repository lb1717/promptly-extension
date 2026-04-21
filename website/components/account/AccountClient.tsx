"use client";

import { getFirebaseAuth, getFirebaseDb, getGoogleProvider } from "@/lib/firebaseClient";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function maskUid(uid: string) {
  if (!uid) return "—";
  return `${uid.slice(0, 6)}…${uid.slice(-4)}`;
}

function formatJoinDate(user: User | null): string {
  if (!user?.metadata?.creationTime) return "—";
  try {
    return new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  } catch {
    return "—";
  }
}

function tierLabel(tier: string): string {
  const t = tier.toLowerCase();
  if (t === "free") return "Free";
  if (t === "pro" || t === "plus" || t === "professional") return "Promptly Pro";
  if (t === "enterprise") return "Enterprise";
  if (t === "student") return "Student";
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Free";
}

type BillingPayment = {
  id?: string;
  date?: string;
  amount?: number;
  currency?: string;
  status?: string;
  description?: string;
};

type BillingPayload = {
  subscriptionTier: string;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  nextInvoiceAmount: number | null;
  currency: string;
  paymentMethod: { brand: string; last4: string; expMonth: number | null; expYear: number | null } | null;
  payments: BillingPayment[];
  stripeConfigured: boolean;
  billingPortalAvailable: boolean;
};

const ACCOUNT_PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0.00/mo",
    subtitle: "Simple prompt improvement for everyday usage",
    details: [
      "Daily usage tokens: limited",
      "Core models and functionality"
    ],
    idealFor: "casual users, beginners, and quick prompt edits"
  },
  {
    key: "pro",
    name: "Promptly Pro",
    price: "$2.99/mo",
    subtitle: "Better quality and speed for frequent use",
    details: [
      "7-day free trial (card required)",
      "Daily usage tokens: 25× Free",
      "Model quality: higher than Free",
      "Model speed: faster than Free"
    ],
    idealFor: "frequent users and builders"
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$30.00/mo",
    subtitle: "Maximum capability, speed, and reliability",
    details: [
      "Daily usage tokens: 100× Free",
      "Model quality: highest available",
      "Model speed: fastest processing",
      "Research-grade intelligent prompt engineering",
      "Priority during peak times"
    ],
    idealFor: "industry professionals and researchers"
  },
  {
    key: "student",
    name: "Student",
    price: "$1.49/mo",
    subtitle: "Pro-level capabilities at student pricing",
    details: [
      "7-day free trial (card required)",
      "Daily usage tokens: 25× Free",
      "All features included in Pro",
      "Discounted price versus Pro"
    ],
    idealFor: "students learning, building, and experimenting"
  }
] as const;

export function AccountClient({ extensionMode = false }: { extensionMode?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [billing, setBilling] = useState<BillingPayload | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [checkoutBusyTier, setCheckoutBusyTier] = useState<"pro" | "student" | "enterprise" | null>(null);
  const [showBillingDetails, setShowBillingDetails] = useState(false);

  const loadBilling = useCallback(async (current: User) => {
    setBillingLoading(true);
    setBillingError("");
    try {
      const token = await current.getIdToken();
      const res = await fetch("/api/account/billing", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      const { ok, ...rest } = data as BillingPayload & { ok?: boolean };
      void ok;
      setBilling(rest as BillingPayload);
    } catch (e) {
      setBilling(null);
      setBillingError(String(e instanceof Error ? e.message : e));
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (nextUser) {
        await loadBilling(nextUser);
      } else {
        setBilling(null);
      }
    });
    return () => unsub();
  }, [loadBilling]);

  const accountStatus = useMemo(() => {
    if (!user) return "Not signed in";
    return user.emailVerified ? "Verified" : "Unverified email";
  }, [user]);

  const currentTierKey = useMemo(() => {
    const raw = String(billing?.subscriptionTier || "free").toLowerCase();
    if (raw === "pro" || raw === "plus" || raw === "professional") return "pro";
    if (raw === "enterprise") return "enterprise";
    if (raw === "student") return "student";
    return "free";
  }, [billing?.subscriptionTier]);

  async function syncUserToFirestore(currentUser: User) {
    const db = getFirebaseDb();
    const ref = doc(db, "users", currentUser.uid);
    await setDoc(
      ref,
      {
        uid: currentUser.uid,
        email: currentUser.email || null,
        displayName: currentUser.displayName || null,
        photoURL: currentUser.photoURL || null,
        provider: "google",
        updatedAt: serverTimestamp(),
        plan: "free",
        subscriptionTier: "free"
      },
      { merge: true }
    );
  }

  async function handleGoogleSignIn() {
    setError("");
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const result = await signInWithPopup(auth, getGoogleProvider());
      await syncUserToFirestore(result.user);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function openStripeCustomerPortal(currentUser: User) {
    setPortalBusy(true);
    setBillingError("");
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/account/billing/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Portal failed (${res.status})`);
      }
      if (typeof data.url === "string" && data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      setBillingError(String(e instanceof Error ? e.message : e));
    } finally {
      setPortalBusy(false);
    }
  }

  async function startStripeCheckoutForTier(currentUser: User, tier: "pro" | "student" | "enterprise") {
    setCheckoutBusyTier(tier);
    setBillingError("");
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tier })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Checkout failed (${res.status})`);
      }
      if (typeof data.url === "string" && data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      setBillingError(String(e instanceof Error ? e.message : e));
    } finally {
      setCheckoutBusyTier(null);
    }
  }

  async function handleSignOut() {
    setError("");
    setBusy(true);
    try {
      await signOut(getFirebaseAuth());
      setBilling(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 pb-24">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            {extensionMode ? "Promptly Extension Login" : "Account"}
          </h1>
          <p className="mt-1 text-sm text-violet-200/70">
            Profile, plan, and billing — powered by Firebase. Paid plans use Stripe Checkout and the billing portal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!user ? (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={busy || loading}
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in with Google"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => loadBilling(user)}
                disabled={billingLoading}
                className="rounded-xl border border-violet-500/40 px-4 py-2.5 text-sm text-violet-100 hover:bg-violet-500/10 disabled:opacity-60"
              >
                {billingLoading ? "Refreshing…" : "Refresh billing"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={busy}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-violet-200 hover:bg-white/5 disabled:opacity-60"
              >
                Sign out
              </button>
            </>
          )}
          {extensionMode ? (
            <Link
              href="/account"
              className="inline-flex items-center justify-center rounded-xl border border-violet-500/30 px-4 py-2.5 text-sm text-violet-200 hover:bg-violet-500/10"
            >
              Full account page
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!user && !loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center backdrop-blur-md">
          <p className="text-violet-100/85">Sign in to see your profile, subscription, and payment history.</p>
        </div>
      ) : null}

      {user ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md sm:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-violet-200/80">Overview</h2>
            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-2xl border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-violet-500/20 text-2xl font-semibold text-white">
                  {(user.displayName || user.email || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-violet-300/80">Display name</p>
                  <p className="mt-1 text-lg font-medium text-white">{user.displayName || "—"}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-violet-300/80">Email</p>
                    <p className="mt-1 break-all text-sm text-violet-100">{user.email || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-violet-300/80">Member since</p>
                    <p className="mt-1 text-sm text-violet-100">{formatJoinDate(user)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-violet-300/80">Account status</p>
                    <p className="mt-1 text-sm text-violet-100">{accountStatus}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-violet-300/80">User ID</p>
                    <p className="mt-1 font-mono text-xs text-violet-200/90">{maskUid(user.uid)}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md sm:p-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-violet-200/80">
                Subscription
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {billing ? (
                  <button
                    type="button"
                    onClick={() => setShowBillingDetails((prev) => !prev)}
                    className="inline-flex items-center justify-center rounded-xl border border-violet-400/35 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-500/10"
                  >
                    {showBillingDetails ? "Hide billing details" : "Show billing details"}
                  </button>
                ) : null}
                {billing?.billingPortalAvailable ? (
                  <button
                    type="button"
                    onClick={() => user && openStripeCustomerPortal(user)}
                    disabled={portalBusy || !user}
                    className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
                  >
                    {portalBusy ? "Opening portal…" : "Manage subscription & cards"}
                  </button>
                ) : null}
              </div>
            </div>
            <p className="mt-4 text-sm text-violet-200/70">
              Select from all available plans. Your active plan is highlighted below.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-4">
              {ACCOUNT_PLANS.map((plan) => {
                const isCurrent = currentTierKey === plan.key;
                const isPopular = plan.key === "enterprise";
                const paidTier = plan.key === "pro" || plan.key === "student" || plan.key === "enterprise";
                const canCheckoutPaidTier = Boolean(user && billing?.stripeConfigured && paidTier && !isCurrent);

                return (
                  <article
                    key={plan.key}
                    className={`relative flex flex-col rounded-xl border p-4 ${
                      isCurrent
                        ? "border-violet-400/60 bg-violet-500/[0.12] shadow-[0_10px_30px_rgba(124,58,237,0.18)]"
                        : isPopular
                          ? "border-amber-300/45 bg-amber-500/[0.08] shadow-[0_10px_28px_rgba(245,158,11,0.15)]"
                          : "border-white/10 bg-black/25"
                    }`}
                  >
                    {isPopular ? (
                      <span className="absolute -top-2.5 left-3 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black">
                        Popular
                      </span>
                    ) : null}
                    {isCurrent ? (
                      <span className="absolute -top-2.5 right-3 rounded-full bg-violet-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                        Current plan
                      </span>
                    ) : null}
                    <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                    {plan.key === "pro" || plan.key === "student" ? (
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                        Free trial
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm font-semibold text-violet-100">{plan.price}</p>
                    <p className="mt-2 text-xs text-violet-200/75">{plan.subtitle}</p>
                    <ul className="mt-3 space-y-1.5 text-xs text-violet-100/85">
                      {plan.details.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="text-violet-400">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[11px] text-violet-200/65">
                      <span className="font-semibold text-violet-100/85">Ideal for:</span> {plan.idealFor}
                    </p>

                    <div className="mt-auto pt-4">
                      {isCurrent ? (
                        <button
                          type="button"
                          disabled
                          className="inline-flex w-full items-center justify-center rounded-lg border border-violet-300/40 px-3 py-2 text-xs font-semibold text-violet-100/90 opacity-90"
                        >
                          Current plan
                        </button>
                      ) : canCheckoutPaidTier ? (
                        <button
                          type="button"
                          onClick={() =>
                            user &&
                            startStripeCheckoutForTier(user, plan.key as "pro" | "student" | "enterprise")
                          }
                          disabled={checkoutBusyTier !== null}
                          className="inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
                        >
                          {checkoutBusyTier === plan.key ? "Redirecting…" : `Choose ${plan.name}`}
                        </button>
                      ) : plan.key === "free" && billing?.billingPortalAvailable ? (
                        <button
                          type="button"
                          onClick={() => user && openStripeCustomerPortal(user)}
                          disabled={portalBusy}
                          className="inline-flex w-full items-center justify-center rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-violet-200/85 hover:bg-white/5 disabled:opacity-60"
                        >
                          {portalBusy ? "Opening portal…" : "Downgrade in billing portal"}
                        </button>
                      ) : paidTier ? (
                        <button
                          type="button"
                          disabled
                          className="inline-flex w-full items-center justify-center rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-violet-200/75"
                        >
                          Checkout not configured
                        </button>
                      ) : (
                        <Link
                          href="/product#pricing"
                          className="inline-flex w-full items-center justify-center rounded-lg border border-violet-400/35 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/10"
                        >
                          View plan details
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {billingError ? (
              <p className="mt-4 text-sm text-amber-200/90">{billingError}</p>
            ) : billingLoading && !billing ? (
              <p className="mt-4 text-sm text-violet-200/70">Loading subscription…</p>
            ) : billing ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs uppercase tracking-wider text-violet-300/80">Current plan</p>
                  <p className="mt-2 text-xl font-semibold text-white">{tierLabel(billing.subscriptionTier)}</p>
                  <p className="mt-1 text-xs text-violet-200/65 capitalize">
                    Status: {billing.subscriptionStatus.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs uppercase tracking-wider text-violet-300/80">Billing period</p>
                  <p className="mt-2 text-sm text-violet-100">
                    {billing.currentPeriodEnd
                      ? `Renews or ends ${new Date(billing.currentPeriodEnd).toLocaleString()}`
                      : "—"}
                  </p>
                  {showBillingDetails && billing.nextInvoiceAmount != null ? (
                    <p className="mt-1 text-xs text-violet-200/65">
                      Next invoice: {(billing.nextInvoiceAmount / 100).toFixed(2)} {billing.currency}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-4 sm:col-span-2 lg:col-span-1">
                  <p className="text-xs uppercase tracking-wider text-violet-300/80">Stripe</p>
                  <p className="mt-2 text-xs text-violet-200/75">
                    {billing.stripeConfigured
                      ? "Webhook: POST /api/webhooks/stripe — syncs subscription and invoices to Firestore."
                      : "Set STRIPE_SECRET_KEY and price IDs to enable Checkout and the customer portal."}
                  </p>
                </div>
              </div>
            ) : null}
            {billing?.billingPortalAvailable ? (
              <div className="mt-6 border-t border-white/10 pt-4 text-right">
                <button
                  type="button"
                  onClick={() => user && openStripeCustomerPortal(user)}
                  disabled={portalBusy}
                  className="text-xs text-violet-300/70 underline-offset-2 hover:text-violet-200 hover:underline disabled:opacity-60"
                >
                  Need to cancel or change renewal? Open billing portal
                </button>
              </div>
            ) : null}
          </section>

          {showBillingDetails ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md sm:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-violet-200/80">Payment method</h2>
            {billing?.paymentMethod ? (
              <div className="mt-6 flex max-w-md items-center gap-4 rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-4">
                <div className="flex h-10 w-14 items-center justify-center rounded-md bg-white/10 text-xs font-bold text-white">
                  {billing.paymentMethod.brand.slice(0, 4).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-white">
                    {billing.paymentMethod.brand} ···· {billing.paymentMethod.last4}
                  </p>
                  <p className="text-xs text-violet-200/70">
                    {billing.paymentMethod.expMonth && billing.paymentMethod.expYear
                      ? `Expires ${billing.paymentMethod.expMonth}/${billing.paymentMethod.expYear}`
                      : "Card on file"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-violet-200/75">
                No card on file yet. After you complete Stripe Checkout, the default card will show here when the
                webhook syncs payment method details.
              </p>
            )}
            {billing?.billingPortalAvailable ? (
              <p className="mt-4 text-xs text-violet-200/60">
                Update cards in the{" "}
                <button
                  type="button"
                  onClick={() => user && openStripeCustomerPortal(user)}
                  disabled={portalBusy}
                  className="text-violet-300 underline-offset-2 hover:underline disabled:opacity-60"
                >
                  Stripe customer portal
                </button>
                .
              </p>
            ) : null}
            </section>
          ) : (
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md sm:p-8">
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-violet-200/80">Billing details</h2>
              <p className="mt-4 text-sm text-violet-200/75">
                Billing amounts, card details, and invoice history are hidden by default.
              </p>
              <button
                type="button"
                onClick={() => setShowBillingDetails(true)}
                className="mt-4 inline-flex items-center justify-center rounded-xl border border-violet-400/35 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-500/10"
              >
                Show billing details
              </button>
            </section>
          )}

          {showBillingDetails ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md sm:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-violet-200/80">Payments</h2>
            {billing && Array.isArray(billing.payments) && billing.payments.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-white/10 text-violet-200/80">
                    <tr>
                      <th className="pb-3 pr-4 font-medium">Date</th>
                      <th className="pb-3 pr-4 font-medium">Description</th>
                      <th className="pb-3 pr-4 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-violet-100/90">
                    {billing.payments.map((p, i) => (
                      <tr key={p.id || i} className="border-b border-white/[0.06]">
                        <td className="py-3 pr-4">
                          {p.date ? new Date(p.date).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3 pr-4">{p.description || "—"}</td>
                        <td className="py-3 pr-4 tabular-nums">
                          {typeof p.amount === "number"
                            ? `${(p.amount / 100).toFixed(2)} ${p.currency || billing.currency || "USD"}`
                            : "—"}
                        </td>
                        <td className="py-3 capitalize">{p.status || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-violet-200/75">
                No payments recorded. Webhook handlers can append rows to{" "}
                <code className="rounded bg-black/40 px-1 text-xs text-violet-200">billingPayments</code> on your user
                document.
              </p>
            )}
            </section>
          ) : null}

          {extensionMode ? (
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100">
              The extension uses the same Firebase project. Keep API keys and auth domain aligned in extension
              settings.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
