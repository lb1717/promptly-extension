"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import { AlignDeviceConnectStep, AllAgentsConnectStep } from "@/components/integrations/integrationPairing";
import { ClaudeCodeSetup, CodexSetup, CursorSetup, type IdeToolId } from "@/components/integrations/integrationSteps";
import type { OsId } from "@/components/integrations/integrationOs";
import Link from "next/link";
import { useMemo, useState } from "react";

const OS_TABS: { id: OsId; label: string }[] = [
  { id: "mac", label: "Mac" },
  { id: "windows", label: "Windows" }
];

const TOOL_META: { id: IdeToolId; label: string; accent: string }[] = [
  { id: "claude_code", label: "Claude Code", accent: "#D97757" },
  { id: "cursor", label: "Cursor", accent: "#9333ea" },
  { id: "codex", label: "Codex", accent: "#10A37F" }
];

export function AdminIntegrationsClient() {
  const [activeOs, setActiveOs] = useState<OsId>("mac");
  const [activeTool, setActiveTool] = useState<IdeToolId>("codex");
  const setupProps = { os: activeOs, tool: activeTool };
  const activeMeta = useMemo(() => TOOL_META.find((t) => t.id === activeTool)!, [activeTool]);

  const hooksSetup =
    activeTool === "codex" ? (
      <CodexSetup {...setupProps} />
    ) : activeTool === "claude_code" ? (
      <ClaudeCodeSetup {...setupProps} />
    ) : (
      <CursorSetup {...setupProps} />
    );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-400/80">Admin preview</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Coding agent integrations</h1>
          <p className="mt-2 text-sm text-violet-200/70">
            One button → one terminal command. Same flow as the public page will use when promoted.
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-300">Install &amp; connect</h2>
        <p className="mt-2 text-sm text-violet-200/75">
          One curl command installs the full plugin pack, pairs Claude Code + Cursor + Codex to your account, merges
          split stats if any, and syncs live hooks — same end-to-end flow as fix split stats, for first-time setup.
        </p>
        <div className="mt-4 [&_.text-muted]:text-violet-200/70 [&_.text-faint]:text-violet-300/60">
          <AllAgentsConnectStep
            os={activeOs}
            compact
            buttonLabel="Generate install & connect command"
            errorClassName="text-red-300"
          />
        </div>
      </section>

      <section className="mb-8 rounded-2xl border border-amber-500/25 bg-amber-950/20 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200">Fix split stats (one command)</h2>
        <p className="mt-2 text-sm text-amber-100/75">
          Sign in with the Promptly account you want, generate a code, and paste one curl command. It always downloads
          the latest fix, clears the old split setup, and makes that email the only account tracking data on this Mac.
        </p>
        <div className="mt-4 [&_.text-muted]:text-amber-100/70 [&_.text-faint]:text-amber-200/60 [&_.bg-ink]:bg-black/50 [&_.text-cream]:text-amber-50">
          <AlignDeviceConnectStep
            os={activeOs}
            compact
            buttonLabel="Generate fix split stats command"
            errorClassName="text-red-300"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-300">Enable hooks</h2>
        <p className="mb-4 text-sm text-violet-200/75">After the command finishes, trust hooks in each agent.</p>
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
                activeTool === tab.id ? { borderColor: tab.accent, backgroundColor: tab.accent } : undefined
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-violet-500/15 bg-[#1c1428]/80 p-4 text-ink [&_.text-ink]:text-violet-50 [&_.text-muted]:text-violet-200/70 [&_.text-faint]:text-violet-300/60 [&_.border-line]:border-violet-500/20 [&_.bg-cream-dark]:bg-violet-950/40 [&_.bg-ink]:bg-violet-950">
          <ol className="list-none">{hooksSetup}</ol>
        </div>
        <p className="mt-3 text-xs text-violet-400/60">Active: {activeMeta.label}</p>
      </section>

      <p className="mt-8 text-center text-xs text-violet-400/60">
        Also live at{" "}
        <Link href="/integrations" className="underline hover:text-violet-200">
          /integrations
        </Link>
      </p>
    </main>
  );
}
