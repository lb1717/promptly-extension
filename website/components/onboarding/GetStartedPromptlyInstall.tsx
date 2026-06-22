"use client";

import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import {
  companionInstallCommands,
  fullSetupOnboardingCommands,
  onboardingSetupValidationItems,
  setupCommands,
  type OnboardingInstallMode,
  type OsId
} from "@/components/integrations/integrationOs";
import { useAllAgentsPairing } from "@/components/integrations/integrationPairing";
import { StepValidation } from "@/components/integrations/integrationUi";
import { PROMPTLY_MAC_INSTALL_COMMAND } from "@/lib/companionDownload";
import { useEffect, useRef } from "react";

function stepTitle(mode: OnboardingInstallMode): string {
  if (mode === "combined") return "Install Promptly";
  if (mode === "desktop") return "Desktop app";
  return "Coding agents";
}

export function GetStartedPromptlyInstall({
  mode,
  os,
  onCommandCopy,
  stepNumber = 1
}: {
  mode: OnboardingInstallMode;
  os: OsId;
  onCommandCopy?: () => void;
  stepNumber?: number;
}) {
  const needsPairCode = mode === "combined" || mode === "agents";
  const showsMacDesktopFix = os === "mac" && (mode === "combined" || mode === "desktop");
  const { loading, hasAllCodes, pairCodes, busy, error, signInAndConnect, refreshCodes } =
    useAllAgentsPairing();
  const autoGenAttempted = useRef(false);
  const terminalLabel = os === "mac" ? "Terminal" : "PowerShell";

  useEffect(() => {
    if (!needsPairCode || loading || hasAllCodes || busy || autoGenAttempted.current) return;
    autoGenAttempted.current = true;
    void signInAndConnect();
  }, [needsPairCode, loading, hasAllCodes, busy, signInAndConnect]);

  const commandLines = (() => {
    if (mode === "desktop") {
      return companionInstallCommands(os);
    }
    if (!hasAllCodes || !pairCodes.claude_code) {
      return [];
    }
    if (mode === "combined") {
      return fullSetupOnboardingCommands(os, pairCodes.claude_code);
    }
    return setupCommands(os, pairCodes.claude_code, { quiet: true });
  })();

  const ready = mode === "desktop" || (hasAllCodes && commandLines.length > 0);

  return (
    <div className="rounded-xl border border-line bg-cream-dark p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold text-ink">
          {stepNumber}. {stepTitle(mode)}
        </p>
        {needsPairCode && hasAllCodes ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void refreshCodes()}
            className="rounded-lg border border-line px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-cream disabled:opacity-50"
          >
            New code
          </button>
        ) : null}
      </div>

      {needsPairCode && (loading || (busy && !hasAllCodes)) ? (
        <p className="mt-3 text-xs text-muted">Generating command…</p>
      ) : null}

      {ready ? (
        <>
          <CopyBlock lines={commandLines} label={terminalLabel} onCopy={onCommandCopy} />
          <StepValidation items={onboardingSetupValidationItems(mode)} compact />
          {showsMacDesktopFix ? (
            <div className="mt-3 text-xs text-muted">
              <p>
                If macOS says &ldquo;damaged&rdquo; or &ldquo;unidentified developer&rdquo; when opening the desktop
                app, run this in Terminal:
              </p>
              <CopyBlock lines={[PROMPTLY_MAC_INSTALL_COMMAND]} label="Terminal" />
            </div>
          ) : null}
          {mode !== "desktop" ? (
            <p className="mt-2 text-xs text-muted">
              After install, allow hooks when prompted and, if necessary, trust Promptly.
            </p>
          ) : null}
        </>
      ) : null}

      {needsPairCode && error ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-red-700">{error}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void signInAndConnect()}
            className="rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-ink hover:bg-cream disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
