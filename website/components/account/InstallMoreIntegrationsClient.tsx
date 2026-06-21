"use client";

import { GetStartedAiSelection } from "@/components/onboarding/GetStartedAiSelection";
import { GetStartedAllAgentsInstall } from "@/components/onboarding/GetStartedAllAgentsInstall";
import { OnboardingBrowserExtensionInstall } from "@/components/onboarding/OnboardingBrowserExtensionInstall";
import { OnboardingDesktopAppsInstall } from "@/components/onboarding/OnboardingDesktopAppsInstall";
import { syncWebsiteSessionToExtension } from "@/lib/extensionBridge";
import {
  activeOnboardingInstallSegments,
  onboardingInstallStepNumber
} from "@/lib/onboardingInstallProgress";
import {
  DEFAULT_ONBOARDING_PRODUCT_SELECTION,
  hasAnyCodingAgent,
  hasAnyOnboardingProduct,
  type OnboardingProductSelection
} from "@/lib/onboardingProducts";
import type { User } from "firebase/auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export function InstallMoreIntegrationsClient({ user }: { user: User }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [productSelection, setProductSelection] = useState<OnboardingProductSelection>(
    DEFAULT_ONBOARDING_PRODUCT_SELECTION
  );
  const [extensionDetected, setExtensionDetected] = useState(false);

  const wantsWeb = productSelection.web;
  const wantsCodingAgents = hasAnyCodingAgent(productSelection);
  const wantsDesktopApps = productSelection.desktop_apps;
  const installSegments = useMemo(
    () => activeOnboardingInstallSegments(productSelection),
    [productSelection]
  );

  useEffect(() => {
    if (step !== 2 || !wantsWeb || !user) return;
    let cancelled = false;
    const check = async () => {
      const ok = await syncWebsiteSessionToExtension(user);
      if (!cancelled && ok) setExtensionDetected(true);
    };
    void check();
    const id = window.setInterval(() => void check(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [step, wantsWeb, user]);

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-10">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Account</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">Install more integrations</h1>
        <p className="mt-2 text-sm text-muted">
          {step === 1
            ? "Choose what you want to add. You can install browser and coding agents separately or together."
            : "Follow the steps below for each integration you selected."}
        </p>
      </div>

      {step === 1 ? (
        <div className="mt-8">
          <GetStartedAiSelection value={productSelection} onChange={setProductSelection} />
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!hasAnyOnboardingProduct(productSelection)}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue to install
          </button>
          {!hasAnyOnboardingProduct(productSelection) ? (
            <p className="mt-2 text-center text-xs text-faint">Select at least one option to continue.</p>
          ) : null}
          <Link
            href="/account"
            className="mt-4 block text-center text-xs text-faint hover:text-ink"
          >
            ← Back to account
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {wantsCodingAgents ? (
            <GetStartedAllAgentsInstall
              stepNumber={onboardingInstallStepNumber(installSegments, "coding_agents")}
            />
          ) : null}

          {wantsWeb ? (
            <OnboardingBrowserExtensionInstall
              stepNumber={onboardingInstallStepNumber(installSegments, "web")}
              extensionDetected={extensionDetected}
            />
          ) : null}

          {wantsDesktopApps ? (
            <OnboardingDesktopAppsInstall
              stepNumber={onboardingInstallStepNumber(installSegments, "desktop_apps")}
            />
          ) : null}

          <Link
            href="/account"
            className="inline-flex w-full items-center justify-center rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink hover:bg-cream-dark"
          >
            Done — back to account
          </Link>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="block w-full text-center text-xs text-faint hover:text-ink"
          >
            ← Change selection
          </button>
        </div>
      )}
    </div>
  );
}
