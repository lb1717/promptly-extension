"use client";

import { getFirebaseAuth } from "@/lib/firebaseClient";
import { syncPromptlyUserDoc } from "@/lib/promptlyUserSync";
import { SITE } from "@/lib/constants";
import { syncWebsiteSessionToExtension } from "@/lib/extensionBridge";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  updateProfile,
  User
} from "firebase/auth";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  preflightEmailRegistration,
  resolveEmailRegistrationError,
  resolveEmailSignInError,
  resolveGoogleSignInError
} from "@/lib/firebaseAuthAccountHints";
import { listenForGoogleSignInReturn, signInWithGoogleInteractive } from "@/lib/firebaseGoogleAuth";
import { EmailVerificationNotice } from "@/components/auth/EmailVerificationNotice";
import { GetStartedAiSelection } from "@/components/onboarding/GetStartedAiSelection";
import { GetStartedPromptlyInstall } from "@/components/onboarding/GetStartedPromptlyInstall";
import { OnboardingBrowserExtensionInstall } from "@/components/onboarding/OnboardingBrowserExtensionInstall";
import { OnboardingDoneStep } from "@/components/onboarding/OnboardingDoneStep";
import { OnboardingInstallOsToggle } from "@/components/onboarding/OnboardingInstallOsToggle";
import { canFinishOnboardingInstall, activeOnboardingInstallSegments, onboardingInstallStepNumber } from "@/lib/onboardingInstallProgress";
import type { OsId } from "@/components/integrations/integrationOs";
import {
  DEFAULT_ONBOARDING_PRODUCT_SELECTION,
  hasAnyCodingAgent,
  hasAnyOnboardingProduct,
  selectedCodingAgentIds,
  type OnboardingProductSelection
} from "@/lib/onboardingProducts";
import { canProceedWithEmailAccount } from "@/lib/emailVerification";
import { useEmailVerificationStatus } from "@/lib/useEmailVerificationStatus";
import { GET_STARTED_PLANS, WEBSITE_PLANS, type PaidPlanKey, type PlanKey } from "@/lib/plans";
import {
  detectAuthTransition,
  markAuthHydrated,
  shouldAdvanceAfterAccountAuth,
  welcomeContinueStep
} from "@/lib/onboardingStepFlow";

const STEPS = ["Start", "Account", "Connect", "Install", "Plan", "Done"] as const;
const ACCOUNT_STEP = 2;
const CHOOSE_AI_STEP = 3;
const INSTALL_STEP = 4;
const PLAN_STEP = 5;
const DONE_STEP = 6;

function advanceAfterAccountAuth(goToStep: (next: number) => void) {
  goToStep(CHOOSE_AI_STEP);
}

type BillingPayload = {
  subscriptionTier: string;
  subscriptionStatus: string;
  stripeConfigured: boolean;
};

type CheckoutStatus = {
  loading: boolean;
  stripeConfigured: boolean;
};

function normalizeTier(raw: string): PlanKey | "other" {
  const t = raw.toLowerCase();
  if (t === "free") return "free";
  if (t === "enterprise") return "enterprise";
  if (t === "pro" || t === "plus" || t === "professional") return "pro";
  if (t === "student") return "student";
  return "other";
}

function planNameForTier(tier: PlanKey): string {
  return WEBSITE_PLANS.find((plan) => plan.key === tier)?.name ?? tier;
}

function isActivePaidTier(
  billing: BillingPayload | null,
  tier: PlanKey | "other"
): tier is Exclude<PlanKey, "free"> {
  if (!billing || tier === "free" || tier === "other") return false;
  const status = String(billing.subscriptionStatus || "").toLowerCase();
  if (status && status !== "active" && status !== "trialing") return false;
  return tier === "student" || tier === "pro" || tier === "enterprise";
}

function upgradeOptionsForTier(tier: Exclude<PlanKey, "free" | "enterprise">): PaidPlanKey[] {
  if (tier === "student") return ["pro", "enterprise"];
  if (tier === "pro") return ["enterprise"];
  return [];
}

