"use client";

import { getFirebaseAuth } from "@/lib/firebaseClient";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User
} from "firebase/auth";
import { syncPromptlyUserDoc } from "@/lib/promptlyUserSync";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AutoDismissNoticeBar } from "@/components/ui/AutoDismissNoticeBar";
import {
  buildExtensionSessionPayload,
  getPromptlyExtensionCandidateIds,
  rememberPromptlyExtensionId,
  sendPromptlyExtensionMessageToCandidates
} from "@/lib/extensionBridge";
import {
  emailFromGoogleCredentialError,
  preflightEmailRegistration,
  resolveEmailRegistrationError,
  resolveEmailSignInError,
  resolveGoogleSignInError,
  type AuthProviderHint
} from "@/lib/firebaseAuthAccountHints";
import { EmailVerificationNotice } from "@/components/auth/EmailVerificationNotice";
import { AccountPromptVolumeChart } from "@/components/account/AccountPromptVolumeChart";
import { listenForGoogleSignInReturn, signInWithGoogleInteractive } from "@/lib/firebaseGoogleAuth";
import { useEmailVerificationStatus } from "@/lib/useEmailVerificationStatus";
import { ACCOUNT_PLANS, isPaidPlanKey, type PaidPlanKey } from "@/lib/plans";
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
  reset_at?: string;
  reset_in_seconds?: number;
  reset_in_hours?: number;
  reset_in_days?: number;
  reset_label?: string;
};

