"use client";

import { AccountClient } from "@/components/account/AccountClient";
import { StatisticsClient } from "@/components/account/StatisticsClient";
import {
  ONBOARDING_TOUR_EVENT,
  readOnboardingTour,
  type OnboardingTourStep
} from "@/lib/onboardingTour";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

export type AccountHubTab = "statistics" | "settings";

function parseTab(raw: string | null): AccountHubTab {
  return raw === "settings" ? "settings" : "statistics";
}

function tabForTourStep(step: OnboardingTourStep): AccountHubTab | null {
  if (step === "statistics-filters" || step === "account-settings-tab" || step === "complete") {
    return "statistics";
  }
  if (step === "account-section" || step === "account-token-usage" || step === "statistics-tab") {
    return "settings";
  }
  return null;
}

export function AccountHubClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const setTab = useCallback(
    (next: AccountHubTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "statistics") {
        params.delete("tab");
      } else {
        params.set("tab", "settings");
      }
      const qs = params.toString();
      router.replace(qs ? `/account?${qs}` : "/account", { scroll: false });
    },
    [router, searchParams]
  );

  const syncTourTab = useCallback(() => {
    const tour = readOnboardingTour();
    if (!tour?.active) return;
    const desired = tabForTourStep(tour.step);
    if (desired && desired !== tab) setTab(desired);
  }, [setTab, tab]);

  useEffect(() => {
    syncTourTab();
    window.addEventListener(ONBOARDING_TOUR_EVENT, syncTourTab);
    return () => window.removeEventListener(ONBOARDING_TOUR_EVENT, syncTourTab);
  }, [syncTourTab]);

  const tabs = useMemo(
    () =>
      [
        { id: "statistics" as const, label: "Statistics" },
        { id: "settings" as const, label: "Account Settings" }
      ] as const,
    []
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-8">
      <div className="mb-6 flex items-center gap-6 border-b border-line">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-onboarding-tour={
                item.id === "statistics"
                  ? "statistics-tab"
                  : item.id === "settings"
                    ? "account-settings-tab"
                    : undefined
              }
              onClick={() => setTab(item.id)}
              className={
                active
                  ? "-mb-px border-b-2 border-ink pb-2 text-base font-semibold text-ink sm:text-lg"
                  : "-mb-px border-b-2 border-transparent pb-2 text-base font-medium text-muted hover:text-ink sm:text-lg"
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={tab === "statistics" ? "Statistics" : "Account Settings"}>
        {tab === "statistics" ? <StatisticsClient embedded /> : <AccountClient embedded hidePromptStats />}
      </div>
    </div>
  );
}
