"use client";

import { getFirebaseAuth } from "@/lib/firebaseClient";
import { syncPromptlyUserDoc } from "@/lib/promptlyUserSync";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  updateProfile,
  User
} from "firebase/auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  preflightEmailRegistration,
  resolveEmailRegistrationError,
  resolveEmailSignInError,
  resolveGoogleSignInError
} from "@/lib/firebaseAuthAccountHints";
import { EmailVerificationNotice } from "@/components/auth/EmailVerificationNotice";
import { listenForGoogleSignInReturn, signInWithGoogleInteractive } from "@/lib/firebaseGoogleAuth";
import { canProceedWithEmailAccount } from "@/lib/emailVerification";
import { useEmailVerificationStatus } from "@/lib/useEmailVerificationStatus";
import { GetStartedAiSelection } from "@/components/onboarding/GetStartedAiSelection";
import { GetStartedAllAgentsInstall } from "@/components/onboarding/GetStartedAllAgentsInstall";
import { OnboardingBrowserExtensionInstall } from "@/components/onboarding/OnboardingBrowserExtensionInstall";
import { OnboardingDoneStep } from "@/components/onboarding/OnboardingDoneStep";
import { OnboardingDesktopAppsInstall } from "@/components/onboarding/OnboardingDesktopAppsInstall";
import { OnboardingInstallOsToggle } from "@/components/onboarding/OnboardingInstallOsToggle";
import type { OsId } from "@/components/integrations/integrationOs";
import {
  activeOnboardingInstallSegments,
  canFinishOnboardingInstall,
  onboardingInstallStepNumber
} from "@/lib/onboardingInstallProgress";
import {
  DEFAULT_ONBOARDING_PRODUCT_SELECTION,
  hasAnyCodingAgent,
  hasAnyOnboardingProduct,
  selectedCodingAgentIds,
  type OnboardingProductSelection
} from "@/lib/onboardingProducts";
import { syncWebsiteSessionToExtension } from "@/lib/extensionBridge";
import { planDetailsForTier } from "@/lib/plans";
import { isSalesTeamJoinLink } from "@/lib/salesTeamOffers";
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

function salesWelcomeTitle(link: PublicSalesLink): string {
  if (isSalesTeamJoinLink(link)) return "Welcome";
  const name = link.recipientName.trim();
  return name ? `Welcome, ${name}` : "Welcome!";
}

