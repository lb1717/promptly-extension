"use client";

import { OnboardingAwaitingTutorialGate } from "@/components/onboarding/OnboardingAwaitingTutorialGate";
import { OnboardingTourOverlay } from "@/components/onboarding/OnboardingTourOverlay";
import {
  advanceOnboardingTour,
  isOnboardingTourAccountPage,
  isOnboardingTourStatisticsPage,
  ONBOARDING_TOUR_ACCOUNT_STEPS,
  ONBOARDING_TOUR_EVENT,
  ONBOARDING_TOUR_STATISTICS_STEPS,
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

  useEffect(() => {
    const current = readOnboardingTour();
    if (current?.active && current.step === "account-nav" && isOnboardingTourAccountPage(pathname)) {
      advanceOnboardingTour("statistics-filters");
      refresh();
    }
  }, [pathname, refresh]);

  if (!tour?.active) {
    return <OnboardingAwaitingTutorialGate />;
  }

  if (
    ONBOARDING_TOUR_ACCOUNT_STEPS.includes(tour.step) &&
    !isOnboardingTourAccountPage(pathname)
  ) {
    return <OnboardingAwaitingTutorialGate />;
  }

  if (
    ONBOARDING_TOUR_STATISTICS_STEPS.includes(tour.step) &&
    !isOnboardingTourStatisticsPage(pathname)
  ) {
    return <OnboardingAwaitingTutorialGate />;
  }

  return (
    <>
      <OnboardingAwaitingTutorialGate />
      <OnboardingTourOverlay step={tour.step} setup={tour.setup} pathname={pathname} />
    </>
  );
}
