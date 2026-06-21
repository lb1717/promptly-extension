"use client";

import {
  PromptlyMacInstallSteps,
  PromptlyWindowsInstallSteps
} from "@/components/companion/PromptlyDesktopInstallGuide";
import type { OsId } from "@/components/integrations/integrationOs";
import {
  PROMPTLY_MAC_DMG_FALLBACK_URL,
  PROMPTLY_WIN_EXE_FALLBACK_URL
} from "@/lib/companionDownload";
import { useEffect, useState } from "react";

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
  const [macUrl, setMacUrl] = useState<string | null>(null);
  const [winUrl, setWinUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/companion/download")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { macUrl?: string | null; winUrl?: string | null } | null) => {
        if (cancelled || !data) return;
        if (data.macUrl) setMacUrl(data.macUrl);
        if (data.winUrl) setWinUrl(data.winUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const downloadUrl =
    os === "windows" ? winUrl || PROMPTLY_WIN_EXE_FALLBACK_URL : macUrl || PROMPTLY_MAC_DMG_FALLBACK_URL;
  const downloadLabel = os === "windows" ? "Download for Windows" : "Download for Mac";

  return (
    <div className="rounded-xl border border-line bg-cream-dark p-4">
      <p className="text-base font-semibold text-ink">{stepNumber}. Promptly desktop app</p>
      <a
        href={downloadUrl}
        onClick={() => onDownloadClick?.()}
        className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-neutral-800"
      >
        {downloadLabel}
      </a>

      {os === "mac" ? (
        <PromptlyMacInstallSteps compact downloadOnSamePage onCommandCopy={onCommandCopy} />
      ) : (
        <PromptlyWindowsInstallSteps compact downloadOnSamePage />
      )}
    </div>
  );
}
