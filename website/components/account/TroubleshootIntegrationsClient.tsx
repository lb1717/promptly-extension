"use client";

import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import type { OsId } from "@/components/integrations/integrationOs";
import {
  troubleshootDiagnosticsCommand,
  troubleshootFixAccountCommand,
  troubleshootReinstallCommand,
  troubleshootStatusCommands,
  troubleshootUninstallCommands
} from "@/lib/integrationsTroubleshoot";
import Link from "next/link";
import { useState } from "react";

const OS_TABS: { id: OsId; label: string }[] = [
  { id: "mac", label: "Mac" },
  { id: "windows", label: "Windows" }
];

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
    <section className="rounded-2xl border border-line bg-cream p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <CopyBlock lines={lines} label={label} />
    </section>
  );
}

export function TroubleshootIntegrationsClient() {
  const [os, setOs] = useState<OsId>("mac");
  const terminalLabel = os === "mac" ? "Terminal" : "PowerShell";

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Account</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">Troubleshoot integrations</h1>
        <p className="mt-2 text-sm text-muted">
          Copy commands into {terminalLabel}. Replace <code className="text-ink">YOUR_CODE</code> with a pairing code
          from this page while signed in.
        </p>
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {OS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setOs(tab.id)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
              os === tab.id ? "border-ink bg-ink text-cream" : "border-line text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-8 space-y-5">
        <CommandSection
          title="1. Check connection status"
          description="Each command should show connected: true for the matching tool."
          lines={troubleshootStatusCommands(os)}
          label={terminalLabel}
        />

        <CommandSection
          title="2. Full reinstall (all coding agents)"
          description="Downloads the latest pack, reinstalls Claude Code, Cursor, and Codex, pairs your account, and verifies tracking."
          lines={[troubleshootReinstallCommand(os)]}
          label={terminalLabel}
        />

        <CommandSection
          title="3. Fix split accounts & sync hooks"
          description="Use if stats look split across emails or hooks stopped firing after an update."
          lines={[troubleshootFixAccountCommand(os)]}
          label={terminalLabel}
        />

        <CommandSection
          title="4. Remove old plugins before reinstall"
          description="Run these first if step 2 fails or you see duplicate Promptly plugins."
          lines={troubleshootUninstallCommands(os)}
          label={terminalLabel}
        />

        <CommandSection
          title="5. Run diagnostics"
          description="Simulates a full prompt cycle and prints whether telemetry uploads succeed."
          lines={[troubleshootDiagnosticsCommand(os)]}
          label={terminalLabel}
        />

        <section className="rounded-2xl border border-line bg-cream p-5">
          <h2 className="text-sm font-semibold text-ink">Browser extension not working?</h2>
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
            <li>Allow the extension on all sites if your browser asks for permission.</li>
            <li>Disable other prompt-blocking extensions on the same AI tab and try again.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-cream p-5">
          <h2 className="text-sm font-semibold text-ink">Coding agents still not tracking?</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Quit and reopen Claude Code, Cursor, or Codex after running the install command.</li>
            <li>Allow Promptly hooks when each agent prompts you.</li>
            <li>
              In Codex on Mac, run <code className="text-ink">/hooks</code> and trust Promptly if needed. On Windows,
              hooks are pre-trusted during install (no /hooks command).
            </li>
            <li>Send a test prompt, then check status commands in step 1.</li>
          </ul>
        </section>
      </div>

      <Link href="/account" className="mt-8 block text-center text-xs text-faint hover:text-ink">
        ← Back to account
      </Link>
    </div>
  );
}
