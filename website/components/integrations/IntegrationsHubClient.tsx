"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClaudeCodeSetup, CodexSetup, CursorSetup, type IdeToolId } from "./integrationSteps";
import type { OsId } from "./integrationOs";

const TOOL_TABS: { id: IdeToolId; label: string; accent: string }[] = [
  { id: "claude_code", label: "Claude Code", accent: "#D97757" },
  { id: "cursor", label: "Cursor", accent: "#00D8FF" },
  { id: "codex", label: "Codex", accent: "#10A37F" }
];

const OS_TABS: { id: OsId; label: string }[] = [
  { id: "mac", label: "Mac" },
  { id: "windows", label: "Windows" }
];

export function IntegrationsHubClient() {
  const [activeTool, setActiveTool] = useState<IdeToolId>("codex");
  const [activeOs, setActiveOs] = useState<OsId>("mac");
  const activeMeta = useMemo(() => TOOL_TABS.find((t) => t.id === activeTool)!, [activeTool]);
  const setupProps = { os: activeOs, tool: activeTool };

  const setup =
    activeTool === "codex" ? (
      <CodexSetup {...setupProps} />
    ) : activeTool === "claude_code" ? (
      <ClaudeCodeSetup {...setupProps} />
    ) : (
      <CursorSetup {...setupProps} />
    );

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Coding agents</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Connect Claude Code, Cursor &amp; Codex
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
          Press connect, paste one command, allow hooks. Two steps.
        </p>
      </div>

      <section className="mt-10">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-faint">Your computer</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Operating system">
          {OS_TABS.map((tab) => {
            const selected = tab.id === activeOs;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveOs(tab.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selected
                    ? "border-ink bg-ink text-cream"
                    : "border-line bg-cream text-muted hover:border-ink/30 hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs font-medium uppercase tracking-wide text-faint">Coding agent</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Coding agent">
          {TOOL_TABS.map((tab) => {
            const selected = tab.id === activeTool;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTool(tab.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  selected
                    ? "border-ink bg-ink text-cream"
                    : "border-line bg-cream text-muted hover:border-ink/30 hover:text-ink"
                }`}
                style={selected ? { borderColor: tab.accent, backgroundColor: tab.accent } : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          className="mt-6 rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8"
          role="tabpanel"
          aria-label={`${activeMeta.label} setup on ${activeOs}`}
        >
          <div className="border-b border-line pb-4">
            <h2 className="text-lg font-semibold text-ink">
              {activeMeta.label} · {activeOs === "mac" ? "Mac" : "Windows"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Do each step in order. Don&apos;t skip ahead until the green checklist matches what you see.
            </p>
          </div>
          {setup}
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-faint">
        Prompt counts and time only — never prompt text.
      </p>

      <p className="mt-8 text-center text-xs text-faint">
        Browser extension for ChatGPT, Claude &amp; Gemini →{" "}
        <Link href="/get-started" className="underline hover:text-ink">
          Get started
        </Link>
      </p>
    </div>
  );
}
