"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

type IdeToolId = "claude_code" | "cursor" | "codex";

const TOOL_TABS: { id: IdeToolId; label: string; accent: string }[] = [
  { id: "claude_code", label: "Claude Code", accent: "#D97757" },
  { id: "cursor", label: "Cursor", accent: "#00D8FF" },
  { id: "codex", label: "Codex", accent: "#10A37F" }
];

function buildAgentPrompt(tool: IdeToolId, label: string): string {
  return `Set up Promptly on ${label} for me.

My pairing code: YOUR_CODE
(Get a new code at promptly-labs.com/auth/integrations?tool=${tool} if it expired.)

Please install Promptly if needed, connect my account with that code (tool: ${tool}), and confirm I'm connected. Use the Promptly MCP tools (promptly_login, promptly_status) if you have them.

Only track metadata — prompt counts and time, not prompt content. Tell me when you're done.`;
}

function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [text]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-ink">
      {label ? (
        <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
          {label}
        </div>
      ) : null}
      <pre className="overflow-x-auto whitespace-pre-wrap p-4 pr-20 font-mono text-xs leading-relaxed text-cream">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="absolute right-2 top-2 rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-cream hover:bg-white/20"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ToolSetup({ tool, label }: { tool: IdeToolId; label: string }) {
  const pairUrl = `/auth/integrations?tool=${tool}`;
  const prompt = buildAgentPrompt(tool, label);

  return (
    <ol className="mt-6 space-y-8">
      <li className="flex gap-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">
          1
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink">Get your pairing code</h3>
          <p className="mt-1 text-sm text-muted">
            Sign in to Promptly and copy the 8-character code. Codes expire after about 10 minutes.
          </p>
          <Link
            href={pairUrl}
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-neutral-800"
          >
            Connect account
          </Link>
        </div>
      </li>

      <li className="flex gap-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">
          2
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink">Paste into {label}</h3>
          <p className="mt-1 text-sm text-muted">
            Open {label}, start a chat, and paste the message below. Replace{" "}
            <code className="text-ink">YOUR_CODE</code> with your pairing code — the agent handles install and
            connect.
          </p>
          <div className="mt-3">
            <CopyBlock text={prompt} label={`Paste in ${label}`} />
          </div>
        </div>
      </li>

      <li className="flex gap-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cream-dark text-xs font-bold text-faint">
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink">Use {label} as normal</h3>
          <p className="mt-1 text-sm text-muted">
            Tracking runs in the background. View stats under{" "}
            <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
              Statistics → Coding agents
            </Link>
            .
          </p>
        </div>
      </li>
    </ol>
  );
}

export function IntegrationsHubClient() {
  const [activeTool, setActiveTool] = useState<IdeToolId>("codex");
  const activeMeta = useMemo(() => TOOL_TABS.find((t) => t.id === activeTool)!, [activeTool]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Coding agents</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Connect Claude Code, Cursor &amp; Codex
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          Two steps: get a code, paste one message into your agent. It installs and connects for you.
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
          <h2 className="text-lg font-semibold text-ink">{activeMeta.label}</h2>
          <ToolSetup tool={activeTool} label={activeMeta.label} />
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-faint">
        We never store prompt text — only counts and time.{" "}
        <Link href="/get-started" className="underline hover:text-ink">
          Browser extension
        </Link>{" "}
        for ChatGPT, Claude &amp; Gemini.
      </p>
    </div>
  );
}
