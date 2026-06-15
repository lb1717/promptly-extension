"use client";

import { beginOnboardingTutorial, type OnboardingTourSetup } from "@/lib/onboardingTour";

type Props = {
  completionDetail?: string;
  tourSetup: OnboardingTourSetup;
};

export function OnboardingDoneStep({
  completionDetail = "Your account is ready.",
  tourSetup
}: Props) {
  return (
    <div className="mt-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
        <p className="text-lg font-semibold text-emerald-900">Setup complete</p>
        <p className="mt-1 text-sm text-emerald-800">{completionDetail}</p>
        <button
          type="button"
          data-onboarding-begin-tutorial
          onClick={() => beginOnboardingTutorial(tourSetup)}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Begin Tutorial
        </button>
      </div>
    </div>
  );
}