export function AccountClient({ extensionMode = false }: { extensionMode?: boolean }) {
  const searchParams = useSearchParams();
  const extensionIdFromUrl = extensionMode ? String(searchParams.get("extension_id") || "").trim() : "";
  const signinCsrfFromUrl = extensionMode ? String(searchParams.get("signin_csrf") || "").trim() : "";
  const [user, setUser] = useState<User | null>(null);
  const {
    uiStatus: verificationUiStatus,
    trackedEmail: verificationEmail,
    notifyVerificationSent,
    notifyVerified,
    resetVerificationStatus
  } = useEmailVerificationStatus(user);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [billing, setBilling] = useState<BillingPayload | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
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
  const [authProviderHint, setAuthProviderHint] = useState<AuthProviderHint>(null);

  function clearAuthGuidance() {
    setAuthProviderHint(null);
  }

  function applyAuthGuidance(message: string, hint: AuthProviderHint) {
    setError("");
    setAccountNotice(message);
    setAuthProviderHint(hint);
    if (hint === "use-email") {
      setEmailAuthMode("signin");
    }
  }

  useEffect(() => {
    if (extensionIdFromUrl) {
      rememberPromptlyExtensionId(extensionIdFromUrl);
    }
  }, [extensionIdFromUrl]);

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

  const syncExtensionSession = useCallback(async (current: User) => {
    const candidateIds = getPromptlyExtensionCandidateIds(extensionIdFromUrl || undefined);
    if (!candidateIds.length) {
      return;
    }
    try {
      const extras: Record<string, string> = {};
      if (signinCsrfFromUrl) {
        extras.signin_csrf = signinCsrfFromUrl;
      }
      const payload = await buildExtensionSessionPayload(current, extras);
      const { response } = await sendPromptlyExtensionMessageToCandidates(candidateIds, payload);
      const r = response as { ok?: boolean } | undefined;
      if (r && r.ok === false) {
        return;
      }
    } catch (_error) {
      // Extension may not be installed; ignore.
    }
  }, [extensionIdFromUrl, signinCsrfFromUrl]);

  useEffect(() => {
    return listenForGoogleSignInReturn({
      onSuccess: () => {
        resetVerificationStatus();
        setAccountNotice("Signed in with Google.");
        setBusy(false);
      },
      onError: (message) => {
        const resolved = resolveGoogleSignInError(new Error(message));
        if (resolved.hint) {
          applyAuthGuidance(resolved.message, resolved.hint);
        } else {
          setError(resolved.message);
        }
        setBusy(false);
      },
      onSettled: () => setBusy(false)
    });
  }, [resetVerificationStatus]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (nextUser) {
        setBusy(false);
        void syncExtensionSession(nextUser);
        await Promise.all([loadBilling(nextUser), loadDailyCredits(nextUser)]);
      } else {
        setBilling(null);
        setDailyCredits(null);
      }
    });
    return () => unsub();
  }, [loadBilling, loadDailyCredits, syncExtensionSession]);

  const permissionInlineMessages = useMemo(() => {
    const msgs: string[] = [];
    for (const raw of [error, billingError]) {
      const s = String(raw || "").trim();
      if (!s || !isPermissionLikeMessage(s)) continue;
      if (!msgs.includes(s)) msgs.push(s);
    }
    return msgs;
  }, [error, billingError]);

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

  const weeklyTokenResetLabel = useMemo(() => {
    if (!dailyCredits) {
      return "";
    }
    const label = String(dailyCredits.reset_label || "").trim();
    if (label) {
      return label;
    }
    const resetDays = Math.max(0, Math.ceil(Number(dailyCredits.reset_in_days || 0)));
    if (resetDays > 0) {
      return `${resetDays}d until reset`;
    }
    const resetHours = Math.max(0, Math.ceil(Number(dailyCredits.reset_in_hours || 0)));
    return resetHours > 0 ? `${resetHours}h until reset` : "";
  }, [dailyCredits]);

  const dailyTokenUsagePct = useMemo(() => {
    if (!dailyCredits) {
      return 0;
    }
    const used = Math.max(0, Number(dailyCredits.used || 0));
    const max = Math.max(1, Number(dailyCredits.max || 1));
    return Math.max(0, Math.min(100, Math.round((used / max) * 100)));
  }, [dailyCredits]);

  async function syncUserToFirestore(currentUser: User) {
    await syncPromptlyUserDoc(currentUser);
  }

  async function handleGoogleSignIn() {
    setError("");
    setAccountNotice("");
    clearAuthGuidance();
    setBusy(true);
    let openedTab = false;
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const flow = await signInWithGoogleInteractive(returnTo);
      if (flow.status === "success") {
        resetVerificationStatus();
        await syncUserToFirestore(flow.user);
        setAccountNotice("Signed in with Google.");
      } else if (flow.status === "cancelled") {
        setError("Google sign-in was cancelled.");
      } else {
        openedTab = true;
      }
    } catch (e) {
      const resolved = resolveGoogleSignInError(e);
      const conflictEmail = emailFromGoogleCredentialError(e);
      if (conflictEmail) {
        setEmailAuthEmail(conflictEmail);
      }
      if (resolved.hint) {
        applyAuthGuidance(resolved.message, resolved.hint);
      } else {
        setError(resolved.message);
      }
    } finally {
      if (!openedTab) setBusy(false);
    }
  }

  async function handleEmailPasswordSignIn() {
    setError("");
    setAccountNotice("");
    clearAuthGuidance();
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const email = emailAuthEmail.trim();
      const cred = await signInWithEmailAndPassword(
        auth,
        email,
        emailAuthPassword
      );
      await reload(cred.user);
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user);
        notifyVerificationSent(email);
        setEmailAuthPassword("");
        setEmailAuthPassword2("");
        return;
      }
      notifyVerified(cred.user.email || email);
      await syncUserToFirestore(cred.user);
      setEmailAuthPassword("");
      setEmailAuthPassword2("");
    } catch (e) {
      const resolved = await resolveEmailSignInError(getFirebaseAuth(), emailAuthEmail.trim(), e);
      if (resolved.hint) {
        applyAuthGuidance(resolved.message, resolved.hint);
      } else {
        setError(resolved.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailRegister() {
    setError("");
    setAccountNotice("");
    clearAuthGuidance();
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
      const email = emailAuthEmail.trim();
      const preflight = await preflightEmailRegistration(auth, email);
      if (preflight?.blocked) {
        applyAuthGuidance(preflight.message, preflight.hint);
        return;
      }
      const cred = await createUserWithEmailAndPassword(
        auth,
        email,
        emailAuthPassword
      );
      await updateProfile(cred.user, { displayName: trimmedName });
      await syncUserToFirestore(cred.user);
      await sendEmailVerification(cred.user);
      setEmailAuthMode("signin");
      notifyVerificationSent(email);
      setEmailAuthPassword("");
      setEmailAuthPassword2("");
      setEmailAuthName("");
    } catch (e) {
      const resolved = await resolveEmailRegistrationError(getFirebaseAuth(), emailAuthEmail.trim(), e);
      if (resolved.hint) {
        applyAuthGuidance(resolved.message, resolved.hint);
      } else {
        setError(resolved.message);
      }
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
      resetVerificationStatus();
      setBilling(null);
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
                className={`inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-60 ${
                  authProviderHint === "use-google" ? "ring-2 ring-emerald-500/40 ring-offset-2 ring-offset-page" : ""
                }`}
              >
                <span>{busy ? "Waiting for Google…" : "Sign in with Google"}</span>
                <img src="/images/google-logo.png" alt="" aria-hidden className="h-[18px] w-[18px] shrink-0 object-contain" />
              </button>

              <div className="my-5 flex w-full items-center gap-3">
                <div className="h-px flex-1 bg-line" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-faint">or</span>
                <div className="h-px flex-1 bg-line" aria-hidden />
              </div>

              <div
                className={`w-full rounded-xl border border-line bg-cream p-5 backdrop-blur-md ${
                  authProviderHint === "use-email" ? "ring-2 ring-emerald-500/40" : ""
                }`}
              >
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
                      clearAuthGuidance();
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
                      clearAuthGuidance();
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
              {verificationUiStatus !== "none" && verificationEmail ? (
                <EmailVerificationNotice status={verificationUiStatus} email={verificationEmail} className="mt-4 w-full" />
              ) : accountNotice ? (
                <AutoDismissNoticeBar
                  key={accountNotice}
                  className="mt-4 w-full"
                  innerClassName={`w-full rounded-xl border px-4 py-3 text-sm ${
                    authProviderHint
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-900"
                      : "border-emerald-500/25 bg-emerald-500/10 text-emerald-800"
                  }`}
                >
                  {accountNotice}
                </AutoDismissNoticeBar>
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
      {user && verificationUiStatus !== "none" && verificationEmail ? (
        <EmailVerificationNotice status={verificationUiStatus} email={verificationEmail} className="mb-6" />
      ) : null}
      {user && accountNotice && verificationUiStatus === "none" ? (
        <AutoDismissNoticeBar
          key={accountNotice}
          innerClassName="mb-6 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800"
        >
          {accountNotice}
        </AutoDismissNoticeBar>
      ) : null}

      {user ? (
        <div className="space-y-6">
          <section
            data-onboarding-tour="account-section"
            className="rounded-2xl border border-line bg-cream p-4 backdrop-blur-md sm:p-5"
          >
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
              </div>

              <div className="col-start-3 row-span-2 row-start-1 flex min-w-[9.25rem] flex-col gap-2 self-stretch justify-self-end sm:min-w-[11rem]">
                <Link
                  href="/account/install-integrations"
                  className="inline-flex items-center justify-center rounded-lg bg-ink px-3 py-2.5 text-center text-sm font-semibold text-cream hover:bg-neutral-800"
                >
                  Install more integrations
                </Link>
                <Link
                  href="/account/troubleshoot-integrations"
                  className="inline-flex items-center justify-center rounded-lg border border-line px-3 py-2.5 text-center text-sm font-medium text-muted hover:bg-cream-dark hover:text-ink"
                >
                  Troubleshoot integrations
                </Link>
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

              <div className="col-start-2 row-start-2 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint sm:text-sm">Plan</p>
                <p className="mt-1.5 text-base text-muted sm:text-lg">
                  {billingLoading && !billing ? "Loading…" : currentPlanLabel}
                </p>
              </div>
            </div>

            {permissionInlineMessages.length ? (
              <p className="mt-3 max-w-xl text-[10px] leading-relaxed text-faint">
                {permissionInlineMessages.join(" · ")}
              </p>
            ) : null}
          </section>

          <section
            data-onboarding-tour="account-token-usage"
            className="rounded-2xl border border-line bg-cream px-4 py-3 sm:px-6 sm:py-3.5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Weekly token usage</p>
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
            {weeklyTokenResetLabel ? (
              <p className="mt-2 text-[10px] text-faint">{weeklyTokenResetLabel}</p>
            ) : null}
            {dailyCreditsError ? (
              <p className="mt-2 text-[10px] text-amber-700/90">{dailyCreditsError}</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-line bg-cream p-6 backdrop-blur-md sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Prompt stats</h2>
                <p className="mt-1 text-xs text-faint">Past 7 days</p>
              </div>
              {!extensionMode ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link
                    href="/account/statistics"
                    data-onboarding-tour="statistics-link"
                    className="inline-flex items-center justify-center rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-cream hover:bg-neutral-800"
                  >
                    See full statistics
                  </Link>
                </div>
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

            {user ? (
              <AccountPromptVolumeChart user={user} />
            ) : null}
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
              Select from currently available plans.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {ACCOUNT_PLANS.filter((plan) => plan.available).map((plan) => {
                const isCurrent = currentTierKey === plan.key;
                const isPopular = Boolean(plan.featured);
                const paidTier = isPaidPlanKey(plan.key);
                const canCheckoutPaidTier = Boolean(user && billing?.stripeConfigured && paidTier && !isCurrent);

                return (
                  <article
                    key={plan.key}
                    className={`relative flex h-full min-h-[320px] flex-col rounded-xl border p-4 sm:min-h-[340px] ${
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
                    <p className="mt-1 text-sm font-semibold text-muted">{plan.priceDisplay}</p>
                    <p className="mt-2 text-xs text-faint">{plan.subtitle}</p>
                    <ul className="mt-3 min-h-[5.75rem] flex-1 space-y-1.5 text-xs leading-relaxed text-muted">
                      {plan.details.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="shrink-0 text-faint">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>

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
                            startStripeCheckoutForTier(user, plan.key as PaidPlanKey)
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
                          href="/#pricing"
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
                      : "Stripe checkout uses price IDs from lib/server/stripe.ts — set STRIPE_SECRET_KEY to enable billing."}
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
