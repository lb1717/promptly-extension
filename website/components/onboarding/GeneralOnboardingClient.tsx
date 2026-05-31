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
import { AI_TRY_TARGETS } from "@/components/onboarding/AiServiceLogos";

const STEPS = ["Start", "Account", "Plan", "Install", "Done"] as const;

const ONBOARDING_PLANS = [
  {
    key: "free" as const,
    name: "Free",
    price: "$0.00/mo",
    subtitle: "Try Promptly with daily token limits.",
    details: ["Core models and functionality", "Daily limited tokens"],
    available: true,
    paid: false
  },
  {
    key: "enterprise" as const,
    name: "Enterprise",
    price: "$70.00/mo",
    subtitle: "Maximum capability for professionals.",
    details: [
      "Research-grade prompt engineering",
      "Highest model quality and speed",
      "Extensive AI usage statistics"
    ],
    available: true,
    paid: true
  }
];

type PlanKey = (typeof ONBOARDING_PLANS)[number]["key"];

type BillingPayload = {
  subscriptionTier: string;
  subscriptionStatus: string;
  stripeConfigured: boolean;
};

type CheckoutStatus = {
  loading: boolean;
  stripeConfigured: boolean;
};

const STEP_STORAGE_KEY = "promptly_general_onboarding_step";

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

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("free");
  const [billing, setBilling] = useState<BillingPayload | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>({
    loading: true,
    stripeConfigured: false
  });
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [storeLinkClicked, setStoreLinkClicked] = useState(false);
  const [openingAi, setOpeningAi] = useState<string | null>(null);

  const [emailAuthMode, setEmailAuthMode] = useState<"signin" | "register">("register");
  const [emailAuthEmail, setEmailAuthEmail] = useState("");
  const [emailAuthPassword, setEmailAuthPassword] = useState("");
  const [emailAuthPassword2, setEmailAuthPassword2] = useState("");
  const [emailAuthName, setEmailAuthName] = useState("");

  const edgeUrl = SITE.edgeAddonsUrl || SITE.browserExtensionTargets.find((t) => t.key === "edge")?.installUrl;

  const currentTier = useMemo(() => normalizeTier(billing?.subscriptionTier || "free"), [billing?.subscriptionTier]);

  const goToStep = useCallback((next: number) => {
    setStep(next);
    try {
      window.localStorage.setItem(STEP_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return listenForGoogleSignInReturn({
      onSuccess: () => {
        setNotice("Signed in with Google.");
        setBusy(false);
      },
      onError: (message) => {
        setError(message);
        setBusy(false);
      },
      onSettled: () => setBusy(false)
    });
  }, []);

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
      goToStep(4);
      return;
    }

    if (step === 5) return;

    if (user && step < 3) {
      goToStep(3);
      return;
    }

    if (!user && step > 2) {
      goToStep(2);
    }
  }, [user, authLoading, checkoutResult, goToStep, step]);

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
    try {
      openGoogleSignInInNewTab("/get-started");
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
        setNotice("Verify your email first, then sign in again.");
        return;
      }
      await syncPromptlyUserDoc(cred.user);
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
      await syncPromptlyUserDoc(cred.user);
      await sendEmailVerification(cred.user);
      await signOut(auth);
      setEmailAuthMode("signin");
      setNotice("Account created. Verify your email, then sign in.");
      setEmailAuthPassword("");
      setEmailAuthPassword2("");
      setEmailAuthName("");
    } catch (e) {
      setError((await resolveEmailRegistrationError(getFirebaseAuth(), emailAuthEmail.trim(), e)).message);
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout(tier: "enterprise") {
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
    const plan = ONBOARDING_PLANS.find((p) => p.key === selectedPlan);
    if (!plan) return;
    if (plan.paid) {
      if (currentTier === "enterprise") {
        goToStep(4);
        return;
      }
      if (!checkoutStatus.stripeConfigured) {
        setError("Stripe checkout is not configured on this server.");
        return;
      }
      await startCheckout("enterprise");
      return;
    }
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
    if (step === 1) return "Get started with Promptly";
    if (step === 2) return "Create your account";
    if (step === 3) return "Choose your plan";
    if (step === 4) return "Install Promptly";
    return "Setup complete";
  }, [step]);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 pb-24">
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
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-faint">
          {step === 1 ? "About 30 seconds" : `Step ${step} of ${STEPS.length}`}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{stepTitle}</h1>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {notice ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}

        {step === 1 ? (
          <div className="mt-6 space-y-5">
            <p className="text-sm leading-relaxed text-muted">
              Improve every prompt in ChatGPT, Claude, and Gemini — clearer intent, better structure, one click.
            </p>
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
                <span>Install the browser extension</span>
              </li>
            </ul>
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
                  className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none"
                />
                {emailAuthMode === "register" ? (
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="Full name"
                    value={emailAuthName}
                    onChange={(e) => setEmailAuthName(e.target.value)}
                    className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none"
                  />
                ) : null}
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

        {step === 3 ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted">Select the plan that fits you. You can change it later from your account.</p>
            <div className="space-y-3">
              {ONBOARDING_PLANS.filter((p) => p.available).map((plan) => {
                const isSelected = selectedPlan === plan.key;
                const isCurrent = currentTier === plan.key;
                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setSelectedPlan(plan.key)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      isSelected ? "border-ink bg-cream-dark shadow-sm" : "border-line bg-cream hover:bg-cream-dark/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{plan.name}</p>
                        <p className="text-sm font-medium text-muted">{plan.price}</p>
                      </div>
                      {isCurrent ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                          Current
                        </span>
                      ) : null}
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
                : selectedPlan === "enterprise" && currentTier !== "enterprise"
                  ? "Continue to payment"
                  : "Continue"}
            </button>
            <button type="button" onClick={() => goToStep(2)} className="text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="mt-6 space-y-5">
            <p className="text-sm text-muted">
              The browser store opens in a new tab. When you&apos;re done installing, return here — we&apos;ll detect the
              extension automatically when possible.
            </p>

            <div className="rounded-xl border border-line bg-cream-dark p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">1. Download Promptly</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <a
                  href={SITE.chromeStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setStoreLinkClicked(true)}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
                >
                  Add to Chrome
                </a>
                {edgeUrl ? (
                  <a
                    href={edgeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setStoreLinkClicked(true)}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-line bg-cream px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream-dark"
                  >
                    Add to Edge
                  </a>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-cream-dark p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                2. Open ChatGPT, Claude, or Gemini
              </p>
              <p className="mt-2 text-sm text-muted">Begin prompting — Promptly appears inside the chat box.</p>
              <div className="mt-3 grid gap-2">
                {AI_TRY_TARGETS.map(({ key, name, url, Logo }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => openAiTarget(key, url)}
                    disabled={!user || openingAi !== null}
                    className="inline-flex items-center gap-3 rounded-lg border border-line bg-cream px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-cream-dark disabled:opacity-60"
                  >
                    <Logo className="h-6 w-6 shrink-0" />
                    <span>Open {name}</span>
                  </button>
                ))}
              </div>
            </div>

            {extensionDetected ? (
              <p className="text-sm text-emerald-700">Extension detected — you&apos;re connected.</p>
            ) : null}

            {!storeLinkClicked ? (
              <p className="text-center text-xs text-faint">Add Promptly to Chrome or Edge above to continue.</p>
            ) : null}
            <button
              type="button"
              onClick={() => goToStep(5)}
              disabled={!storeLinkClicked}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {extensionDetected ? "Finish setup" : "I've installed — finish setup"}
            </button>
            <button type="button" onClick={() => goToStep(3)} className="text-xs text-faint hover:text-ink">
              ← Back
            </button>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
              <p className="text-lg font-semibold text-emerald-900">Setup complete</p>
              <p className="mt-1 text-sm text-emerald-800">Your account is ready. Try Promptly on your favourite AI chat.</p>
            </div>

            <p className="text-center text-sm font-semibold text-ink">Try it out now</p>

            <div className="grid gap-3">
              {AI_TRY_TARGETS.map(({ key, name, url, Logo }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => openAiTarget(key, url)}
                  disabled={!user || openingAi !== null}
                  className="flex flex-col items-center rounded-xl border border-line bg-cream-dark p-4 transition-colors hover:border-ink/20 hover:bg-cream disabled:opacity-60"
                >
                  <Logo className="h-10 w-10" />
                  <span className="mt-2 text-sm font-semibold text-ink">{name}</span>
                  <span className="mt-1 text-xs text-faint">
                    {openingAi === key ? "Signing in to extension…" : "Open & start prompting"}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-center text-xs text-faint">
              We sync your Promptly sign-in to the extension when you open a chat (if installed).
            </p>

            <Link
              href="/account"
              className="inline-flex w-full items-center justify-center rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream-dark"
            >
              Go to your account
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
