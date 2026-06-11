"use client";

import { OnboardingTourOverlay } from "@/components/onboarding/OnboardingTourOverlay";
import {
  ONBOARDING_TOUR_EVENT,
  readOnboardingTour,
  type OnboardingTourState
} from "@/lib/onboardingTour";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function OnboardingTourHost() {
  const pathname = usePathname();
  const [tour, setTour] = useState<OnboardingTourState | null>(null);

  const refresh = useCallback(() => {
    setTour(readOnboardingTour());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(ONBOARDING_TOUR_EVENT, refresh);
    return () => window.removeEventListener(ONBOARDING_TOUR_EVENT, refresh);
  }, [refresh, pathname]);

  if (!tour?.active) return null;

  if (tour.step === "account-section" || tour.step === "statistics-link") {
    if (!pathname.startsWith("/account")) return null;
  }

  if (tour.step === "account-nav" && pathname.startsWith("/account")) {
    return null;
  }

  return <OnboardingTourOverlay step={tour.step} setup={tour.setup} />;
}
