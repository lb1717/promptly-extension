"use client";

import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import {
  allAgentsSetupValidationItems,
  setupCommands,
  type OsId
} from "@/components/integrations/integrationOs";
import { useAllAgentsPairing } from "@/components/integrations/integrationPairing";
import { StepValidation } from "@/components/integrations/integrationUi";
import { useState } from "react";

export function GetStartedAllAgentsInstall({
  onCommandCopy
}: {
  onCommandCopy?: () => void;
}) {
  const [os, setOs] = useState<OsId>("mac");
  const { loading, hasAllCodes, pairCodes, expiresAt, busy, error, signInAndConnect, refreshCodes } =
    useAllAgentsPairing();
  const terminalLabel = os === "mac" ? "Terminal" : "PowerShell";
  const commandLines =
    hasAllCodes && pairCodes.claude_code ? setupCommands(os, pairCodes.claude_code) : [];

  return (
    <div className="rounded-xl border border-line bg-cream-dark p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold text-ink">Coding agents</p>
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
      <p className="mt-1 text-xs text-muted">
        One command installs Claude Code, Cursor, and Codex, pairs them to your Promptly account, and verifies live
        tracking. Requires {terminalLabel} — curl and Node.js are installed automatically if missing.
      </p>

      <div className="mt-3">
        {loading ? (
          <span className="text-xs text-muted">Loading…</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void signInAndConnect()}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
            >
              {busy ? "Generating command…" : "Generate install command"}
            </button>
            {hasAllCodes ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshCodes()}
                className="rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-ink hover:bg-cream-dark disabled:opacity-50"
              >
                New code
              </button>
            ) : null}
          </div>
        )}
      </div>

      {!hasAllCodes ? (
        <p className="mt-3 text-xs text-muted">
          Generate a pairing code, copy the command into {terminalLabel}, and run it. Restart agents if they were open,
          then send a test prompt in each.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted">
            Copy into {terminalLabel} and run within a few minutes of generating the code.
          </p>
          {expiresAt ? (
            <p className="mt-1 text-[10px] text-faint">
              Code expires {new Date(expiresAt).toLocaleTimeString()} — run soon after copying.
            </p>
          ) : null}
          <CopyBlock lines={commandLines} label={terminalLabel} onCopy={onCommandCopy} />
          <StepValidation items={allAgentsSetupValidationItems()} />
          <p className="mt-3 text-xs text-muted">
            <span className="font-medium text-ink">Hooks:</span> Allow Promptly hooks when each agent asks. In Codex,
            run <code className="rounded bg-cream px-1 text-[11px]">/hooks</code> and trust Promptly if needed.
          </p>
        </>
      )}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
