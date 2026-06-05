"use client";

import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import { fullSetupCommands, type IdeToolId, type OsId } from "@/components/integrations/integrationOs";
import { useIntegrationPairing } from "@/components/integrations/integrationPairing";
import { useState } from "react";

const TOOLS: { id: IdeToolId; label: string; bg: string; hooks: string }[] = [
  {
    id: "claude_code",
    label: "Claude Code",
    bg: "#D97757",
    hooks: "Send a prompt in Claude Code — allow Promptly hooks if asked."
  },
  {
    id: "codex",
    label: "Codex",
    bg: "#10A37F",
    hooks: "Quit & reopen Codex, run /hooks and trust Promptly, then send a prompt."
  },
  {
    id: "cursor",
    label: "Cursor",
    bg: "#0097B2",
    hooks: "Reload Cursor (Cmd/Ctrl+Shift+P → Reload Window), allow hooks, send a prompt in Agent."
  }
];

function installSuccessHint(tool: IdeToolId): string {
  if (tool === "claude_code") return "Promptly installed for Claude Code";
  if (tool === "codex") return "Promptly installed for Codex";
  return "Promptly installed for Cursor";
}

function CodingAgentPanel({ tool, os }: { tool: IdeToolId; os: OsId }) {
  const meta = TOOLS.find((t) => t.id === tool)!;
  const { pairCode, expiresAt, busy, error, signInAndConnect, refreshCode } = useIntegrationPairing(tool);
  const terminalLabel = os === "mac" ? "Terminal" : "PowerShell";

  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void signInAndConnect()}
        className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
      >
        {busy ? "Connecting…" : "Press to Connect Account Now"}
      </button>
      {pairCode ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void refreshCode()}
          className="ml-2 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-ink hover:bg-cream-dark disabled:opacity-50"
        >
          New code
        </button>
      ) : null}

      {pairCode ? (
        <>
          <p className="text-xs text-muted">
            Paste into {terminalLabel}. Run within 10 minutes of generating the code.
          </p>
          <CopyBlock lines={fullSetupCommands(os, tool, pairCode)} />
          <p className="text-[11px] text-faint">
            Success: &quot;{installSuccessHint(tool)}&quot; and &quot;connected&quot;: true
          </p>
        </>
      ) : (
        <p className="text-xs text-muted">Press the button above, then copy the one-line install command.</p>
      )}

      <p className="text-xs text-muted">
        <span className="font-medium text-ink">Hooks:</span> {meta.hooks}
      </p>

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {expiresAt && pairCode ? (
        <p className="text-[10px] text-faint">Code expires {new Date(expiresAt).toLocaleTimeString()}</p>
      ) : null}
    </div>
  );
}

export function GetStartedCodingAgentInstall() {
  const [os, setOs] = useState<OsId>("mac");
  const [openTool, setOpenTool] = useState<IdeToolId | null>(null);

  return (
    <div className="rounded-xl border border-line bg-cream-dark p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold text-ink">
          2. Coding agents <span className="text-sm font-normal text-muted">(optional)</span>
        </p>
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
      <p className="mt-1 text-xs text-muted">Track prompts in Claude Code, Codex, or Cursor — skip if you only use the browser.</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {TOOLS.map((tool) => {
          const open = openTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => setOpenTool(open ? null : tool.id)}
              className={`w-full rounded-lg px-2 py-2 text-xs font-semibold text-white transition-opacity ${
                open ? "ring-2 ring-ink ring-offset-2 ring-offset-cream-dark" : "hover:opacity-90"
              }`}
              style={{ backgroundColor: tool.bg }}
            >
              {tool.label}
            </button>
          );
        })}
      </div>

      {openTool ? <CodingAgentPanel tool={openTool} os={os} /> : null}
    </div>
  );
}
