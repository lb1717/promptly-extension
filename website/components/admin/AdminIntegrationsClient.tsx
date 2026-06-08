"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import { useIntegrationPairing } from "@/components/integrations/integrationPairing";
import {
  allAgentsInstallCommands,
  connectCommands,
  verifyInstallCommands,
  verifyInstallCommandsPowerShell
} from "@/components/integrations/integrationOs";
import { HooksOnlySetup, type IdeToolId, type OsId } from "@/components/integrations/integrationSteps";
import Link from "next/link";
import { useMemo, useState } from "react";

const OS_TABS: { id: OsId; label: string }[] = [
  { id: "mac", label: "Mac" },
  { id: "windows", label: "Windows" }
];

const TOOL_META: { id: IdeToolId; label: string; accent: string }[] = [
  { id: "claude_code", label: "Claude Code", accent: "#D97757" },
  { id: "cursor", label: "Cursor", accent: "#00D8FF" },
  { id: "codex", label: "Codex", accent: "#10A37F" }
];

function AdminConnectOnlyStep({
  os,
  tool,
  label
}: {
  os: OsId;
  tool: IdeToolId;
  label: string;
}) {
  const { loading, pairCode, expiresAt, busy, error, signInAndConnect, refreshCode } =
    useIntegrationPairing(tool);
  const terminalLabel = os === "mac" ? "Terminal" : "PowerShell";
  const connectLines = pairCode
    ? os === "mac"
      ? connectCommands(os, tool, pairCode)
      : connectCommands(os, tool, pairCode)
    : [];

  return (
    <div className="rounded-xl border border-violet-500/20 bg-[#221830]/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{label}</h3>
        {!loading ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void signInAndConnect()}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {busy ? "Connecting…" : "Get pairing code"}
            </button>
            {pairCode ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshCode()}
                className="rounded-lg border border-violet-500/35 px-2.5 py-1.5 text-xs text-violet-100 hover:bg-violet-500/10 disabled:opacity-50"
              >
                New code
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {pairCode ? (
        <>
          <p className="mt-2 text-xs text-violet-200/70">
            Paste into {terminalLabel} after the all-agents install finishes.
            {expiresAt ? ` Code expires ${new Date(expiresAt).toLocaleTimeString()}.` : null}
          </p>
          <CopyBlock lines={connectLines} label="Connect only" />
        </>
      ) : (
        <p className="mt-2 text-xs text-violet-200/60">
          Pairing verifies the Promptly plan. Run once per agent — you can use different login emails per agent.
        </p>
      )}
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

export function AdminIntegrationsClient() {
  const [activeOs, setActiveOs] = useState<OsId>("mac");
  const [activeTool, setActiveTool] = useState<IdeToolId>("codex");

  const installLines = useMemo(() => allAgentsInstallCommands(activeOs), [activeOs]);
  const verifyLines = useMemo(
    () => (activeOs === "mac" ? verifyInstallCommands("mac") : verifyInstallCommandsPowerShell()),
    [activeOs]
  );

  const setupProps = { os: activeOs, tool: activeTool };
  const hooksSetup = <HooksOnlySetup {...setupProps} />;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-400/80">Admin preview</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Coding agent integrations</h1>
          <p className="mt-2 text-sm text-violet-200/70">
            Unified install for Claude Code, Cursor, and Codex. Not linked from the public site yet — test here
            before promoting to /integrations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin"
            className="rounded-xl border border-violet-500/35 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/15"
          >
            ← Dashboard
          </Link>
          <AdminLogoutButton />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {OS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveOs(tab.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              activeOs === tab.id
                ? "border-violet-400 bg-violet-600 text-white"
                : "border-violet-500/30 text-violet-200 hover:bg-violet-500/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="mb-8 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-300">1 · Install all agents</h2>
        <p className="mt-2 text-sm text-violet-200/75">
          One download installs Cursor, Claude Code, and Codex when their CLIs are available. Missing CLIs are
          installed via npm when possible; otherwise that agent is skipped with a warning.
        </p>
        <CopyBlock lines={installLines} label={activeOs === "mac" ? "Terminal" : "PowerShell"} />
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-violet-200/65">
          <li>Requires curl (Mac) and Node.js — the script installs Node if missing.</li>
          <li>Downloads the full plugin pack once to ~/integrations (or %USERPROFILE%\integrations).</li>
          <li>Verifies hooks, MCP, /promptly command files, and shared telemetry/improve CLIs.</li>
          <li>Safe to re-run — idempotent reinstall per agent.</li>
        </ul>
      </section>

      <section className="mb-8 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-300">2 · Verify install</h2>
        <p className="mt-2 text-sm text-violet-200/75">
          After install, run these to confirm the telemetry CLI and per-agent pairing slots exist.
        </p>
        <CopyBlock lines={verifyLines} label="Status checks" />
      </section>

      <section className="mb-8 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-300">3 · Connect each agent</h2>
        <p className="mt-2 text-sm text-violet-200/75">
          Pairing verifies your Promptly plan. All activity on this computer rolls up under your Promptly account;
          agent login emails appear separately under Statistics → All My Active Accounts.
        </p>
        <div className="mt-4 space-y-3">
          {TOOL_META.map((tool) => (
            <AdminConnectOnlyStep key={tool.id} os={activeOs} tool={tool.id} label={tool.label} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-300">4 · Enable hooks</h2>
        <p className="mb-4 text-sm text-violet-200/75">Per-agent hook trust steps (same as public integrations).</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {TOOL_META.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTool(tab.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                activeTool === tab.id
                  ? "text-white"
                  : "border-violet-500/30 text-violet-200 hover:bg-violet-500/10"
              }`}
              style={
                activeTool === tab.id
                  ? { borderColor: tab.accent, backgroundColor: tab.accent }
                  : undefined
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-violet-500/15 bg-[#1c1428]/80 p-4 text-ink [&_.text-ink]:text-violet-50 [&_.text-muted]:text-violet-200/70 [&_.text-faint]:text-violet-300/60 [&_.border-line]:border-violet-500/20 [&_.bg-cream-dark]:bg-violet-950/40 [&_.bg-ink]:bg-violet-950">
          <ol className="list-none">{hooksSetup}</ol>
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-violet-400/60">
        Public page still at{" "}
        <Link href="/integrations" className="underline hover:text-violet-200">
          /integrations
        </Link>{" "}
        (per-agent install). Promote this flow when ready.
      </p>
    </main>
  );
}
