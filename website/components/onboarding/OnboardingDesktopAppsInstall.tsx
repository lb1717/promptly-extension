"use client";

import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import type { OsId } from "@/components/integrations/integrationOs";
import {
  PROMPTLY_MAC_DMG_FALLBACK_URL,
  PROMPTLY_MAC_INSTALL_COMMAND,
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

  if (os === "windows") {
    const downloadUrl = winUrl || PROMPTLY_WIN_EXE_FALLBACK_URL;
    return (
      <div className="rounded-xl border border-line bg-cream-dark p-4">
        <p className="text-base font-semibold text-ink">{stepNumber}. Promptly desktop app</p>
        <p className="mt-3 text-xs text-muted">
          <span className="text-ink">Download and run the installer.</span> Open Promptly after setup, then copy
          improved prompts into Claude or ChatGPT desktop.
        </p>
        <a
          href={downloadUrl}
          onClick={() => onDownloadClick?.()}
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-neutral-800"
        >
          Download for Windows
        </a>
      </div>
    );
  }

  const downloadUrl = macUrl || PROMPTLY_MAC_DMG_FALLBACK_URL;

  return (
    <div className="rounded-xl border border-line bg-cream-dark p-4">
      <p className="text-base font-semibold text-ink">{stepNumber}. Promptly desktop app</p>

      <ol className="mt-4 list-decimal space-y-4 pl-5 text-xs text-muted">
        <li>
          <span className="text-ink">Download and install.</span> Open the .dmg and drag{" "}
          <strong className="text-ink">Promptly</strong> to Applications.
          <a
            href={downloadUrl}
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-neutral-800"
          >
            Download for Mac
          </a>
        </li>
        <li>
          <span className="text-ink">If macOS blocks the app</span> — e.g. &ldquo;damaged&rdquo; or &ldquo;can&apos;t be
          opened&rdquo; — paste this in Terminal and press Enter:
          <CopyBlock lines={[PROMPTLY_MAC_INSTALL_COMMAND]} label="Terminal" onCopy={onCommandCopy} />
        </li>
      </ol>
    </div>
  );
}
