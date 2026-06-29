"use client";

import { GetStartedPromptlyInstall } from "@/components/onboarding/GetStartedPromptlyInstall";
import { OnboardingInstallOsToggle } from "@/components/onboarding/OnboardingInstallOsToggle";
import { PromptlyWindowsInstallSteps } from "@/components/companion/PromptlyDesktopInstallGuide";
import type { OsId } from "@/components/integrations/integrationOs";
import Link from "next/link";
import { useState } from "react";

export function CompanionDesktopInstallClient() {
  const [installOs, setInstallOs] = useState<OsId>("mac");

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 pb-24">
      <div className="rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-ink">Try Promptly on Desktop</h1>
          <OnboardingInstallOsToggle os={installOs} onChange={setInstallOs} />
        </div>
        <p className="mt-3 text-sm text-muted">
          Run the install command below, then open Promptly Companion from your applications folder or Start menu.
        </p>

        <div className="mt-6">
          <GetStartedPromptlyInstall mode="desktop" os={installOs} stepNumber={1} />
        </div>

        {installOs === "windows" ? (
          <div className="mt-4 rounded-xl border border-line bg-cream-dark p-4">
            <PromptlyWindowsInstallSteps compact downloadOnSamePage={false} />
          </div>
        ) : null}

        <section className="mt-6 rounded-xl border border-line bg-cream-dark p-4">
          <h2 className="text-sm font-semibold text-ink">Connect your account</h2>
          <p className="mt-2 text-sm text-muted">
            After installing, open the app and sign in. If you use Cursor, Claude Code, or Codex, Promptly can read your
            existing pairing automatically — or connect in{" "}
            <Link href="/auth/companion" className="font-medium text-ink underline">
              your browser
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