type PublicSalesLink = {
  slug: string;
  recipientName: string;
  tier: "pro" | "student" | "enterprise";
  offerTitle: string;
  offerDescription: string;
  salesTeamLink?: boolean;
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
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [browserStoreClicked, setBrowserStoreClicked] = useState(false);
  const [productSelection, setProductSelection] = useState<OnboardingProductSelection>(
    DEFAULT_ONBOARDING_PRODUCT_SELECTION
  );
  const [codingAgentsSetupCopied, setCodingAgentsSetupCopied] = useState(false);
  const [desktopAppsCommandCopied, setDesktopAppsCommandCopied] = useState(false);
  const [desktopAppsDownloadClicked, setDesktopAppsDownloadClicked] = useState(false);
  const [installOs, setInstallOs] = useState<OsId>("mac");

  const [emailAuthMode, setEmailAuthMode] = useState<"signin" | "register">("register");
  const [emailAuthEmail, setEmailAuthEmail] = useState("");
  const [emailAuthPassword, setEmailAuthPassword] = useState("");
  const [emailAuthPassword2, setEmailAuthPassword2] = useState("");
  const [emailAuthName, setEmailAuthName] = useState("");

  const {
    uiStatus: verificationUiStatus,
    trackedEmail: verificationEmail,
    notifyVerificationSent,
    notifyVerified,
    resetVerificationStatus
  } = useEmailVerificationStatus(user);

  const authHydratedRef = useRef(false);
  const prevUserRef = useRef<User | null>(null);

  const planInfo = link ? planDetailsForTier(link.tier) : null;
  const wantsWeb = productSelection.web;
  const wantsCodingAgents = hasAnyCodingAgent(productSelection);
  const wantsDesktopApps = productSelection.desktop_apps;
  const installSegments = useMemo(
    () => activeOnboardingInstallSegments(productSelection),
    [productSelection]
  );

  const canFinishInstall = useMemo(
    () =>
      canFinishOnboardingInstall({
        wantsWeb,
        wantsCodingAgents,
        wantsDesktopApps,
        installOs,
        browserStoreClicked,
        codingAgentsSetupCopied,
        desktopAppsCommandCopied,
        desktopAppsDownloadClicked
      }),
    [
      wantsWeb,
      wantsCodingAgents,
      wantsDesktopApps,
      installOs,
      browserStoreClicked,
      codingAgentsSetupCopied,
      desktopAppsCommandCopied,
      desktopAppsDownloadClicked
    ]
  );

  const noteAgentCommandCopy = useCallback(() => {
    setCodingAgentsSetupCopied(true);
  }, []);

  const handleInstallOsChange = useCallback((next: OsId) => {
    setInstallOs(next);
    setDesktopAppsCommandCopied(false);
    setDesktopAppsDownloadClicked(false);
  }, []);

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
        const name = String(data.link?.recipientName || "").trim();
        if (name) setEmailAuthName(name);
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

    if (checkoutResult === "success") {
      goToStep(DONE_STEP);
      if (user) loadBilling(user);
      return;
    }

    if (step === DONE_STEP) return;

    if (markAuthHydrated(authHydratedRef, prevUserRef, user)) return;

    const { justSignedIn, justSignedOut } = detectAuthTransition(prevUserRef, user);

    if (user && !canProceedWithEmailAccount(user) && step > ACCOUNT_STEP) {
      goToStep(ACCOUNT_STEP);
      return;
    }

    if ((justSignedOut || !user) && step > ACCOUNT_STEP) {
      goToStep(ACCOUNT_STEP);
      return;
    }

    if (justSignedIn && shouldAdvanceAfterAccountAuth(user, step, ACCOUNT_STEP)) {
      advanceAfterAccountAuth(goToStep);
    }
  }, [link, user, authLoading, linkLoading, checkoutResult, goToStep, step, loadBilling]);

  useEffect(() => {
    if (step !== INSTALL_STEP || !user) return;
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

  useEffect(() => {
    if (verificationUiStatus !== "verified" || !user || step !== ACCOUNT_STEP || !link) return;
    if (!canProceedWithEmailAccount(user)) return;
    const timer = window.setTimeout(() => advanceAfterAccountAuth(goToStep), 800);
    return () => window.clearTimeout(timer);
  }, [verificationUiStatus, user, step, link, goToStep]);

  async function syncUserToFirestore(currentUser: User) {
    await syncPromptlyUserDoc(currentUser);
  }

  async function handleGoogleSignIn() {
    setError("");
    setNotice("");
    setBusy(true);
    let openedTab = false;
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const flow = await signInWithGoogleInteractive(returnTo);
      if (flow.status === "success") {
        resetVerificationStatus();
        await syncUserToFirestore(flow.user);
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
      await syncUserToFirestore(cred.user);
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
      await syncUserToFirestore(cred.user);
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
      return `The ${tierLabel} plan price is not configured. Check lib/server/stripe.ts price IDs in Stripe Dashboard → Products.`;
    }
    return "";
  }, [checkoutStatus, user, link?.tier]);

  const stepTitle = useMemo(() => {
    if (!link) return "";
    if (step === 1) return salesWelcomeTitle(link);
    if (step === 2) return "Create your account";
    if (step === 3) return "What AI platforms do you use?";
    if (step === 4) return "Install Promptly";
    if (step === 5) return "Activate your plan";
    return "Setup complete";
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
          {step === INSTALL_STEP && (wantsCodingAgents || wantsDesktopApps) ? (
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
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
              <p className="text-sm font-semibold text-emerald-900">{link.offerTitle}</p>
              <p className="mt-1 text-sm leading-relaxed text-emerald-800">{link.offerDescription}</p>
            </div>
            {isSalesTeamJoinLink(link) ? (
              <p className="text-sm text-muted">
                Get started with Promptly — create your account, install what you need, and activate your plan in a few
                quick steps.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => goToStep(welcomeContinueStep(user, ACCOUNT_STEP, CHOOSE_AI_STEP))}
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
                    className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                  />
                ) : null}
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={emailAuthEmail}
                  onChange={(e) => setEmailAuthEmail(e.target.value)}
                  className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                />
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
                setCodingAgentsSetupCopied(false);
                setDesktopAppsCommandCopied(false);
                setDesktopAppsDownloadClicked(false);
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
            <button type="button" onClick={() => goToStep(ACCOUNT_STEP)} className="mt-3 text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </>
        ) : null}

        {step === 4 ? (
          <div className="mt-6 space-y-4">
            {wantsCodingAgents ? (
              <GetStartedAllAgentsInstall
                os={installOs}
                stepNumber={onboardingInstallStepNumber(installSegments, "coding_agents")}
                onCommandCopy={noteAgentCommandCopy}
              />
            ) : null}

            {wantsWeb ? (
              <OnboardingBrowserExtensionInstall
                stepNumber={onboardingInstallStepNumber(installSegments, "web")}
                extensionDetected={extensionDetected}
                onStoreClick={() => setBrowserStoreClicked(true)}
              />
            ) : null}

            {wantsDesktopApps ? (
              <OnboardingDesktopAppsInstall
                os={installOs}
                stepNumber={onboardingInstallStepNumber(installSegments, "desktop_apps")}
                onCommandCopy={() => setDesktopAppsCommandCopied(true)}
                onDownloadClick={() => setDesktopAppsDownloadClicked(true)}
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

        {step === 5 && planInfo ? (
          <div className="mt-6 space-y-4">
            <article className="rounded-xl border border-line bg-cream-dark p-4">
              <h3 className="text-lg font-semibold text-ink">{planInfo.name}</h3>
              <p className="mt-1 text-sm font-semibold text-muted">{planInfo.priceDisplay}</p>
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

            {paidTierActive(billing, link.tier) ? (
              <button
                type="button"
                onClick={() => goToStep(DONE_STEP)}
                className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800"
              >
                Finish setup
              </button>
            ) : (
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
            )}

            {checkoutBlockedMessage && !paidTierActive(billing, link.tier) ? (
              <p className="text-xs text-faint">{checkoutBlockedMessage}</p>
            ) : null}

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
                ? `You're all set${
                    isSalesTeamJoinLink(link) || !link.recipientName.trim() ? "." : `, ${link.recipientName.trim()}.`
                  } Try Promptly on your favourite AI chat.`
                : `You're all set${
                    isSalesTeamJoinLink(link) || !link.recipientName.trim() ? "." : `, ${link.recipientName.trim()}.`
                  }`
            }
          />
        ) : null}
      </div>
    </div>
  );
}
