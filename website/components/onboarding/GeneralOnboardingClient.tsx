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
import type { IdeToolId } from "@/components/integrations/integrationOs";
import { GetStartedCodingAgentInstall } from "@/components/onboarding/GetStartedCodingAgentInstall";
import { OnboardingBrowserExtensionInstall } from "@/components/onboarding/OnboardingBrowserExtensionInstall";
import { OnboardingDoneStep } from "@/components/onboarding/OnboardingDoneStep";
import { canFinishOnboardingInstall } from "@/lib/onboardingInstallProgress";
import { canProceedWithEmailAccount } from "@/lib/emailVerification";
import { useEmailVerificationStatus } from "@/lib/useEmailVerificationStatus";
import { GET_STARTED_PLANS, type PaidPlanKey, type PlanKey } from "@/lib/plans";
import {
  detectAuthTransition,
  markAuthHydrated,
  shouldAdvanceToPlanAfterAuth,
  welcomeContinueStep
} from "@/lib/onboardingStepFlow";

const STEPS = ["Start", "Account", "Plan", "Install", "Done"] as const;
const ACCOUNT_STEP = 2;
const PLAN_STEP = 3;
const INSTALL_STEP = 4;

function advanceAfterAccountAuth(goToStep: (next: number) => void) {
  goToStep(PLAN_STEP);
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

function normalizeTier(raw: string): PlanKey | "pro" | "student" | "other" {
  const t = raw.toLowerCase();
  if (t === "free") return "free";
  if (t === "enterprise") return "enterprise";
  if (t === "pro" || t === "plus") return "pro";
  if (t === "student") return "student";
  return "other";
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
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>({
    loading: true,
    stripeConfigured: false
  });
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [browserStoreClicked, setBrowserStoreClicked] = useState(false);
  const [setupAgents, setSetupAgents] = useState<IdeToolId[]>([]);
  const [openingAi, setOpeningAi] = useState<string | null>(null);

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

  const canFinishInstall = useMemo(
    () =>
      canFinishOnboardingInstall({
        browserStoreClicked,
        setupAgents
      }),
    [browserStoreClicked, setupAgents]
  );

  const noteAgentCommandCopy = useCallback((tool: IdeToolId) => {
    setSetupAgents((prev) => (prev.includes(tool) ? prev : [...prev, tool]));
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
        if (shouldAdvanceToPlanAfterAuth(current, step, ACCOUNT_STEP)) {
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
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/account/billing", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setBilling(data as BillingPayload);
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
    if (authLoading) return;

    if (checkoutResult === "success") {
      goToStep(INSTALL_STEP);
      return;
    }

    if (step === 5) return;

    if (markAuthHydrated(authHydratedRef, prevUserRef, user)) return;

    const { justSignedIn, justSignedOut } = detectAuthTransition(prevUserRef, user);

    if ((justSignedOut || !user) && step > ACCOUNT_STEP) {
      goToStep(ACCOUNT_STEP);
      return;
    }

    if (justSignedIn && shouldAdvanceToPlanAfterAuth(user, step, ACCOUNT_STEP)) {
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
    if (step === 5 && user) {
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
        if (shouldAdvanceToPlanAfterAuth(flow.user, step, ACCOUNT_STEP)) {
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
      if (shouldAdvanceToPlanAfterAuth(cred.user, step, ACCOUNT_STEP)) {
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
      goToStep(4);
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
    goToStep(4);
  }

  async function openAiTarget(key: string, url: string) {
    if (!user) return;
    setOpeningAi(key);
    setError("");
    try {
      await syncWebsiteSessionToExtension(user);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setOpeningAi(null);
    }
  }

  const stepTitle = useMemo(() => {
    if (step === 1) return "Get Started in 30 seconds";
    if (step === 2) return "Create your account";
    if (step === 3) return "Choose your plan";
    if (step === 4) return "Install Promptly";
    return "Setup complete";
  }, [step]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 pb-24">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-1">
          {STEPS.map((label, index) => {
            const num = index + 1;
            const active = step === num;
            const done = step > num;
            return (
              <div key={label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold sm:h-8 sm:w-8 sm:text-xs ${
                    active
                      ? "bg-ink text-cream"
                      : done
                        ? "bg-emerald-600 text-white"
                        : "border border-line bg-cream-dark text-faint"
                  }`}
                >
                  {done ? "✓" : num}
                </div>
                <span className={`hidden text-[10px] sm:block ${active ? "font-semibold text-ink" : "text-faint"}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
        {step !== 1 ? (
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-faint">
            {`Step ${step} of ${STEPS.length}`}
          </p>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold text-ink">{stepTitle}</h1>

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
          <div className="mt-6 space-y-5">
            <ul className="space-y-2 text-sm text-muted">
              <li className="flex gap-2">
                <span className="text-faint">1.</span>
                <span>Create your account</span>
              </li>
              <li className="flex gap-2">
                <span className="text-faint">2.</span>
                <span>Pick a plan</span>
              </li>
              <li className="flex gap-2">
                <span className="text-faint">3.</span>
                <span>Install Promptly</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => goToStep(welcomeContinueStep(user, ACCOUNT_STEP, PLAN_STEP))}
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
          <div className="mt-6 space-y-4">
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
                  : "Continue"}
            </button>
            <button type="button" onClick={() => goToStep(2)} className="text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted">
              Install Promptly for your browser and/or for desktop apps and coding apps. You can always install
              other options in the future so feel free to only begin with one.
            </p>

            <OnboardingBrowserExtensionInstall
              extensionDetected={extensionDetected}
              onStoreClick={() => setBrowserStoreClicked(true)}
            />

            <GetStartedCodingAgentInstall onAgentCommandCopy={noteAgentCommandCopy} />

            {!canFinishInstall ? (
              <p className="text-center text-xs text-faint">
                Add to Chrome or Edge, or copy an install command above, to continue.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => goToStep(5)}
              disabled={!canFinishInstall}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Finish setup
            </button>
            <button type="button" onClick={() => goToStep(3)} className="text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </div>
        ) : null}

        {step === 5 ? (
          <OnboardingDoneStep
            browserStoreClicked={browserStoreClicked}
            setupAgents={setupAgents}
            openingAi={openingAi}
            onOpenAi={openAiTarget}
            completionDetail={
              browserStoreClicked
                ? "Your account is ready. Try Promptly on your favourite AI chat."
                : "Your account is ready."
            }
            disabled={!user}
          />
        ) : null}
      </div>
    </div>
  );
}
