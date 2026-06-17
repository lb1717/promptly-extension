"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CopyBlock } from "./integrationCopyBlock";
import { AllAgentsConnectStep } from "./integrationPairing";
import { ClaudeCodeSetup, CodexSetup, CursorSetup, type IdeToolId } from "./integrationSteps";
import {
  subscriptionResyncCommand,
  type OsId
} from "./integrationOs";
import {
  troubleshootDiagnosticsCommand,
  troubleshootFixAccountCommand,
  troubleshootReinstallCommand,
  troubleshootStatusCommands,
  troubleshootUninstallCommands
} from "@/lib/integrationsTroubleshoot";

const TOOL_TABS: { id: IdeToolId; label: string; accent: string }[] = [
  { id: "claude_code", label: "Claude Code", accent: "#D97757" },
  { id: "cursor", label: "Cursor", accent: "#9333ea" },
  { id: "codex", label: "Codex", accent: "#10A37F" }
];

const OS_TABS: { id: OsId; label: string }[] = [
  { id: "mac", label: "Mac" },
  { id: "windows", label: "Windows" }
];

const SECTION_NAV = [
  { id: "install", label: "Install" },
  { id: "resync-subscriptions", label: "Resync subscriptions" },
  { id: "troubleshoot", label: "Troubleshoot" }
] as const;

function CommandSection({
  title,
  description,
  lines,
  label
}: {
  title: string;
  description: string;
  lines: string[];
  label?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white/60 p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <CopyBlock lines={lines} label={label} />
    </div>
  );
}

export function IntegrationsHubClient() {
  const [activeTool, setActiveTool] = useState<IdeToolId>("codex");
  const [activeOs, setActiveOs] = useState<OsId>("mac");
  const activeMeta = useMemo(() => TOOL_TABS.find((t) => t.id === activeTool)!, [activeTool]);
  const setupProps = { os: activeOs, tool: activeTool };
  const terminalLabel = activeOs === "mac" ? "Terminal" : "PowerShell";

  const hooksSetup =
    activeTool === "codex" ? (
      <CodexSetup {...setupProps} />
    ) : activeTool === "claude_code" ? (
      <ClaudeCodeSetup {...setupProps} />
    ) : (
      <CursorSetup {...setupProps} />
    );

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      window.requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Coding agents</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Integrations hub
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
          One command installs Claude Code, Cursor, and Codex, pairs your account, syncs subscription usage, and
          verifies live tracking. Come back here to resync plans or troubleshoot.
        </p>
      </div>

      <nav
        className="mt-8 flex flex-wrap justify-center gap-2"
        aria-label="Integration sections"
      >
        {SECTION_NAV.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-ink/30 hover:text-ink"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <section id="install" className="mt-10 scroll-mt-24">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-faint">Step 1 · Install</p>
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

        <div className="mt-6 rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
          <div className="border-b border-line pb-4">
            <h2 className="text-lg font-semibold text-ink">
              Install &amp; connect · {activeOs === "mac" ? "Mac" : "Windows"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              One command for Claude Code, Cursor, and Codex — includes subscription sync.
            </p>
          </div>
          <ol className="mt-6 list-none">
            <AllAgentsConnectStep n={1} os={activeOs} />
          </ol>

          <div className="mt-8 border-t border-line pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">Step 2 · Enable hooks</p>
            <p className="mt-2 text-center text-xs font-medium uppercase tracking-wide text-faint">Coding agent</p>
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
            <div className="mt-4" role="tabpanel" aria-label={`${activeMeta.label} hooks on ${activeOs}`}>
              {hooksSetup}
            </div>
          </div>
        </div>
      </section>

      <section id="resync-subscriptions" className="mt-12 scroll-mt-24">
        <div className="rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
          <h2 className="text-lg font-semibold text-ink">Resync subscription usage</h2>
          <p className="mt-2 text-sm text-muted">
            Run this when you sign into a new Claude, Codex, or Cursor account, change plans, or subscription charts
            look stale. Paste in {terminalLabel}, then click <span className="font-medium text-ink">Refresh</span> on
            your stats page.
          </p>
          <div className="mt-4">
            <CopyBlock lines={[subscriptionResyncCommand(activeOs)]} label={terminalLabel} />
          </div>
          <p className="mt-3 text-xs text-muted">
            First-time Claude sync opens your browser once for claude.ai. Codex and Cursor read from the apps you
            already signed into on this computer.
          </p>
        </div>
      </section>

      <section id="troubleshoot" className="mt-12 scroll-mt-24">
        <div className="rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
          <h2 className="text-lg font-semibold text-ink">Troubleshoot</h2>
          <p className="mt-2 text-sm text-muted">
            Copy commands into {terminalLabel}. Replace <code className="text-ink">YOUR_CODE</code> with a pairing
            code from the install section above while signed in.
          </p>

          <div className="mt-6 space-y-4">
            <CommandSection
              title="Check connection status"
              description="Each command should show connected: true for the matching tool."
              lines={troubleshootStatusCommands(activeOs)}
              label={terminalLabel}
            />
            <CommandSection
              title="Full reinstall (all coding agents)"
              description="Downloads the latest pack, reinstalls all agents, pairs your account, syncs subscriptions, and verifies tracking."
              lines={[troubleshootReinstallCommand(activeOs)]}
              label={terminalLabel}
            />
            <CommandSection
              title="Fix split accounts & sync hooks"
              description="Use if stats look split across emails or hooks stopped firing after an update."
              lines={[troubleshootFixAccountCommand(activeOs)]}
              label={terminalLabel}
            />
            <CommandSection
              title="Remove old plugins before reinstall"
              description="Run these first if reinstall fails or you see duplicate Promptly plugins."
              lines={troubleshootUninstallCommands(activeOs)}
              label={terminalLabel}
            />
            <CommandSection
              title="Run diagnostics"
              description="Simulates a full prompt cycle and prints whether telemetry uploads succeed."
              lines={[troubleshootDiagnosticsCommand(activeOs)]}
              label={terminalLabel}
            />

            <div className="rounded-xl border border-line bg-white/60 p-5">
              <h3 className="text-sm font-semibold text-ink">Browser extension not working?</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>Confirm Promptly is enabled in Chrome or Edge extensions.</li>
                <li>
                  Stay signed in at{" "}
                  <Link href="/account" className="font-medium text-ink underline-offset-2 hover:underline">
                    promptly-labs.com/account
                  </Link>
                  .
                </li>
                <li>Hard refresh ChatGPT, Claude, or Gemini (Cmd/Ctrl+Shift+R) after installing.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-white/60 p-5">
              <h3 className="text-sm font-semibold text-ink">Coding agents still not tracking?</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>Quit and reopen Claude Code, Cursor, or Codex after running install.</li>
                <li>Allow Promptly hooks when each agent prompts you.</li>
                <li>
                  In Codex on Mac, run <code className="text-ink">/hooks</code> and trust Promptly if needed. On Windows,
                  hooks are pre-trusted during install (no /hooks command).
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-faint">
        Prompt counts and time only — never prompt text.
      </p>

      <p className="mt-4 text-center text-xs text-faint">
        Browser extension for ChatGPT, Claude &amp; Gemini →{" "}
        <Link href="/get-started" className="underline hover:text-ink">
          Get started
        </Link>
        {" · "}
        <Link href="/account" className="underline hover:text-ink">
          Account
        </Link>
      </p>
    </div>
  );
}
