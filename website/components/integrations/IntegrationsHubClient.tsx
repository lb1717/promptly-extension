"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ClaudeCodeSetup,
  CodexSetup,
  CursorSetup,
  PLUGIN_PACK_URL,
  TELEMETRY_CLI,
  type IdeToolId
} from "./integrationSteps";

const TOOL_TABS: { id: IdeToolId; label: string; accent: string }[] = [
  { id: "claude_code", label: "Claude Code", accent: "#D97757" },
  { id: "cursor", label: "Cursor", accent: "#00D8FF" },
  { id: "codex", label: "Codex", accent: "#10A37F" }
];

export function IntegrationsHubClient() {
  const [activeTool, setActiveTool] = useState<IdeToolId>("codex");
  const activeMeta = useMemo(() => TOOL_TABS.find((t) => t.id === activeTool)!, [activeTool]);
  const pairUrl = `/auth/integrations?tool=${activeTool}`;
  const loginCmd = `${TELEMETRY_CLI} login YOUR_CODE --tool ${activeTool}`;
  const statusCmd = `${TELEMETRY_CLI} status`;

  const setup =
    activeTool === "codex" ? (
      <CodexSetup pairUrl={pairUrl} loginCmd={loginCmd} statusCmd={statusCmd} />
    ) : activeTool === "claude_code" ? (
      <ClaudeCodeSetup pairUrl={pairUrl} loginCmd={loginCmd} statusCmd={statusCmd} />
    ) : (
      <CursorSetup pairUrl={pairUrl} loginCmd={loginCmd} statusCmd={statusCmd} />
    );

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Coding agents</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Connect Claude Code, Cursor &amp; Codex
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
          Download the plugin pack from Promptly, install for your app, then connect with a pairing code.
        </p>
        <p className="mx-auto mt-2 text-xs text-faint">
          Plugin pack:{" "}
          <a href={PLUGIN_PACK_URL} className="underline hover:text-ink">
            promptly-coding-agents.zip
          </a>
        </p>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Coding agent">
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
          aria-label={`${activeMeta.label} setup`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <h2 className="text-lg font-semibold text-ink">{activeMeta.label}</h2>
            <Link
              href={`/auth/integrations?tool=${activeTool}`}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-cream hover:bg-neutral-800"
            >
              Get pairing code
            </Link>
          </div>
          {setup}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-cream-dark p-4 text-sm text-muted">
        <p>
          <strong className="text-ink">Requirements:</strong> Node.js 18+ (<code className="text-ink">node --version</code>
          ), and the Codex CLI if you use Codex (<code className="text-ink">codex --version</code>).
        </p>
        <p className="mt-2">
          <strong className="text-ink">Privacy:</strong> We track prompt counts and time only — never prompt text.
        </p>
      </section>

      <p className="mt-8 text-center text-xs text-faint">
        Browser extension for ChatGPT, Claude &amp; Gemini →{" "}
        <Link href="/get-started" className="underline hover:text-ink">
          Get started
        </Link>
      </p>
    </div>
  );
}
