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
    setTargetRect(measureTarget(step));
  }, [step]);

  useLayoutEffect(() => {
    updateRect();
    if (step === "complete") return;
    const target = document.querySelector(ONBOARDING_TOUR_TARGETS[step]);
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
    if (step === "complete") return;
    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      updateRect();
      if (measureTarget(step) || attempts > 50) window.clearInterval(id);
    }, 150);
    return () => window.clearInterval(id);
  }, [step, updateRect, pathname]);

  useEffect(() => {
    if (step === "complete") return;
    const el = document.querySelector(ONBOARDING_TOUR_TARGETS[step]);
    if (!el) return;
    el.classList.add(SPOTLIGHT_TARGET_CLASS);
    return () => {
      el.classList.remove(SPOTLIGHT_TARGET_CLASS);
    };
  }, [step, targetRect, pathname]);

  useEffect(() => {
    if (step !== "statistics-link") return;
    const el = document.querySelector(ONBOARDING_TOUR_TARGETS["statistics-link"]);
    if (!el) return;
    const onNavigate = () => {
      advanceOnboardingTour("statistics-filters");
    };
    el.addEventListener("click", onNavigate, true);
    return () => el.removeEventListener("click", onNavigate, true);
  }, [step, targetRect, pathname]);

  function openStatistics() {
    advanceOnboardingTour("statistics-filters");
    router.push("/account/statistics");
  }

  function goToAccount() {
    advanceOnboardingTour("account-section");
    router.push("/account");
  }

  function finishTour() {
    endOnboardingTour();
  }

  const promptTarget = onboardingTourPromptTarget(setup);

  if (step === "complete") {
    return (
      <>
        <div className="fixed inset-0 z-[200] bg-neutral-900/45" aria-hidden />
        <TourCard
          body={`Guide completed. Now try it out on ${promptTarget}.`}
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)"
          }}
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

  return (
    <>
      {waitingForTarget ? (
        <div className="fixed inset-0 z-[200] bg-neutral-900/45" aria-hidden />
      ) : null}

      {targetRect ? <Spotlight rect={targetRect} /> : null}

      {step === "statistics-link" && targetRect ? (
        <TourClickTarget rect={targetRect} label="See full statistics" onClick={openStatistics} />
      ) : null}

      {step === "account-nav" ? (
        <TourCard body="Go to my account page" style={cardStyle}>
          <div className="flex flex-col items-center gap-2">
            <ArrowUp />
            <button
              type="button"
              onClick={goToAccount}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
            >
              Go to my account page
            </button>
          </div>
        </TourCard>
      ) : null}

      {step === "account-section" ? (
        <TourCard
          body={
            waitingForTarget
              ? "Loading your account overview…"
              : "This is your account overview."
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
              : "This is where you see your token usage."
          }
          style={cardStyle}
        >
          <button
            type="button"
            disabled={waitingForTarget}
            onClick={() => advanceOnboardingTour("statistics-link")}
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
          >
            Next
          </button>
        </TourCard>
      ) : null}

      {step === "statistics-link" ? (
        <TourCard
          body={
            waitingForTarget
              ? "Loading…"
              : "Press See full statistics to view all of your AI usage and prompting stats."
          }
          style={cardStyle}
        >
          <div className="flex flex-col items-center gap-2">
            <ArrowUp />
            <p className="text-center text-xs text-faint">Tap the highlighted button above.</p>
          </div>
        </TourCard>
      ) : null}

      {step === "statistics-filters" ? (
        <TourCard
          body={
            waitingForTarget
              ? "Loading statistics…"
              : "Filter and see full statistics."
          }
          style={cardStyle}
        >
          <button
            type="button"
            disabled={waitingForTarget}
            onClick={() => advanceOnboardingTour("complete")}
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
          >
            Next
          </button>
        </TourCard>
      ) : null}
    </>
  );
}
