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
import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";

type Rect = { top: number; left: number; width: number; height: number };

function measureTarget(step: OnboardingTourStep): Rect | null {
  if (step === "complete") return null;
  const el = document.querySelector(ONBOARDING_TOUR_TARGETS[step]);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function Spotlight({ rect }: { rect: Rect }) {
  const pad = 6;
  return (
    <div
      className="pointer-events-none fixed z-[201] rounded-lg ring-2 ring-ink"
      style={{
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        boxShadow: "0 0 0 9999px rgba(15, 15, 15, 0.52)"
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
  setup
}: {
  step: OnboardingTourStep;
  setup: OnboardingTourSetup;
}) {
  const router = useRouter();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const updateRect = useCallback(() => {
    setTargetRect(measureTarget(step));
  }, [step]);

  useLayoutEffect(() => {
    updateRect();
    const target =
      step === "complete" ? null : document.querySelector(ONBOARDING_TOUR_TARGETS[step]);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = window.setTimeout(updateRect, 350);
    return () => window.clearTimeout(timer);
  }, [step, updateRect]);

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
      if (measureTarget(step) || attempts > 20) window.clearInterval(id);
    }, 150);
    return () => window.clearInterval(id);
  }, [step, updateRect]);

  function goToAccount() {
    advanceOnboardingTour("account-section");
    router.push("/account");
  }

  function nextFromAccountSection() {
    advanceOnboardingTour("statistics-link");
  }

  function nextFromStatistics() {
    advanceOnboardingTour("complete");
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
          title="You're good to go"
          body={`Begin prompting in ${promptTarget} and use Promptly.`}
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
    if (belowTop + 180 < window.innerHeight) {
      return { top: belowTop, left };
    }
    return { top: Math.max(16, targetRect.top - 180), left };
  })();

  return (
    <>
      {targetRect ? <Spotlight rect={targetRect} /> : (
        <div className="fixed inset-0 z-[200] bg-neutral-900/45" aria-hidden />
      )}

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
          body="This is where you can see and manage your account."
          style={cardStyle}
        >
          <button
            type="button"
            onClick={nextFromAccountSection}
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
          >
            Next
          </button>
        </TourCard>
      ) : null}

      {step === "statistics-link" ? (
        <TourCard
          body="This is where you can see all the statistics for your AI usage and prompting."
          style={cardStyle}
        >
          <div className="flex flex-col items-center gap-2">
            <ArrowUp />
            <button
              type="button"
              onClick={nextFromStatistics}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
            >
              Next
            </button>
          </div>
        </TourCard>
      ) : null}
    </>
  );
}
