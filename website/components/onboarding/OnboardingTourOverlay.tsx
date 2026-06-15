"use client";

import {
  advanceOnboardingTour,
  endOnboardingTour,
  ONBOARDING_TOUR_TARGETS,
  onboardingTourPromptTarget,
  type OnboardingTourSetup,
  type OnboardingTourStep
} from "@/lib/onboardingTour";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";

type Rect = { top: number; left: number; width: number; height: number };

const SPOTLIGHT_TARGET_CLASS = "onboarding-tour-spotlight-target";

function measureTarget(step: OnboardingTourStep): Rect | null {
  if (step === "complete") return null;
  const el = document.querySelector(ONBOARDING_TOUR_TARGETS[step]);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function measureCompleteTarget(): Rect | null {
  const el = document.querySelector(ONBOARDING_TOUR_TARGETS["statistics-filters"]);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function Spotlight({ rect }: { rect: Rect }) {
  const pad = 8;
  return (
    <div
      className="pointer-events-none fixed z-[201] rounded-xl ring-2 ring-ink/80"
      style={{
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        boxShadow: "0 0 0 9999px rgba(15, 15, 15, 0.55)"
      }}
    />
  );
}

function TourClickTarget({
  rect,
  label,
  onClick
}: {
  rect: Rect;
  label: string;
  onClick: () => void;
}) {
  const pad = 8;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed z-[203] rounded-xl bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      style={{
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2
      }}
    />
  );
}

function ArrowUp({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`h-5 w-5 text-ink ${className}`}
      fill="currentColor"
    >
      <path d="M12 4l-8 8h5v8h6v-8h5l-8-8z" />
    </svg>
  );
}

