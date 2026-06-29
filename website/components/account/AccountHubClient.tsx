"use client";

import { AccountClient } from "@/components/account/AccountClient";
import { CompanyStatisticsClient } from "@/components/account/CompanyStatisticsClient";
import { StatisticsClient } from "@/components/account/StatisticsClient";
import { NotificationDot } from "@/components/ui/NotificationDot";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import {
  ONBOARDING_TOUR_EVENT,
  readOnboardingTour,
  type OnboardingTourStep
} from "@/lib/onboardingTour";
import { useCompanionAdoptionPromo } from "@/lib/useCompanionAdoptionPromo";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export type AccountHubTab = "statistics" | "company-statistics" | "settings";

function parseTab(raw: string | null): AccountHubTab {
  if (raw === "company-statistics") return "company-statistics";
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
  const [user, setUser] = useState<User | null>(null);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [companyContextLoaded, setCompanyContextLoaded] = useState(false);
  const { showNotificationDot } = useCompanionAdoptionPromo();

  const setTab = useCallback(
    (next: AccountHubTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "statistics") {
        params.delete("tab");
      } else {
        params.set("tab", next);
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

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setIsCompanyAdmin(false);
      setCompanyContextLoaded(false);
      if (!nextUser) {
        setCompanyContextLoaded(true);
        return;
      }
      try {
        const token = await nextUser.getIdToken(false);
        const res = await fetch("/api/account/company", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store"
        });
        const json = await res.json().catch(() => ({}));
        setIsCompanyAdmin(Boolean(res.ok && json.membership?.is_admin));
      } catch {
        setIsCompanyAdmin(false);
      } finally {
        setCompanyContextLoaded(true);
      }
    });
  }, []);

  useEffect(() => {
    if (companyContextLoaded && tab === "company-statistics" && !isCompanyAdmin) {
      setTab("statistics");
    }
  }, [companyContextLoaded, isCompanyAdmin, setTab, tab]);

  const tabs = useMemo(
    () =>
      [
        { id: "statistics" as const, label: isCompanyAdmin ? "My Statistics" : "Statistics" },
        ...(isCompanyAdmin
          ? [{ id: "company-statistics" as const, label: "Company Statistics" }]
          : []),
        { id: "settings" as const, label: "Account Settings" }
      ] as const,
    [isCompanyAdmin]
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
              <span className="inline-flex items-center gap-2">
                {item.label}
                {item.id === "settings" && showNotificationDot ? <NotificationDot /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        aria-label={
          tab === "statistics"
            ? "My Statistics"
            : tab === "company-statistics"
              ? "Company Statistics"
              : "Account Settings"
        }
      >
        {tab === "statistics" ? (
          <StatisticsClient embedded />
        ) : tab === "company-statistics" ? (
          <CompanyStatisticsClient user={user} />
        ) : (
          <AccountClient embedded hidePromptStats />
        )}
      </div>
    </div>
  );
}