export function GeneralOnboardingClient() {
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");

  const [step, setStep] = useState(1);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("pro");
  const [billing, setBilling] = useState<BillingPayload | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>({
    loading: true,
    stripeConfigured: false
  });
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [browserStoreClicked, setBrowserStoreClicked] = useState(false);
  const [productSelection, setProductSelection] = useState<OnboardingProductSelection>(
    DEFAULT_ONBOARDING_PRODUCT_SELECTION
  );
  const [installCommandCopied, setInstallCommandCopied] = useState(false);
  const [installOs, setInstallOs] = useState<OsId>("mac");

  const [emailAuthMode, setEmailAuthMode] = useState<"signin" | "register">("register");
  const [emailAuthEmail, setEmailAuthEmail] = useState("");
  const [emailAuthPassword, setEmailAuthPassword] = useState("");
  const [emailAuthPassword2, setEmailAuthPassword2] = useState("");
  const [emailAuthName, setEmailAuthName] = useState("");

  const authHydratedRef = useRef(false);
  const prevUserRef = useRef<User | null>(null);

  const {
    uiStatus: verificationUiStatus,
    trackedEmail: verificationEmail,
    notifyVerificationSent,
    notifyVerified,
    resetVerificationStatus
  } = useEmailVerificationStatus(user);

  const currentTier = useMemo(() => normalizeTier(billing?.subscriptionTier || "free"), [billing?.subscriptionTier]);

  const activePaidTier = useMemo((): Exclude<PlanKey, "free"> | null => {
    if (billingLoading || !isActivePaidTier(billing, currentTier)) return null;
    return currentTier;
  }, [billing, billingLoading, currentTier]);

  const planUpgradeOptions = useMemo(() => {
    if (!activePaidTier || activePaidTier === "enterprise") return [];
    return upgradeOptionsForTier(activePaidTier);
  }, [activePaidTier]);

  const wantsWeb = productSelection.web;
  const wantsDesktopApps = productSelection.desktop_apps;
  const installSegments = useMemo(
    () => activeOnboardingInstallSegments(productSelection),
    [productSelection]
  );

  const canFinishInstall = useMemo(
    () =>
      canFinishOnboardingInstall({
        wantsWeb,
        wantsDesktopApps,
        browserStoreClicked,
        installCommandCopied
      }),
    [wantsWeb, wantsDesktopApps, browserStoreClicked, installCommandCopied]
  );

  const noteInstallCommandCopy = useCallback(() => {
    setInstallCommandCopied(true);
  }, []);

  const handleInstallOsChange = useCallback((next: OsId) => {
    setInstallOs(next);
    setInstallCommandCopied(false);
  }, []);

  const goToStep = useCallback((next: number) => {
    setStep(next);
  }, []);

  useEffect(() => {
    return listenForGoogleSignInReturn({
      onSuccess: () => {
        resetVerificationStatus();
        setNotice("Signed in with Google.");
        setBusy(false);
        const current = getFirebaseAuth().currentUser;
        if (shouldAdvanceAfterAccountAuth(current, step, ACCOUNT_STEP)) {
          advanceAfterAccountAuth(goToStep);
        }
      },
      onError: (message) => {
        setError(message);
        setBusy(false);
      },
      onSettled: () => setBusy(false)
    });
  }, [goToStep, resetVerificationStatus, step]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setAuthLoading(false);
      if (next) setBusy(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/status", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setCheckoutStatus({ loading: false, stripeConfigured: Boolean(data.stripeConfigured) });
        }
      } catch {
        if (!cancelled) setCheckoutStatus({ loading: false, stripeConfigured: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadBilling = useCallback(async (currentUser: User) => {
    setBillingLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/account/billing", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setBilling(data as BillingPayload);
      else setBilling(null);
    } catch {
      setBilling(null);
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setBilling(null);
      setBillingLoading(false);
      return;
    }
    loadBilling(user);
  }, [user, loadBilling]);

  useEffect(() => {
    if (authLoading) return;

    if (checkoutResult === "success") {
      goToStep(DONE_STEP);
      return;
    }

    if (step === DONE_STEP) return;

    if (markAuthHydrated(authHydratedRef, prevUserRef, user)) return;

    const { justSignedIn, justSignedOut } = detectAuthTransition(prevUserRef, user);

    if ((justSignedOut || !user) && step > ACCOUNT_STEP) {
      goToStep(ACCOUNT_STEP);
      return;
    }

    if (justSignedIn && shouldAdvanceAfterAccountAuth(user, step, ACCOUNT_STEP)) {
      advanceAfterAccountAuth(goToStep);
    }
  }, [user, authLoading, checkoutResult, goToStep, step]);

  useEffect(() => {
    if (verificationUiStatus !== "verified" || !user || step !== ACCOUNT_STEP) return;
    if (!canProceedWithEmailAccount(user)) return;
    const timer = window.setTimeout(() => advanceAfterAccountAuth(goToStep), 800);
    return () => window.clearTimeout(timer);
  }, [verificationUiStatus, user, step, goToStep]);

  useEffect(() => {
    if (step !== 4 || !user) return;
    let cancelled = false;
    const check = async () => {
      const ok = await syncWebsiteSessionToExtension(user);
      if (!cancelled && ok) setExtensionDetected(true);
    };
    check();
    const id = window.setInterval(check, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [step, user]);

  useEffect(() => {
    if (step === DONE_STEP && user) {
      void syncWebsiteSessionToExtension(user);
    }
  }, [step, user]);

  async function handleGoogleSignIn() {
    setError("");
    setNotice("");
    setBusy(true);
    let openedTab = false;
    try {
      const flow = await signInWithGoogleInteractive("/get-started");
      if (flow.status === "success") {
        resetVerificationStatus();
        await syncPromptlyUserDoc(flow.user);
        setNotice("Signed in with Google.");
        if (shouldAdvanceAfterAccountAuth(flow.user, step, ACCOUNT_STEP)) {
          advanceAfterAccountAuth(goToStep);
        }
      } else if (flow.status === "cancelled") {
        setError("Google sign-in was cancelled.");
      } else {
        openedTab = true;
      }
    } catch (e) {
      setError(resolveGoogleSignInError(e).message);
    } finally {
      if (!openedTab) setBusy(false);
    }
  }

  async function handleEmailPasswordSignIn() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const email = emailAuthEmail.trim();
      const cred = await signInWithEmailAndPassword(auth, email, emailAuthPassword);
      await reload(cred.user);
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user);
        notifyVerificationSent(email);
        setEmailAuthPassword("");
        return;
      }
      notifyVerified(cred.user.email || email);
      await syncPromptlyUserDoc(cred.user);
      if (shouldAdvanceAfterAccountAuth(cred.user, step, ACCOUNT_STEP)) {
        advanceAfterAccountAuth(goToStep);
      }
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
      await syncPromptlyUserDoc(cred.user);
      await sendEmailVerification(cred.user);
      setEmailAuthMode("signin");
      notifyVerificationSent(email);
      setEmailAuthPassword("");
      setEmailAuthPassword2("");
      setEmailAuthName("");
    } catch (e) {
      setError((await resolveEmailRegistrationError(getFirebaseAuth(), emailAuthEmail.trim(), e)).message);
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout(tier: PaidPlanKey) {
    if (!user) return;
    setCheckoutBusy(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tier, onboarding: true })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Checkout failed (${res.status})`);
      if (typeof data.url === "string" && data.url) window.location.href = data.url;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function continueFromPlan() {
    const plan = GET_STARTED_PLANS.find((p) => p.key === selectedPlan);
    if (!plan) return;
    if (currentTier === plan.key) {
      goToStep(DONE_STEP);
      return;
    }
    if (!checkoutStatus.stripeConfigured) {
      setError("Stripe checkout is not configured on this server.");
      return;
    }
    await startCheckout(plan.key as PaidPlanKey);
  }

  function continueWithFreePlan() {
    setSelectedPlan("free");
    setError("");
    goToStep(DONE_STEP);
  }

  const stepTitle = useMemo(() => {
    if (step === 1) return "Welcome to Promptly, set up in 2 minutes";
    if (step === 2) return "Create your account";
    if (step === 3) return "What AI platforms do you use?";
    if (step === 4) return "Install Promptly";
    if (step === 5) return billingLoading || activePaidTier ? "Your plan" : "Choose your plan";
    return "Setup complete";
  }, [step, activePaidTier, billingLoading]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 pb-24">
      <div className="mb-8">
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label="Setup progress"
        >
          {STEPS.map((_, index) => {
            const num = index + 1;
            const reached = step >= num;
            return (
              <div
                key={num}
                className={`h-1.5 flex-1 rounded-sm transition-colors duration-300 ${
                  reached ? "bg-ink" : "bg-line"
                }`}
              />
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-ink">{stepTitle}</h1>
          {step === INSTALL_STEP && wantsDesktopApps ? (
            <OnboardingInstallOsToggle os={installOs} onChange={handleInstallOsChange} />
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {verificationUiStatus !== "none" && verificationEmail ? (
          <EmailVerificationNotice status={verificationUiStatus} email={verificationEmail} />
        ) : notice ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}

        {step === 1 ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => goToStep(welcomeContinueStep(user, ACCOUNT_STEP, CHOOSE_AI_STEP))}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800"
            >
              Get Started
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
                {emailAuthMode === "register" ? (
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="Name"
                    value={emailAuthName}
                    onChange={(e) => setEmailAuthName(e.target.value)}
                    className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none"
                  />
                ) : null}
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={emailAuthEmail}
                  onChange={(e) => setEmailAuthEmail(e.target.value)}
                  className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none"
                />
                <input
                  type="password"
                  autoComplete={emailAuthMode === "signin" ? "current-password" : "new-password"}
                  placeholder="Password"
                  value={emailAuthPassword}
                  onChange={(e) => setEmailAuthPassword(e.target.value)}
                  className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none"
                />
                {emailAuthMode === "register" ? (
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Confirm password"
                    value={emailAuthPassword2}
                    onChange={(e) => setEmailAuthPassword2(e.target.value)}
                    className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none"
                  />
                ) : null}
              </div>
              <button
                type="button"
                onClick={emailAuthMode === "signin" ? handleEmailPasswordSignIn : handleEmailRegister}
                disabled={busy}
                className={`mt-3 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${
                  emailAuthMode === "register"
                    ? "border border-ink bg-cream text-ink hover:bg-cream-dark"
                    : "bg-ink text-cream hover:bg-neutral-800"
                }`}
              >
                {busy ? "Working…" : emailAuthMode === "signin" ? "Sign in & continue" : "Create account"}
              </button>
            </div>
            <button type="button" onClick={() => goToStep(1)} className="text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <>
            <GetStartedAiSelection value={productSelection} onChange={setProductSelection} />
            <button
              type="button"
              onClick={() => {
                setBrowserStoreClicked(false);
                setInstallCommandCopied(false);
                goToStep(INSTALL_STEP);
              }}
              disabled={!hasAnyOnboardingProduct(productSelection)}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
            </button>
            {!hasAnyOnboardingProduct(productSelection) ? (
              <p className="mt-2 text-center text-xs text-faint">Select at least one option to continue.</p>
            ) : null}
            <button type="button" onClick={() => goToStep(2)} className="mt-3 text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </>
        ) : null}

        {step === 4 ? (
          <div className="mt-6 space-y-4">
            {wantsDesktopApps ? (
              <GetStartedPromptlyInstall
                mode="combined"
                os={installOs}
                stepNumber={onboardingInstallStepNumber(installSegments, "desktop_apps")}
                onCommandCopy={noteInstallCommandCopy}
              />
            ) : null}

            {wantsWeb ? (
              <OnboardingBrowserExtensionInstall
                stepNumber={onboardingInstallStepNumber(installSegments, "web")}
                extensionDetected={extensionDetected}
                onStoreClick={() => setBrowserStoreClicked(true)}
              />
            ) : null}

            {!canFinishInstall ? (
              <p className="text-center text-xs text-faint">Complete each install step above to continue.</p>
            ) : null}
            <button
              type="button"
              onClick={() => goToStep(PLAN_STEP)}
              disabled={!canFinishInstall}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue to plan
            </button>
            <button type="button" onClick={() => goToStep(CHOOSE_AI_STEP)} className="text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="mt-6 space-y-4">
            {billingLoading ? (
              <p className="text-sm text-muted">Checking your plan…</p>
            ) : activePaidTier ? (
              <>
                <div className="rounded-xl border border-line bg-cream-dark px-4 py-5 text-center">
                  <p className="text-sm text-muted">You&apos;re already subscribed.</p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    You&apos;re on the {planNameForTier(activePaidTier)} plan.
                  </p>
                </div>

                {planUpgradeOptions.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">Want more from Promptly? You can upgrade now, or continue with your current plan.</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {planUpgradeOptions.map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => void startCheckout(tier)}
                          disabled={checkoutBusy || !checkoutStatus.stripeConfigured}
                          className="inline-flex flex-1 items-center justify-center rounded-xl border border-line bg-cream px-4 py-3 text-sm font-semibold text-ink hover:bg-cream-dark disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {checkoutBusy ? "Redirecting…" : `Upgrade to ${planNameForTier(tier)}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {checkoutResult === "cancel" ? (
                  <p className="text-sm text-muted">Checkout was cancelled. You can upgrade later from your account.</p>
                ) : null}

                <button
                  type="button"
                  onClick={() => goToStep(DONE_STEP)}
                  disabled={checkoutBusy}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-60"
                >
                  No, continue
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Select the plan that fits you. You can change it later from your account.</p>
                <div className="space-y-3">
                  {GET_STARTED_PLANS.map((plan) => {
                    const isSelected = selectedPlan === plan.key;
                    return (
                      <button
                        key={plan.key}
                        type="button"
                        onClick={() => setSelectedPlan(plan.key)}
                        className={`w-full rounded-xl border p-4 text-left transition-colors ${
                          isSelected ? "border-ink bg-cream-dark shadow-sm" : "border-line bg-cream hover:bg-cream-dark/80"
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-ink">{plan.name}</p>
                          <p className="text-sm font-medium text-muted">{plan.priceDisplay}</p>
                        </div>
                        <p className="mt-1 text-xs text-faint">{plan.subtitle}</p>
                        <ul className="mt-2 space-y-1 text-xs text-muted">
                          {plan.details.map((d) => (
                            <li key={d}>• {d}</li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={continueWithFreePlan}
                  className="w-full text-center text-xs text-faint transition-colors hover:text-muted"
                >
                  Begin with a limited-use free plan instead
                </button>
                {checkoutResult === "cancel" ? (
                  <p className="text-sm text-muted">Checkout was cancelled. Pick a plan and try again.</p>
                ) : null}
                <button
                  type="button"
                  onClick={continueFromPlan}
                  disabled={checkoutBusy || !user}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-60"
                >
                  {checkoutBusy
                    ? "Redirecting to Stripe…"
                    : currentTier !== selectedPlan
                      ? "Continue to payment"
                      : "Finish setup"}
                </button>
              </>
            )}
            <button type="button" onClick={() => goToStep(INSTALL_STEP)} className="text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </div>
        ) : null}

        {step === 6 ? (
          <OnboardingDoneStep
            tourSetup={{
              web: productSelection.web,
              codingAgents: hasAnyCodingAgent(productSelection),
              setupAgents: selectedCodingAgentIds(productSelection)
            }}
            completionDetail={
              browserStoreClicked
                ? "Your account is ready. Try Promptly on your favourite AI chat."
                : "Your account is ready."
            }
          />
        ) : null}
      </div>
    </div>
  );
}
