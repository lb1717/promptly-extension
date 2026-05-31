"use client";

import { getFirebaseAuth } from "@/lib/firebaseClient";
import { syncPromptlyUserDoc } from "@/lib/promptlyUserSync";
import { SITE } from "@/lib/constants";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User
} from "firebase/auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  preflightEmailRegistration,
  resolveEmailRegistrationError,
  resolveEmailSignInError,
  resolveGoogleSignInError
} from "@/lib/firebaseAuthAccountHints";
import { listenForGoogleSignInReturn, openGoogleSignInInNewTab } from "@/lib/firebaseGoogleAuth";

type PublicSalesLink = {
  slug: string;
  recipientName: string;
  tier: "pro" | "student" | "enterprise";
  offerTitle: string;
  offerDescription: string;
};

type BillingPayload = {
  subscriptionTier: string;
  subscriptionStatus: string;
};

type CheckoutStatus = {
  loading: boolean;
  stripeConfigured: boolean;
  tierAvailable: boolean;
};

const PLAN_DETAILS: Record<
  PublicSalesLink["tier"],
  { name: string; price: string; details: string[] }
> = {
  enterprise: {
    name: "Enterprise",
    price: "$70.00/mo",
    details: [
      "Research-grade intelligence prompt engineering",
      "Highest model quality available",
      "Fastest model quality available",
      "Extensive AI usage statistics"
    ]
  },
  pro: {
    name: "Promptly Pro",
    price: "$2.99/mo",
    details: ["Daily usage tokens: 25× Free", "Model quality: higher than Free", "Model speed: faster than Free"]
  },
  student: {
    name: "Student",
    price: "$1.49/mo",
    details: ["Pro-level capabilities at student pricing", "Daily usage tokens: 25× Free"]
  }
};

const STEPS = ["Welcome", "Account", "Plan", "Install"] as const;

function stepStorageKey(slug: string) {
  return `promptly_join_${slug}_step`;
}

function paidTierActive(billing: BillingPayload | null, tier: PublicSalesLink["tier"]) {
  if (!billing) return false;
  const status = String(billing.subscriptionStatus || "").toLowerCase();
  const active = status === "active" || status === "trialing";
  if (!active) return false;
  const current = String(billing.subscriptionTier || "free").toLowerCase();
  if (tier === "enterprise") return current === "enterprise";
  if (tier === "pro") return current === "pro" || current === "plus" || current === "professional";
  if (tier === "student") return current === "student";
  return false;
}

