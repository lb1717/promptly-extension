"use client";

import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import {
  allAgentsSetupValidationItems,
  setupCommands,
  type OsId
} from "@/components/integrations/integrationOs";
import { useAllAgentsPairing } from "@/components/integrations/integrationPairing";
import { StepValidation } from "@/components/integrations/integrationUi";
import { useEffect, useRef, useState } from "react";

export function GetStartedAllAgentsInstall({
  onCommandCopy,
  stepNumber = 1
}: {
  onCommandCopy?: () => void;
  stepNumber?: number;
}) {
  const [os, setOs] = useState<OsId>("mac");
  const { loading, hasAllCodes, pairCodes, busy, error, signInAndConnect, refreshCodes } =
    useAllAgentsPairing();
  const autoGenAttempted = useRef(false);
  const terminalLabel = os === "mac" ? "Terminal" : "PowerShell";
  const commandLines =
    hasAllCodes && pairCodes.claude_code ? setupCommands(os, pairCodes.claude_code) : [];

  useEffect(() => {
    if (loading || hasAllCodes || busy || autoGenAttempted.current) return;
    autoGenAttempted.current = true;
    void signInAndConnect();
  }, [loading, hasAllCodes, busy, signInAndConnect]);

  return (
    <div className="rounded-xl border border-line bg-cream-dark p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold text-ink">
          {stepNumber}. Coding agents
        </p>
        <div className="flex items-center gap-2">
          {hasAllCodes ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshCodes()}
              className="rounded-lg border border-line px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-cream disabled:opacity-50"
            >
              New code
            </button>
          ) : null}
          <div className="flex gap-1">
            {(["mac", "windows"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setOs(id)}
                className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                  os === id ? "border-ink bg-ink text-cream" : "border-line text-muted hover:text-ink"
                }`}
              >
                {id === "mac" ? "Mac" : "Windows"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading || (busy && !hasAllCodes) ? (
        <p className="mt-3 text-xs text-muted">Generating command…</p>
      ) : null}

      {hasAllCodes ? (
        <>
          <CopyBlock lines={commandLines} label={terminalLabel} onCopy={onCommandCopy} />
          <StepValidation items={allAgentsSetupValidationItems()} />
          <p className="mt-3 text-xs text-muted">
            <span className="font-medium text-ink">Hooks:</span>{" "}
            {os === "windows"
              ? "Allow Promptly hooks when Claude Code or Cursor ask. Codex on Windows has no /hooks command — hooks are pre-trusted during install."
              : "Allow Promptly hooks when each agent asks. In Codex, run /hooks and trust Promptly if needed."}
          </p>
        </>
      ) : null}

      {error ? (
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
