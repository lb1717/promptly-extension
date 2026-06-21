"use client";

import {
  PromptlyMacInstallSteps,
  PromptlyWindowsInstallSteps
} from "@/components/companion/PromptlyDesktopInstallGuide";
import type { OsId } from "@/components/integrations/integrationOs";
import { SITE } from "@/lib/constants";
import Link from "next/link";

export function OnboardingDesktopAppsInstall({
  os,
  onCommandCopy,
  onDownloadClick,
  stepNumber = 1
}: {
  os: OsId;
  onCommandCopy?: () => void;
  onDownloadClick?: () => void;
  stepNumber?: number;
}) {
  return (
    <div className="rounded-xl border border-line bg-cream-dark p-4">
      <p className="text-base font-semibold text-ink">{stepNumber}. Promptly desktop app</p>
      <p className="mt-2 text-xs text-muted">
        Download the latest Mac or Windows build — this page always has the current installer.
      </p>
      <Link
        href={SITE.companionPath}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onDownloadClick?.()}
        className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-neutral-800"
      >
        Open download page
      </Link>

      {os === "mac" ? (
        <PromptlyMacInstallSteps compact downloadOnSamePage={false} onCommandCopy={onCommandCopy} />
      ) : (
        <PromptlyWindowsInstallSteps compact downloadOnSamePage={false} />
      )}
    </div>
  );
}
