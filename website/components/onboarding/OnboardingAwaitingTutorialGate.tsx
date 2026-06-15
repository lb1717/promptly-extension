"use client";

import {
  ONBOARDING_TOUR_EVENT,
  readAwaitingTutorial
} from "@/lib/onboardingTour";
import { useCallback, useEffect, useState } from "react";

export function OnboardingAwaitingTutorialGate() {
  const [awaiting, setAwaiting] = useState(false);

  const refresh = useCallback(() => {
    setAwaiting(readAwaitingTutorial() !== null);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(ONBOARDING_TOUR_EVENT, refresh);
    return () => window.removeEventListener(ONBOARDING_TOUR_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!awaiting) return;
    const block = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-onboarding-begin-tutorial]")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", block, true);
    document.addEventListener("mousedown", block, true);
    document.addEventListener("touchstart", block, true);
    return () => {
      document.removeEventListener("click", block, true);
      document.removeEventListener("mousedown", block, true);
      document.removeEventListener("touchstart", block, true);
    };
  }, [awaiting]);

  if (!awaiting) return null;

  return <div className="fixed inset-0 z-[190] bg-neutral-900/15 pointer-events-none" aria-hidden />;
}