export function SalesJoinClient({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");

  const [link, setLink] = useState<PublicSalesLink | null>(null);
  const [linkError, setLinkError] = useState("");
  const [linkLoading, setLinkLoading] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [step, setStep] = useState(1);
  const [billing, setBilling] = useState<BillingPayload | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>({
    loading: true,
    stripeConfigured: false,
    tierAvailable: false
  });
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const [emailAuthMode, setEmailAuthMode] = useState<"signin" | "register">("register");
  const [emailAuthEmail, setEmailAuthEmail] = useState("");
  const [emailAuthPassword, setEmailAuthPassword] = useState("");
  const [emailAuthPassword2, setEmailAuthPassword2] = useState("");
  const [emailAuthName, setEmailAuthName] = useState("");

  const planInfo = link ? PLAN_DETAILS[link.tier] : null;

  useEffect(() => {
    let cancelled = false;
    async function loadLink() {
      setLinkLoading(true);
      setLinkError("");
      try {
        const res = await fetch(`/api/sales-links/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLinkError(data.error || "This invite link is invalid or no longer active.");
          setLink(null);
          return;
        }
        setLink(data.link);
      } catch (e) {
        if (!cancelled) {
          setLinkError(String(e instanceof Error ? e.message : e));
        }
      } finally {
        if (!cancelled) setLinkLoading(false);
      }
    }
    loadLink();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!link) return;
    const tier = link.tier;
    let cancelled = false;
    async function loadCheckoutStatus() {
      setCheckoutStatus((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch("/api/billing/status", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setCheckoutStatus({
          loading: false,
          stripeConfigured: Boolean(data.stripeConfigured),
          tierAvailable: Boolean(data.tiers?.[tier])
        });
      } catch {
        if (!cancelled) {
          setCheckoutStatus({ loading: false, stripeConfigured: false, tierAvailable: false });
        }
      }
    }
    loadCheckoutStatus();
    return () => {
      cancelled = true;
    };
  }, [link]);

  useEffect(() => {
    return listenForGoogleSignInReturn({
      onSuccess: () => {
        setNotice("Signed in with Google.");
        setBusy(false);
        goToStep(3);
      },
      onError: (message) => {
        setError(message);
        setBusy(false);
      },
      onSettled: () => setBusy(false)
    });
  }, [slug]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setAuthLoading(false);
      if (next) {
        setBusy(false);
      }
    });
    return () => unsub();
  }, []);

  const loadBilling = useCallback(async (currentUser: User) => {
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/account/billing", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBilling(data as BillingPayload);
      }
    } catch {
      setBilling(null);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setBilling(null);
      return;
    }
    loadBilling(user);
  }, [user, loadBilling]);

  useEffect(() => {
    if (!link || authLoading || linkLoading) return;

    if (checkoutResult === "success" || (user && paidTierActive(billing, link.tier))) {
      setStep(4);
      try {
        window.localStorage.setItem(stepStorageKey(slug), "4");
      } catch {
        /* ignore */
      }
      return;
    }

    if (user) {
      setStep(3);
      try {
        window.localStorage.setItem(stepStorageKey(slug), "3");
      } catch {
        /* ignore */
      }
      return;
    }

    try {
      const saved = Number(window.localStorage.getItem(stepStorageKey(slug)) || "1");
      if (saved >= 1 && saved <= 4) {
        setStep(saved === 4 ? 1 : saved);
      }
    } catch {
      /* ignore */
    }
  }, [link, user, authLoading, linkLoading, billing, checkoutResult, slug]);

  function goToStep(next: number) {
    setStep(next);
    try {
      window.localStorage.setItem(stepStorageKey(slug), String(next));
    } catch {
      /* ignore */
    }
  }

  async function syncUserToFirestore(currentUser: User) {
    await syncPromptlyUserDoc(currentUser);
  }

  async function handleGoogleSignIn() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      openGoogleSignInInNewTab(`${window.location.pathname}${window.location.search}`);
    } catch (e) {
      setError(resolveGoogleSignInError(e).message);
      setBusy(false);
    }
  }

  async function handleEmailPasswordSignIn() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const cred = await signInWithEmailAndPassword(auth, emailAuthEmail.trim(), emailAuthPassword);
      await reload(cred.user);
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user);
        await signOut(auth);
        setNotice("Verify your email first, then sign in again to continue.");
        return;
      }
      await syncUserToFirestore(cred.user);
      goToStep(3);
    } catch (e) {
      setError((await resolveEmailSignInError(getFirebaseAuth(), emailAuthEmail.trim(), e)).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailRegister() {
    setError("");
    setNotice("");
    if (emailAuthPassword !== emailAuthPassword2) {
      setError("Passwords do not match.");
      return;
    }
    if (emailAuthPassword.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (!emailAuthName.trim()) {
      setError("Enter your name.");
      return;
    }
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const email = emailAuthEmail.trim();
      const preflight = await preflightEmailRegistration(auth, email);
      if (preflight?.blocked) {
        setError(preflight.message);
        return;
      }
      const cred = await createUserWithEmailAndPassword(auth, email, emailAuthPassword);
      await updateProfile(cred.user, { displayName: emailAuthName.trim() });
      await syncUserToFirestore(cred.user);
      await sendEmailVerification(cred.user);
      await signOut(auth);
      setEmailAuthMode("signin");
      setNotice("Account created. Verify your email, then sign in to continue.");
      setEmailAuthPassword("");
      setEmailAuthPassword2("");
      setEmailAuthName("");
    } catch (e) {
      setError((await resolveEmailRegistrationError(getFirebaseAuth(), emailAuthEmail.trim(), e)).message);
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout() {
    if (!user || !link) return;
    setCheckoutBusy(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tier: link.tier, salesLinkSlug: link.slug })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Checkout failed (${res.status})`);
      }
      if (typeof data.url === "string" && data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setCheckoutBusy(false);
    }
  }

  const edgeUrl = SITE.edgeAddonsUrl || SITE.browserExtensionTargets.find((t) => t.key === "edge")?.installUrl;

  const canActivatePlan = Boolean(
    user && !checkoutStatus.loading && checkoutStatus.stripeConfigured && checkoutStatus.tierAvailable
  );

  const checkoutBlockedMessage = useMemo(() => {
    if (checkoutStatus.loading || !user) return "";
    if (!checkoutStatus.stripeConfigured) {
      return "Stripe is not connected on this server. Add STRIPE_SECRET_KEY to the environment and restart the dev server (or redeploy).";
    }
    if (!checkoutStatus.tierAvailable) {
      const tierLabel = link?.tier === "enterprise" ? "Enterprise" : link?.tier === "pro" ? "Pro" : "Student";
      return `The ${tierLabel} plan price is not configured. Add the matching STRIPE_PRICE_ID_* env var in Stripe Dashboard → Products.`;
    }
    return "";
  }, [checkoutStatus, user, link?.tier]);

  const stepTitle = useMemo(() => {
    if (!link) return "";
    if (step === 1) return `Welcome, ${link.recipientName}`;
    if (step === 2) return "Create your account";
    if (step === 3) return "Your plan";
    return "Install Promptly";
  }, [link, step]);

  if (linkLoading) {
    return <p className="py-20 text-center text-sm text-muted">Loading your invite…</p>;
  }

  if (linkError || !link) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold text-ink">Invite not found</h1>
        <p className="mt-3 text-sm text-muted">{linkError || "This link may have expired."}</p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-ink underline">
          Go to Promptly
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 pb-24">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-2">
          {STEPS.map((label, index) => {
            const num = index + 1;
            const active = step === num;
            const done = step > num;
            return (
              <div key={label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    active
                      ? "bg-ink text-cream"
                      : done
                        ? "bg-emerald-600 text-white"
                        : "border border-line bg-cream-dark text-faint"
                  }`}
                >
                  {done ? "✓" : num}
                </div>
                <span className={`text-[10px] ${active ? "font-semibold text-ink" : "text-faint"}`}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-semibold text-ink">{stepTitle}</h1>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {notice ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}

        {step === 1 ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm leading-relaxed text-muted">
              Thanks for using Promptly{link.recipientName ? `, ${link.recipientName}` : ""}. We&apos;ve prepared a
              personalized setup just for you — account, plan, and browser extension in a few quick steps.
            </p>
            <button
              type="button"
              onClick={() => goToStep(2)}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800"
            >
              Get started
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-6 space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={busy || authLoading}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-60"
            >
              {busy ? "Waiting for Google…" : "Continue with Google"}
              <img src="/images/google-logo.png" alt="" aria-hidden className="h-[18px] w-[18px] shrink-0 object-contain" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-faint">or</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <div className="rounded-xl border border-line bg-cream-dark p-4">
              <div className="flex justify-center gap-2 text-xs">
                <button
                  type="button"
                  className={`rounded-lg px-2 py-1 ${emailAuthMode === "register" ? "bg-cream text-ink" : "text-faint"}`}
                  onClick={() => setEmailAuthMode("register")}
                >
                  Create account
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-2 py-1 ${emailAuthMode === "signin" ? "bg-cream text-ink" : "text-faint"}`}
                  onClick={() => setEmailAuthMode("signin")}
                >
                  Sign in
                </button>
              </div>
              <div className="mt-3 space-y-2">
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={emailAuthEmail}
                  onChange={(e) => setEmailAuthEmail(e.target.value)}
                  className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                />
                {emailAuthMode === "register" ? (
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="Full name"
                    value={emailAuthName}
                    onChange={(e) => setEmailAuthName(e.target.value)}
                    className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                  />
                ) : null}
                <input
                  type="password"
                  autoComplete={emailAuthMode === "signin" ? "current-password" : "new-password"}
                  placeholder="Password"
                  value={emailAuthPassword}
                  onChange={(e) => setEmailAuthPassword(e.target.value)}
                  className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                />
                {emailAuthMode === "register" ? (
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Confirm password"
                    value={emailAuthPassword2}
                    onChange={(e) => setEmailAuthPassword2(e.target.value)}
                    className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                  />
                ) : null}
              </div>
              <button
                type="button"
                onClick={emailAuthMode === "signin" ? handleEmailPasswordSignIn : handleEmailRegister}
                disabled={busy}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-60"
              >
                {busy ? "Working…" : emailAuthMode === "signin" ? "Sign in & continue" : "Create account"}
              </button>
            </div>

            <button type="button" onClick={() => goToStep(1)} className="text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </div>
        ) : null}

        {step === 3 && planInfo ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
              <p className="text-sm font-semibold text-emerald-900">{link.offerTitle}</p>
              <p className="mt-1 text-sm text-emerald-800">{link.offerDescription}</p>
            </div>

            <article className="rounded-xl border border-line bg-cream-dark p-4">
              <h3 className="text-lg font-semibold text-ink">{planInfo.name}</h3>
              <p className="mt-1 text-sm font-semibold text-muted">{planInfo.price}</p>
              <ul className="mt-3 space-y-1.5 text-xs text-muted">
                {planInfo.details.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-faint">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            {checkoutResult === "cancel" ? (
              <p className="text-sm text-muted">Checkout was cancelled. You can try again when ready.</p>
            ) : null}

            <button
              type="button"
              onClick={startCheckout}
              disabled={checkoutBusy || !canActivatePlan}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-60"
            >
              {checkoutBusy
                ? "Redirecting to Stripe…"
                : checkoutStatus.loading
                  ? "Checking checkout…"
                  : "Activate plan"}
            </button>

            {checkoutBlockedMessage ? (
              <p className="text-xs text-faint">{checkoutBlockedMessage}</p>
            ) : null}

            <button type="button" onClick={() => goToStep(2)} className="text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted">
              You&apos;re all set{link.recipientName ? `, ${link.recipientName}` : ""}. Install Promptly in your browser
              to start improving prompts in ChatGPT, Claude, and Gemini.
            </p>
            <a
              href={SITE.chromeStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800"
            >
              Add to Google Chrome
            </a>
            {edgeUrl ? (
              <a
                href={edgeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-xl border border-line bg-cream-dark px-4 py-3 text-sm font-semibold text-ink hover:bg-cream"
              >
                Add to Microsoft Edge
              </a>
            ) : null}
            <Link href="/account" className="block text-center text-xs text-faint hover:text-ink">
              Go to your account dashboard
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