function TourCard({
  title,
  body,
  children,
  style
}: {
  title?: string;
  body: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className="pointer-events-auto fixed z-[202] w-[min(calc(100vw-2rem),22rem)] rounded-xl border border-line bg-cream p-4 shadow-card"
      style={style}
    >
      {title ? <p className="text-sm font-semibold text-ink">{title}</p> : null}
      <p className={`text-sm leading-relaxed text-muted ${title ? "mt-1" : ""}`}>{body}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function OnboardingTourOverlay({
  step,
  setup,
  pathname
}: {
  step: OnboardingTourStep;
  setup: OnboardingTourSetup;
  pathname: string;
}) {
  const router = useRouter();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const updateRect = useCallback(() => {
    setTargetRect(step === "complete" ? measureCompleteTarget() : measureTarget(step));
  }, [step]);

  const goToAccount = useCallback(() => {
    advanceOnboardingTour("statistics-filters");
    router.push("/account");
  }, [router]);

  const openAccountSettings = useCallback(() => {
    advanceOnboardingTour("account-section");
    router.push("/account?tab=settings");
  }, [router]);

  const returnToStatistics = useCallback(() => {
    advanceOnboardingTour("complete");
    router.push("/account");
  }, [router]);

  useLayoutEffect(() => {
    updateRect();
    const targetSelector =
      step === "complete" ? ONBOARDING_TOUR_TARGETS["statistics-filters"] : ONBOARDING_TOUR_TARGETS[step];
    const target = document.querySelector(targetSelector);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = window.setTimeout(updateRect, 350);
    return () => window.clearTimeout(timer);
  }, [step, updateRect, pathname]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [updateRect]);

  useEffect(() => {
    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      updateRect();
      const found = step === "complete" ? measureCompleteTarget() : measureTarget(step);
      if (found || attempts > 50) window.clearInterval(id);
    }, 150);
    return () => window.clearInterval(id);
  }, [step, updateRect, pathname]);

  useEffect(() => {
    const selector =
      step === "complete" ? ONBOARDING_TOUR_TARGETS["statistics-filters"] : ONBOARDING_TOUR_TARGETS[step];
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.add(SPOTLIGHT_TARGET_CLASS);
    return () => {
      el.classList.remove(SPOTLIGHT_TARGET_CLASS);
    };
  }, [step, targetRect, pathname]);

  useEffect(() => {
    if (step !== "account-settings-tab") return;
    const el = document.querySelector(ONBOARDING_TOUR_TARGETS["account-settings-tab"]);
    if (!el) return;
    const onNavigate = () => {
      advanceOnboardingTour("account-section");
    };
    el.addEventListener("click", onNavigate, true);
    return () => el.removeEventListener("click", onNavigate, true);
  }, [step, targetRect, pathname]);

  useEffect(() => {
    if (step !== "statistics-tab") return;
    const el = document.querySelector(ONBOARDING_TOUR_TARGETS["statistics-tab"]);
    if (!el) return;
    const onNavigate = () => {
      advanceOnboardingTour("complete");
    };
    el.addEventListener("click", onNavigate, true);
    return () => el.removeEventListener("click", onNavigate, true);
  }, [step, targetRect, pathname]);

  useEffect(() => {
    if (step !== "account-nav") return;
    const el = document.querySelector(ONBOARDING_TOUR_TARGETS["account-nav"]);
    if (!el) return;
    const onNavigate = (event: Event) => {
      event.preventDefault();
      goToAccount();
    };
    el.addEventListener("click", onNavigate, true);
    return () => el.removeEventListener("click", onNavigate, true);
  }, [step, targetRect, pathname, goToAccount]);

  function finishTour() {
    endOnboardingTour();
  }

  const promptTarget = onboardingTourPromptTarget(setup);

  const cardStyle: CSSProperties = (() => {
    if (!targetRect) {
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
    const cardWidth = Math.min(window.innerWidth - 32, 352);
    const left = Math.min(
      Math.max(16, targetRect.left + targetRect.width / 2 - cardWidth / 2),
      window.innerWidth - cardWidth - 16
    );
    const belowTop = targetRect.top + targetRect.height + 28;
    if (belowTop + 200 < window.innerHeight) {
      return { top: belowTop, left };
    }
    return { top: Math.max(16, targetRect.top - 200), left };
  })();

  const waitingForTarget = !targetRect;

  if (step === "complete") {
    return (
      <>
        {waitingForTarget ? (
          <div className="fixed inset-0 z-[200] bg-neutral-900/45" aria-hidden />
        ) : null}
        {targetRect ? <Spotlight rect={targetRect} /> : null}
        <TourCard
          body={`You're all set. This is your statistics home — filter by range and service anytime. Now try Promptly on ${promptTarget}.`}
          style={cardStyle}
        >
          <button
            type="button"
            onClick={finishTour}
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
          >
            Done
          </button>
        </TourCard>
      </>
    );
  }

  return (
    <>
      {waitingForTarget ? (
        <div className="fixed inset-0 z-[200] bg-neutral-900/45" aria-hidden />
      ) : null}

      {targetRect ? <Spotlight rect={targetRect} /> : null}

      {step === "account-settings-tab" && targetRect ? (
        <TourClickTarget rect={targetRect} label="Open account settings" onClick={openAccountSettings} />
      ) : null}

      {step === "statistics-tab" && targetRect ? (
        <TourClickTarget rect={targetRect} label="Return to statistics" onClick={returnToStatistics} />
      ) : null}

      {step === "account-nav" && targetRect ? (
        <TourClickTarget rect={targetRect} label="Go to my account page" onClick={goToAccount} />
      ) : null}

      {step === "account-nav" ? (
        <TourCard body="Open Account to view your statistics dashboard." style={cardStyle}>
          <div className="flex flex-col items-center gap-2">
            <ArrowUp />
            <button
              type="button"
              onClick={goToAccount}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
            >
              Go to statistics
            </button>
          </div>
        </TourCard>
      ) : null}

      {step === "statistics-filters" ? (
        <TourCard
          body={
            waitingForTarget
              ? "Loading statistics…"
              : "Use these filters to change the date range, time bucket, and which services appear in your charts."
          }
          style={cardStyle}
        >
          <button
            type="button"
            disabled={waitingForTarget}
            onClick={() => advanceOnboardingTour("account-settings-tab")}
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
          >
            Next
          </button>
        </TourCard>
      ) : null}

      {step === "account-settings-tab" ? (
        <TourCard
          body={
            waitingForTarget
              ? "Loading…"
              : "Switch to Account Settings to manage your profile, plan, and integrations."
          }
          style={cardStyle}
        >
          <div className="flex flex-col items-center gap-2">
            <ArrowUp />
            <p className="text-center text-xs text-faint">Tap Account Settings above.</p>
          </div>
        </TourCard>
      ) : null}

      {step === "account-section" ? (
        <TourCard
          body={
            waitingForTarget
              ? "Loading account settings…"
              : "Your account overview — profile, plan, and integration shortcuts live here."
          }
          style={cardStyle}
        >
          <button
            type="button"
            disabled={waitingForTarget}
            onClick={() => advanceOnboardingTour("account-token-usage")}
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
          >
            Next
          </button>
        </TourCard>
      ) : null}

      {step === "account-token-usage" ? (
        <TourCard
          body={
            waitingForTarget
              ? "Loading token usage…"
              : "Track your weekly Promptly token usage here so you know when you are approaching your plan limit."
          }
          style={cardStyle}
        >
          <button
            type="button"
            disabled={waitingForTarget}
            onClick={() => advanceOnboardingTour("statistics-tab")}
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
          >
            Next
          </button>
        </TourCard>
      ) : null}

      {step === "statistics-tab" ? (
        <TourCard
          body={
            waitingForTarget
              ? "Loading…"
              : "Head back to Statistics — that is where you will track AI usage day to day."
          }
          style={cardStyle}
        >
          <div className="flex flex-col items-center gap-2">
            <ArrowUp />
            <p className="text-center text-xs text-faint">Tap Statistics above.</p>
          </div>
        </TourCard>
      ) : null}
    </>
  );
}
