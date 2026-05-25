"use client";

import { getFirebaseAuth, getFirebaseDb, getGoogleProvider } from "@/lib/firebaseClient";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function inferAuthProvider(user: User): string {
  const ids = (user.providerData || []).map((p) => p.providerId).filter(Boolean);
  if (ids.includes("password")) return "password";
  if (ids.includes("google.com")) return "google";
  return ids[0] || "unknown";
}

function tierLabel(tier: string): string {
  const t = tier.toLowerCase();
  if (t === "free") return "Free";
  if (t === "pro" || t === "plus" || t === "professional") return "Promptly Pro";
  if (t === "enterprise") return "Enterprise";
  if (t === "student") return "Student";
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Free";
}

function formatDurationMs(value: number): string {
  const ms = Math.max(0, Math.floor(Number(value) || 0));
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(2)} s`;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

function isPermissionLikeMessage(message: string): boolean {
  const t = String(message || "").toLowerCase();
  return (
    t.includes("permission") ||
    t.includes("permission-denied") ||
    t.includes("access denied") ||
    t.includes("forbidden") ||
    t.includes("not authorized") ||
    t.includes("unauthorized") ||
    t.includes("insufficient privileges") ||
    t.includes("missing or insufficient")
  );
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

type DailyCreditsPayload = {
  used: number;
  max: number;
  remaining: number;
  used_percent: number;
  left_percent: number;
  hard_exhausted: boolean;
};

type AccountUsageStatsPayload = {
  ok: true;
  range_days: number;
  totals: {
    prompts: number;
    tokens: number;
    auto_prompts: number;
    manual_prompts: number;
    generated_prompts: number;
  };
  service_breakdown: {
    chatgpt: number;
    claude: number;
    gemini: number;
    unknown: number;
  };
  averages: {
    prompts_per_active_day: number;
    tokens_per_prompt: number;
    response_time_ms: number;
  };
  streaks: {
    active_days: number;
    busiest_day: string | null;
    busiest_day_prompts: number;
  };
  timeline: Array<{
    day: string;
    prompts: number;
    tokens: number;
  }>;
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
  const [accountStats, setAccountStats] = useState<AccountUsageStatsPayload | null>(null);
  const [accountStatsLoading, setAccountStatsLoading] = useState(false);
  const [accountStatsError, setAccountStatsError] = useState("");
  const [dailyCredits, setDailyCredits] = useState<DailyCreditsPayload | null>(null);
  const [dailyCreditsLoading, setDailyCreditsLoading] = useState(false);
  const [dailyCreditsError, setDailyCreditsError] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [checkoutBusyTier, setCheckoutBusyTier] = useState<"pro" | "student" | "enterprise" | null>(null);
  const [showBillingDetails, setShowBillingDetails] = useState(false);
  const [accountNotice, setAccountNotice] = useState("");
  const [emailAuthEmail, setEmailAuthEmail] = useState("");
  const [emailAuthPassword, setEmailAuthPassword] = useState("");
  const [emailAuthPassword2, setEmailAuthPassword2] = useState("");
  const [emailAuthName, setEmailAuthName] = useState("");
  const [emailAuthMode, setEmailAuthMode] = useState<"signin" | "register">("signin");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawHash = String(window.location.hash || "").replace(/^#/, "");
    if (!rawHash) return;
    const hashParams = new URLSearchParams(rawHash);
    const customToken = String(hashParams.get("promptly_ext_custom_token") || "").trim();
    if (!customToken) return;
    let cancelled = false;
    (async () => {
      try {
        await signInWithCustomToken(getFirebaseAuth(), customToken);
        if (!cancelled) {
          setAccountNotice("Signed in from extension session.");
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e instanceof Error ? e.message : e));
        }
      } finally {
        hashParams.delete("promptly_ext_custom_token");
        const nextHash = hashParams.toString();
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ""}`;
        window.history.replaceState({}, "", nextUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const loadAccountStats = useCallback(async (current: User) => {
    setAccountStatsLoading(true);
    setAccountStatsError("");
    try {
      const token = await current.getIdToken();
      const res = await fetch("/api/account/stats?days=14", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setAccountStats(data as AccountUsageStatsPayload);
    } catch (e) {
      setAccountStats(null);
      setAccountStatsError(String(e instanceof Error ? e.message : e));
    } finally {
      setAccountStatsLoading(false);
    }
  }, []);

  const loadDailyCredits = useCallback(async (current: User) => {
    setDailyCreditsLoading(true);
    setDailyCreditsError("");
    try {
      const token = await current.getIdToken();
      const res = await fetch("/api/account/credits", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setDailyCredits((data?.credits || null) as DailyCreditsPayload | null);
    } catch (e) {
      setDailyCredits(null);
      setDailyCreditsError(String(e instanceof Error ? e.message : e));
    } finally {
      setDailyCreditsLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (nextUser) {
        await Promise.all([loadBilling(nextUser), loadAccountStats(nextUser), loadDailyCredits(nextUser)]);
      } else {
        setBilling(null);
        setAccountStats(null);
        setDailyCredits(null);
      }
    });
    return () => unsub();
  }, [loadBilling, loadAccountStats, loadDailyCredits]);

  const permissionInlineMessages = useMemo(() => {
    const msgs: string[] = [];
    for (const raw of [error, billingError, accountStatsError]) {
      const s = String(raw || "").trim();
      if (!s || !isPermissionLikeMessage(s)) continue;
      if (!msgs.includes(s)) msgs.push(s);
    }
    return msgs;
  }, [error, billingError, accountStatsError]);

  const currentTierKey = useMemo(() => {
    const raw = String(billing?.subscriptionTier || "free").toLowerCase();
    if (raw === "pro" || raw === "plus" || raw === "professional") return "pro";
    if (raw === "enterprise") return "enterprise";
    if (raw === "student") return "student";
    return "free";
  }, [billing?.subscriptionTier]);

  const currentPlanLabel = useMemo(
    () => tierLabel(billing?.subscriptionTier || "free"),
    [billing?.subscriptionTier]
  );

  const dailyTokenUsagePct = useMemo(() => {
    if (!dailyCredits) {
      return 0;
    }
    const used = Math.max(0, Number(dailyCredits.used || 0));
    const max = Math.max(1, Number(dailyCredits.max || 1));
    return Math.max(0, Math.min(100, Math.round((used / max) * 100)));
  }, [dailyCredits]);

  const serviceBars = useMemo(() => {
    const breakdown = accountStats?.service_breakdown;
    if (!breakdown) {
      return [];
    }
    const items = [
      { key: "chatgpt", label: "ChatGPT", value: Math.max(0, Number(breakdown.chatgpt || 0)) },
      { key: "claude", label: "Claude", value: Math.max(0, Number(breakdown.claude || 0)) },
      { key: "gemini", label: "Gemini", value: Math.max(0, Number(breakdown.gemini || 0)) },
      { key: "unknown", label: "Other", value: Math.max(0, Number(breakdown.unknown || 0)) }
    ];
    const max = Math.max(1, ...items.map((item) => item.value));
    return items.map((item) => ({
      ...item,
      widthPct: Math.max(0, Math.min(100, (item.value / max) * 100))
    }));
  }, [accountStats]);

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
        provider: inferAuthProvider(currentUser),
        updatedAt: serverTimestamp(),
        plan: "free",
        subscriptionTier: "free"
      },
      { merge: true }
    );
  }

  async function handleGoogleSignIn() {
    setError("");
    setAccountNotice("");
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

  async function handleEmailPasswordSignIn() {
    setError("");
    setAccountNotice("");
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const cred = await signInWithEmailAndPassword(
        auth,
        emailAuthEmail.trim(),
        emailAuthPassword
      );
      await reload(cred.user);
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user);
        await signOut(auth);
        setEmailAuthPassword("");
        setEmailAuthPassword2("");
        setAccountNotice("Verify your email before signing in. We sent a new verification link.");
        return;
      }
      await syncUserToFirestore(cred.user);
      setEmailAuthPassword("");
      setEmailAuthPassword2("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailRegister() {
    setError("");
    setAccountNotice("");
    if (emailAuthPassword !== emailAuthPassword2) {
      setError("Passwords do not match.");
      return;
    }
    if (emailAuthPassword.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    const trimmedName = emailAuthName.trim();
    if (!trimmedName) {
      setError("Enter your name.");
      return;
    }
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const cred = await createUserWithEmailAndPassword(
        auth,
        emailAuthEmail.trim(),
        emailAuthPassword
      );
      await updateProfile(cred.user, { displayName: trimmedName });
      await syncUserToFirestore(cred.user);
      await sendEmailVerification(cred.user);
      await signOut(auth);
      setEmailAuthMode("signin");
      setAccountNotice("Account created. Verify your email first, then sign in.");
      setEmailAuthPassword("");
      setEmailAuthPassword2("");
      setEmailAuthName("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendPasswordReset() {
    setError("");
    setAccountNotice("");
    const em = emailAuthEmail.trim();
    if (!em) {
      setError("Enter your email to receive a reset link.");
      return;
    }
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, em);
      setAccountNotice("If an account exists for that email, a reset link was sent.");
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
      setAccountStats(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 pb-24">
      {!user ? (
        <div className="mx-auto flex min-h-[calc(100dvh-12rem)] w-full max-w-sm flex-col items-center justify-center">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Loading…</p>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={busy || loading}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-60"
              >
                <span>{busy ? "Signing in…" : "Sign in with Google"}</span>
                <img src="/images/google-logo.png" alt="" aria-hidden className="h-[18px] w-[18px] shrink-0 object-contain" />
              </button>

              <div className="my-5 flex w-full items-center gap-3">
                <div className="h-px flex-1 bg-line" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-faint">or</span>
                <div className="h-px flex-1 bg-line" aria-hidden />
              </div>

              <div className="w-full rounded-xl border border-line bg-cream p-5 backdrop-blur-md">
                <h2 className="text-center text-base font-semibold text-ink">
                  {emailAuthMode === "signin" ? "Sign in with Email" : "Create account with Email"}
                </h2>
                <div className="mt-4 flex justify-center gap-2 text-xs">
                  <button
                    type="button"
                    className={`rounded-lg px-2 py-1 ${emailAuthMode === "signin" ? "bg-cream-dark text-ink" : "text-faint hover:text-ink"}`}
                    onClick={() => {
                      setEmailAuthMode("signin");
                      setError("");
                      setAccountNotice("");
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-2 py-1 ${emailAuthMode === "register" ? "bg-cream-dark text-ink" : "text-faint hover:text-ink"}`}
                    onClick={() => {
                      setEmailAuthMode("register");
                      setError("");
                      setAccountNotice("");
                    }}
                  >
                    Create account
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="Email"
                    value={emailAuthEmail}
                    onChange={(e) => setEmailAuthEmail(e.target.value)}
                    disabled={busy || loading}
                    className="w-full rounded-lg border border-line bg-cream-dark px-3 py-2 text-sm text-ink placeholder:text-faint/40 outline-none focus:border-line"
                  />
                  {emailAuthMode === "register" ? (
                    <input
                      type="text"
                      autoComplete="name"
                      placeholder="Full name"
                      value={emailAuthName}
                      onChange={(e) => setEmailAuthName(e.target.value)}
                      disabled={busy || loading}
                      className="w-full rounded-lg border border-line bg-cream-dark px-3 py-2 text-sm text-ink placeholder:text-faint/40 outline-none focus:border-line"
                    />
                  ) : null}
                  <input
                    type="password"
                    autoComplete={emailAuthMode === "signin" ? "current-password" : "new-password"}
                    placeholder="Password"
                    value={emailAuthPassword}
                    onChange={(e) => setEmailAuthPassword(e.target.value)}
                    disabled={busy || loading}
                    className="w-full rounded-lg border border-line bg-cream-dark px-3 py-2 text-sm text-ink placeholder:text-faint/40 outline-none focus:border-line"
                  />
                  {emailAuthMode === "register" ? (
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Confirm password"
                      value={emailAuthPassword2}
                      onChange={(e) => setEmailAuthPassword2(e.target.value)}
                      disabled={busy || loading}
                      className="w-full rounded-lg border border-line bg-cream-dark px-3 py-2 text-sm text-ink placeholder:text-faint/40 outline-none focus:border-line"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={emailAuthMode === "signin" ? handleEmailPasswordSignIn : handleEmailRegister}
                    disabled={busy || loading}
                    className="w-full rounded-lg bg-cream-dark py-2 text-sm font-semibold text-ink hover:bg-cream-deep disabled:opacity-60"
                  >
                    {busy ? "Working…" : emailAuthMode === "signin" ? "Sign in with email" : "Create account"}
                  </button>
                  {emailAuthMode === "signin" ? (
                    <button
                      type="button"
                      onClick={handleSendPasswordReset}
                      disabled={busy || loading}
                      className="w-full text-center text-[11px] text-faint hover:text-ink disabled:opacity-60"
                    >
                      Forgot password?
                    </button>
                  ) : null}
                </div>
              </div>

              {extensionMode ? (
                <Link
                  href="/account"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-line px-4 py-2.5 text-sm text-faint hover:bg-cream-dark"
                >
                  Full account page
                </Link>
              ) : null}

              {!user && permissionInlineMessages.length ? (
                <p className="mt-6 w-full text-center text-[10px] leading-relaxed text-faint">
                  {permissionInlineMessages.join(" · ")}
                </p>
              ) : null}

              {error && !isPermissionLikeMessage(error) ? (
                <div className="mt-4 w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
              {accountNotice ? (
                <div className="mt-4 w-full rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
                  {accountNotice}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {user && permissionInlineMessages.length ? (
        <p className="mb-6 max-w-md text-[10px] leading-relaxed text-faint">
          {permissionInlineMessages.join(" · ")}
        </p>
      ) : null}

      {user && error && !isPermissionLikeMessage(error) ? (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {user && accountNotice ? (
        <div className="mb-6 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
          {accountNotice}
        </div>
      ) : null}

      {user ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-cream p-4 backdrop-blur-md sm:p-5">
            <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Account</h2>

            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] grid-rows-2 gap-x-4 gap-y-3 sm:gap-x-8 sm:gap-y-3">
              <div className="col-start-1 row-start-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint sm:text-sm">
                  Name
                </p>
                <p className="mt-1.5 truncate text-base font-semibold text-ink sm:text-lg">
                  {user.displayName || "—"}
                </p>
              </div>

              <div className="col-start-2 row-start-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint sm:text-sm">
                  Member since
                </p>
                <p className="mt-1.5 text-base font-semibold text-muted sm:text-lg">{formatJoinDate(user)}</p>
                <p className="mt-2 text-sm font-semibold text-ink sm:text-base">
                  {billingLoading && !billing ? "Loading plan…" : currentPlanLabel}
                </p>
              </div>

              <div className="col-start-3 row-span-2 row-start-1 flex min-w-[9.25rem] flex-col gap-2 self-stretch justify-self-end sm:min-w-[11rem]">
                <button
                  type="button"
                  onClick={async () => {
                    await Promise.all([loadBilling(user), loadAccountStats(user), loadDailyCredits(user)]);
                  }}
                  disabled={billingLoading || accountStatsLoading || dailyCreditsLoading}
                  className="rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-muted hover:bg-cream-dark disabled:opacity-60"
                >
                  {billingLoading || accountStatsLoading || dailyCreditsLoading
                    ? "Refreshing…"
                    : "Refresh account data"}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={busy}
                  className="rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-faint hover:bg-cream-dark disabled:opacity-60"
                >
                  Sign out
                </button>
                {extensionMode ? (
                  <Link
                    href="/account"
                    className="inline-flex items-center justify-center rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-faint hover:bg-cream-dark"
                  >
                    Full account page
                  </Link>
                ) : null}
              </div>

              <div className="col-start-1 row-start-2 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint sm:text-sm">Email</p>
                <p className="mt-1.5 break-all text-base text-muted sm:text-lg">{user.email || "—"}</p>
              </div>

              {/* Intentionally empty grid cell */}
              <div className="col-start-2 row-start-2" aria-hidden="true" />
            </div>

            {permissionInlineMessages.length ? (
              <p className="mt-3 max-w-xl text-[10px] leading-relaxed text-faint">
                {permissionInlineMessages.join(" · ")}
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-line bg-cream px-4 py-3 sm:px-6 sm:py-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Daily token usage</p>
              {dailyCredits ? (
                <p className="text-[11px] font-medium text-muted">
                  {Math.max(0, Math.floor(Number(dailyCredits.used || 0))).toLocaleString()} /{" "}
                  {Math.max(1, Math.floor(Number(dailyCredits.max || 1))).toLocaleString()}
                </p>
              ) : dailyCreditsLoading ? (
                <p className="text-[11px] text-faint">Loading…</p>
              ) : (
                <p className="text-[11px] text-faint">—</p>
              )}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cream-dark">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-300 ease-out"
                style={{ width: `${dailyTokenUsagePct}%` }}
              />
            </div>
            {dailyCreditsError ? (
              <p className="mt-2 text-[10px] text-amber-700/90">{dailyCreditsError}</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-line bg-cream p-6 backdrop-blur-md sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Prompt stats</h2>
                <p className="mt-1 text-xs text-faint">Last 14 days — summary only</p>
              </div>
              {!extensionMode ? (
                <Link
                  href="/account/statistics"
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-line bg-cream-dark px-3 py-2 text-xs font-semibold text-ink hover:bg-cream-dark"
                >
                  See full statistics
                </Link>
              ) : (
                <Link
                  href="/account/statistics"
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-cream-dark"
                  target="_blank"
                  rel="noreferrer"
                >
                  Statistics (opens in tab)
                </Link>
              )}
            </div>

            {accountStatsError && !isPermissionLikeMessage(accountStatsError) ? (
              <p className="mt-4 text-sm text-amber-200/90">{accountStatsError}</p>
            ) : accountStatsLoading && !accountStats ? (
              <p className="mt-4 text-sm text-faint">Loading usage stats…</p>
            ) : accountStats ? (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-line bg-cream-dark p-4">
                    <p className="text-xs uppercase tracking-wider text-faint">Prompts sent</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">{accountStats.totals.prompts.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-line bg-cream-dark p-4">
                    <p className="text-xs uppercase tracking-wider text-faint">Avg response time</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {formatDurationMs(accountStats.averages.response_time_ms)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-cream-dark p-4">
                    <p className="text-xs uppercase tracking-wider text-faint">Active days</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">{accountStats.streaks.active_days}</p>
                  </div>
                  <div className="rounded-xl border border-line bg-cream-dark p-4">
                    <p className="text-xs uppercase tracking-wider text-faint">Busiest day</p>
                    <p className="mt-2 text-base font-semibold text-ink">
                      {accountStats.streaks.busiest_day || "—"}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      {accountStats.streaks.busiest_day_prompts.toLocaleString()} prompts
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-line bg-cream-dark p-4">
                    <p className="text-xs uppercase tracking-wider text-faint">By AI service</p>
                    <div className="mt-4 space-y-3">
                      {serviceBars.map((item) => (
                        <div key={item.key}>
                          <div className="mb-1 flex items-center justify-between text-xs text-muted">
                            <span>{item.label}</span>
                            <span>{item.value.toLocaleString()}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-cream-dark">
                            <div
                              className="h-2 rounded-full bg-ink transition-all"
                              style={{ width: `${item.widthPct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-line bg-cream-dark p-4">
                    <p className="text-xs uppercase tracking-wider text-faint">Daily prompt volume</p>
                    <div className="mt-4 flex h-28 items-end gap-1.5">
                      {(() => {
                        const maxPrompts = Math.max(1, ...accountStats.timeline.map((d) => d.prompts));
                        return accountStats.timeline.map((day) => (
                          <div key={day.day} className="group flex-1">
                            <div
                              className="w-full rounded-t-sm bg-ink transition-all hover:bg-neutral-700"
                              style={{ height: `${Math.max(8, (day.prompts / maxPrompts) * 100)}%` }}
                              title={`${day.day}: ${day.prompts} prompts`}
                            />
                          </div>
                        ));
                      })()}
                    </div>
                    <p className="mt-2 text-xs text-faint">
                      Avg prompts/active day: {accountStats.averages.prompts_per_active_day}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      Avg tokens/prompt: {accountStats.averages.tokens_per_prompt}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-faint">No usage stats yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-cream p-6 backdrop-blur-md sm:p-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">
                Subscription
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {billing ? (
                  <button
                    type="button"
                    onClick={() => setShowBillingDetails((prev) => !prev)}
                    className="inline-flex items-center justify-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-muted hover:bg-cream-dark"
                  >
                    {showBillingDetails ? "Hide billing details" : "Show billing details"}
                  </button>
                ) : null}
                {billing?.billingPortalAvailable ? (
                  <button
                    type="button"
                    onClick={() => user && openStripeCustomerPortal(user)}
                    disabled={portalBusy || !user}
                    className="inline-flex items-center justify-center rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-60"
                  >
                    {portalBusy ? "Opening portal…" : "Manage subscription & cards"}
                  </button>
                ) : null}
              </div>
            </div>
            <p className="mt-4 text-sm text-faint">
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
                        ? "border-ink bg-cream-dark shadow-[0_10px_30px_rgba(124,58,237,0.18)]"
                        : isPopular
                          ? "border-amber-300/45 bg-amber-500/[0.08] shadow-[0_10px_28px_rgba(245,158,11,0.15)]"
                          : "border-line bg-cream-dark"
                    }`}
                  >
                    {isPopular ? (
                      <span className="absolute -top-2.5 left-3 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black">
                        Popular
                      </span>
                    ) : null}
                    {isCurrent ? (
                      <span className="absolute -top-2.5 right-3 rounded-full bg-ink px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cream">
                        Current plan
                      </span>
                    ) : null}
                    <h3 className="text-lg font-semibold text-ink">{plan.name}</h3>
                    {plan.key === "pro" || plan.key === "student" ? (
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                        Free trial
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm font-semibold text-muted">{plan.price}</p>
                    <p className="mt-2 text-xs text-faint">{plan.subtitle}</p>
                    <ul className="mt-3 space-y-1.5 text-xs text-muted">
                      {plan.details.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="text-faint">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[11px] text-faint">
                      <span className="font-semibold text-muted">Ideal for:</span> {plan.idealFor}
                    </p>

                    <div className="mt-auto pt-4">
                      {isCurrent ? (
                        <button
                          type="button"
                          disabled
                          className="inline-flex w-full items-center justify-center rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted opacity-90"
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
                          className="inline-flex w-full items-center justify-center rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-cream hover:bg-neutral-800 disabled:opacity-60"
                        >
                          {checkoutBusyTier === plan.key ? "Redirecting…" : `Choose ${plan.name}`}
                        </button>
                      ) : plan.key === "free" && billing?.billingPortalAvailable ? (
                        <button
                          type="button"
                          onClick={() => user && openStripeCustomerPortal(user)}
                          disabled={portalBusy}
                          className="inline-flex w-full items-center justify-center rounded-lg border border-line px-3 py-2 text-xs font-semibold text-faint hover:bg-cream-dark disabled:opacity-60"
                        >
                          {portalBusy ? "Opening portal…" : "Downgrade in billing portal"}
                        </button>
                      ) : paidTier ? (
                        <button
                          type="button"
                          disabled
                          className="inline-flex w-full items-center justify-center rounded-lg border border-line px-3 py-2 text-xs font-semibold text-faint"
                        >
                          Checkout not configured
                        </button>
                      ) : (
                        <Link
                          href="/product#pricing"
                          className="inline-flex w-full items-center justify-center rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-cream-dark"
                        >
                          View plan details
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {billingError && !isPermissionLikeMessage(billingError) ? (
              <p className="mt-4 text-sm text-amber-200/90">{billingError}</p>
            ) : billingLoading && !billing ? (
              <p className="mt-4 text-sm text-faint">Loading subscription…</p>
            ) : billing ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-line bg-cream-dark p-4">
                  <p className="text-xs uppercase tracking-wider text-faint">Current plan</p>
                  <p className="mt-2 text-xl font-semibold text-ink">{tierLabel(billing.subscriptionTier)}</p>
                  <p className="mt-1 text-xs text-faint capitalize">
                    Status: {billing.subscriptionStatus.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-cream-dark p-4">
                  <p className="text-xs uppercase tracking-wider text-faint">Billing period</p>
                  <p className="mt-2 text-sm text-muted">
                    {billing.currentPeriodEnd
                      ? `Renews or ends ${new Date(billing.currentPeriodEnd).toLocaleString()}`
                      : "—"}
                  </p>
                  {showBillingDetails && billing.nextInvoiceAmount != null ? (
                    <p className="mt-1 text-xs text-faint">
                      Next invoice: {(billing.nextInvoiceAmount / 100).toFixed(2)} {billing.currency}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-line bg-cream-dark p-4 sm:col-span-2 lg:col-span-1">
                  <p className="text-xs uppercase tracking-wider text-faint">Stripe</p>
                  <p className="mt-2 text-xs text-faint">
                    {billing.stripeConfigured
                      ? "Webhook: POST /api/webhooks/stripe — syncs subscription and invoices to Firestore."
                      : "Set STRIPE_SECRET_KEY and price IDs to enable Checkout and the customer portal."}
                  </p>
                </div>
              </div>
            ) : null}
            {billing?.billingPortalAvailable ? (
              <div className="mt-6 border-t border-line pt-4 text-right">
                <button
                  type="button"
                  onClick={() => user && openStripeCustomerPortal(user)}
                  disabled={portalBusy}
                  className="text-xs text-faint underline-offset-2 hover:text-faint hover:underline disabled:opacity-60"
                >
                  Need to cancel or change renewal? Open billing portal
                </button>
              </div>
            ) : null}
          </section>

          {showBillingDetails ? (
            <section className="rounded-2xl border border-line bg-cream p-6 backdrop-blur-md sm:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Payment method</h2>
            {billing?.paymentMethod ? (
              <div className="mt-6 flex max-w-md items-center gap-4 rounded-xl border border-line bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-4">
                <div className="flex h-10 w-14 items-center justify-center rounded-md bg-cream-dark text-xs font-bold text-ink">
                  {billing.paymentMethod.brand.slice(0, 4).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-ink">
                    {billing.paymentMethod.brand} ···· {billing.paymentMethod.last4}
                  </p>
                  <p className="text-xs text-faint">
                    {billing.paymentMethod.expMonth && billing.paymentMethod.expYear
                      ? `Expires ${billing.paymentMethod.expMonth}/${billing.paymentMethod.expYear}`
                      : "Card on file"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-faint">
                No card on file yet. After you complete Stripe Checkout, the default card will show here when the
                webhook syncs payment method details.
              </p>
            )}
            {billing?.billingPortalAvailable ? (
              <p className="mt-4 text-xs text-faint/60">
                Update cards in the{" "}
                <button
                  type="button"
                  onClick={() => user && openStripeCustomerPortal(user)}
                  disabled={portalBusy}
                  className="text-faint underline-offset-2 hover:underline disabled:opacity-60"
                >
                  Stripe customer portal
                </button>
                .
              </p>
            ) : null}
            </section>
          ) : (
            <section className="rounded-2xl border border-line bg-cream p-6 backdrop-blur-md sm:p-8">
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Billing details</h2>
              <p className="mt-4 text-sm text-faint">
                Billing amounts, card details, and invoice history are hidden by default.
              </p>
              <button
                type="button"
                onClick={() => setShowBillingDetails(true)}
                className="mt-4 inline-flex items-center justify-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-muted hover:bg-cream-dark"
              >
                Show billing details
              </button>
            </section>
          )}

          {showBillingDetails ? (
            <section className="rounded-2xl border border-line bg-cream p-6 backdrop-blur-md sm:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Payments</h2>
            {billing && Array.isArray(billing.payments) && billing.payments.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-line text-faint">
                    <tr>
                      <th className="pb-3 pr-4 font-medium">Date</th>
                      <th className="pb-3 pr-4 font-medium">Description</th>
                      <th className="pb-3 pr-4 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    {billing.payments.map((p, i) => (
                      <tr key={p.id || i} className="border-b border-line">
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
              <p className="mt-4 text-sm text-faint">
                No payments recorded. Webhook handlers can append rows to{" "}
                <code className="rounded bg-cream-dark px-1 text-xs text-faint">billingPayments</code> on your user
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
