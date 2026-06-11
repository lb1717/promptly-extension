"use client";

import { startOnboardingTour, type OnboardingTourSetup } from "@/lib/onboardingTour";
import { useEffect, useRef } from "react";

type Props = {
  completionDetail?: string;
  tourSetup: OnboardingTourSetup;
};

export function OnboardingDoneStep({
  completionDetail = "Your account is ready.",
  tourSetup
}: Props) {
  const tourStartedRef = useRef(false);

  useEffect(() => {
    if (tourStartedRef.current) return;
    tourStartedRef.current = true;
    startOnboardingTour(tourSetup);
  }, [tourSetup]);

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
        <p className="text-lg font-semibold text-emerald-900">Setup complete</p>
        <p className="mt-1 text-sm text-emerald-800">{completionDetail}</p>
      </div>
    </div>
  );
}
