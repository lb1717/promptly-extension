"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";

const REPO_CLONE = "https://github.com/lb1717/promptly-extension.git";
const REPO_DIR = "promptly-extension";
const TELEMETRY_CLI = "integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs";

type IdeToolId = "claude_code" | "cursor" | "codex";
type Where = "terminal" | "claude_code" | "cursor_app" | "codex_terminal" | "browser";

const TOOL_TABS: { id: IdeToolId; label: string; accent: string }[] = [
  { id: "claude_code", label: "Claude Code", accent: "#D97757" },
  { id: "cursor", label: "Cursor", accent: "#00D8FF" },
  { id: "codex", label: "Codex", accent: "#10A37F" }
];

const WHERE_LABEL: Record<Where, string> = {
  terminal: "In Terminal",
  claude_code: "In Claude Code",
  cursor_app: "In Cursor",
  codex_terminal: "In Terminal (Codex folder)",
  browser: "In your browser"
};

function CopyBlock({
  lines,
  label,
  hint
}: {
  lines: string[];
  label?: string;
  hint?: string;
}) {
  const text = lines.join("\n");
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
    <div className="mt-2">
      {hint ? <p className="mb-1.5 text-xs font-medium text-ink">{hint}</p> : null}
      <div className="relative overflow-hidden rounded-xl border border-line bg-ink">
        {label ? (
          <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
            {label}
          </div>
        ) : null}
        <pre className="overflow-x-auto p-3 pr-20 font-mono text-xs leading-relaxed text-cream">{text}</pre>
        <button
          type="button"
          onClick={() => void copy()}
          className="absolute right-2 top-2 rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-cream hover:bg-white/20"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function PasteStep({
  where,
  children,
  command,
  commandHint = "Copy, paste, then press Enter"
}: {
  where: Where;
  children: ReactNode;
  command: string | string[];
  commandHint?: string;
}) {
  const lines = Array.isArray(command) ? command : [command];
  return (
    <li className="flex gap-3 border-l-2 border-line pl-4 pb-5 last:pb-0">
      <div className="min-w-0 flex-1">
        <span className="inline-block rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
          {WHERE_LABEL[where]}
        </span>
        <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
        <CopyBlock lines={lines} hint={commandHint} />
      </div>
    </li>
  );
}

function StepSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="pb-8 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-cream">
          {n}
        </span>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </div>
      <ol className="mt-4 list-none space-y-0 pl-2">{children}</ol>
    </div>
  );
}

function ToolInstructions({ tool }: { tool: IdeToolId }) {
  const pairUrl = `/auth/integrations?tool=${tool}`;
  const loginExample = `node ${TELEMETRY_CLI} login ABCD1234 --tool ${tool}`;
  const statusCmd = `node ${TELEMETRY_CLI} status`;

  if (tool === "claude_code") {
    return (
      <div className="mt-4 space-y-2">
        <StepSection n={1} title="Download Promptly (one time)">
          <PasteStep where="terminal" command={`git clone ${REPO_CLONE}`}>
            Open <strong className="text-ink">Terminal</strong> (Mac) or your system terminal. Paste this and press
            Enter:
          </PasteStep>
          <PasteStep where="terminal" command={`cd ${REPO_DIR}`}>
            Go into the project folder:
          </PasteStep>
        </StepSection>

        <StepSection n={2} title="Install the plugin in Claude Code">
          <PasteStep where="terminal" command={`cd ~/${REPO_DIR}`} commandHint="If you cloned somewhere else, cd to that folder first">
            Make sure Terminal is in the repo folder (adjust the path if you cloned elsewhere):
          </PasteStep>
          <li className="flex gap-3 border-l-2 border-line pl-4 pb-5">
            <div className="min-w-0 flex-1">
              <span className="inline-block rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
                {WHERE_LABEL.claude_code}
              </span>
              <p className="mt-2 text-sm text-muted">
                Open <strong className="text-ink">Claude Code</strong> in that same folder (or any folder — we use{" "}
                <code className="text-ink">./integrations</code> relative to where you run the commands).
              </p>
              <p className="mt-2 text-sm text-muted">
                In the Claude Code chat box, paste <strong className="text-ink">one line at a time</strong> and press
                Enter after each:
              </p>
              <CopyBlock
                lines={["/plugin marketplace add ./integrations"]}
                hint="Paste line 1 → Enter"
              />
              <CopyBlock
                lines={["/plugin install promptly-claude-code@promptly-labs"]}
                hint="Paste line 2 → Enter"
              />
              <CopyBlock lines={["/reload-plugins"]} hint="Paste line 3 → Enter" />
              <p className="mt-3 text-xs text-faint">
                If Claude Code asks you to trust hooks, choose <strong className="text-ink">Allow / Trust</strong>.
              </p>
            </div>
          </li>
        </StepSection>

        <StepSection n={3} title="Connect your Promptly account">
          <li className="flex gap-3 border-l-2 border-line pl-4 pb-5">
            <div className="min-w-0 flex-1">
              <span className="inline-block rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
                {WHERE_LABEL.browser}
              </span>
              <p className="mt-2 text-sm text-muted">
                <Link href={pairUrl} className="font-semibold text-ink underline hover:no-underline">
                  Open the pairing page
                </Link>
                , sign in, and copy the <strong className="text-ink">8-character code</strong> (example:{" "}
                <code className="text-ink">ABCD1234</code>).
              </p>
            </div>
          </li>
          <PasteStep
            where="terminal"
            command={loginExample}
            commandHint="Replace ABCD1234 with your code → paste → Enter"
          >
            Back in <strong className="text-ink">Terminal</strong>, still in the{" "}
            <code className="text-ink">{REPO_DIR}</code> folder. Paste this (swap in your real code):
          </PasteStep>
          <PasteStep where="terminal" command={statusCmd}>
            You should see <strong className="text-ink">Connected</strong>. If not, generate a new code on the pairing
            page and run login again.
          </PasteStep>
        </StepSection>

        <StepSection n={4} title="Done — use Claude Code normally">
          <li className="flex gap-3 border-l-2 border-line pl-4 pb-0">
            <div className="min-w-0 flex-1 text-sm text-muted">
              <p>
                Send prompts in Claude Code as you usually would. Nothing else to click — tracking runs in the
                background.
              </p>
              <p className="mt-2">
                See charts on{" "}
                <Link href="/account/statistics" className="font-semibold text-ink underline hover:no-underline">
                  Statistics
                </Link>{" "}
                → scroll to <strong className="text-ink">Coding agents</strong>.
              </p>
            </div>
          </li>
        </StepSection>
      </div>
    );
  }

  if (tool === "cursor") {
    return (
      <div className="mt-4 space-y-2">
        <StepSection n={1} title="Download Promptly (one time)">
          <PasteStep where="terminal" command={`git clone ${REPO_CLONE}`}>
            Open <strong className="text-ink">Terminal</strong>. Paste and press Enter:
          </PasteStep>
          <PasteStep where="terminal" command={`cd ${REPO_DIR}`}>
            Enter the repo:
          </PasteStep>
        </StepSection>

        <StepSection n={2} title="Install the Cursor plugin">
          <PasteStep where="terminal" command="mkdir -p ~/.cursor/plugins/local">
            In Terminal (inside the <code className="text-ink">{REPO_DIR}</code> folder), run:
          </PasteStep>
          <PasteStep
            where="terminal"
            command="cp -R integrations/cursor ~/.cursor/plugins/local/promptly-cursor"
          >
            Then copy the plugin into Cursor:
          </PasteStep>
          <li className="flex gap-3 border-l-2 border-line pl-4 pb-5">
            <div className="min-w-0 flex-1">
              <span className="inline-block rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
                {WHERE_LABEL.cursor_app}
              </span>
              <p className="mt-2 text-sm text-muted">
                Open <strong className="text-ink">Cursor</strong>. Press{" "}
                <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Cmd+Shift+P</kbd>{" "}
                (Mac) or{" "}
                <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+P</kbd>{" "}
                (Windows), type <strong className="text-ink">Reload Window</strong>, and press Enter.
              </p>
            </div>
          </li>
        </StepSection>

        <StepSection n={3} title="Connect your Promptly account">
          <li className="flex gap-3 border-l-2 border-line pl-4 pb-5">
            <div className="min-w-0 flex-1">
              <span className="inline-block rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
                {WHERE_LABEL.browser}
              </span>
              <p className="mt-2 text-sm text-muted">
                <Link href={pairUrl} className="font-semibold text-ink underline hover:no-underline">
                  Open pairing page
                </Link>{" "}
                → sign in → copy your 8-character code.
              </p>
            </div>
          </li>
          <PasteStep
            where="terminal"
            command={loginExample}
            commandHint="Replace ABCD1234 with your code → paste → Enter"
          >
            In <strong className="text-ink">Terminal</strong> (in the <code className="text-ink">{REPO_DIR}</code>{" "}
            folder):
          </PasteStep>
          <PasteStep where="terminal" command={statusCmd}>
            Confirm you are connected:
          </PasteStep>
        </StepSection>

        <StepSection n={4} title="Done — use Cursor Agent">
          <li className="flex gap-3 border-l-2 border-line pl-4 pb-0">
            <div className="min-w-0 flex-1 text-sm text-muted">
              Use Composer or Agent as normal. Stats appear under{" "}
              <Link href="/account/statistics" className="font-semibold text-ink underline hover:no-underline">
                Statistics → Coding agents
              </Link>
              .
            </div>
          </li>
        </StepSection>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <StepSection n={1} title="Download Promptly (one time)">
        <PasteStep where="terminal" command={`git clone ${REPO_CLONE}`}>
          Open <strong className="text-ink">Terminal</strong>. Paste and press Enter:
        </PasteStep>
        <PasteStep where="terminal" command={`cd ${REPO_DIR}`}>
          Enter the repo:
        </PasteStep>
      </StepSection>

      <StepSection n={2} title="Install the plugin in Codex">
        <li className="flex gap-3 border-l-2 border-line pl-4 pb-5">
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
              {WHERE_LABEL.codex_terminal}
            </span>
            <p className="mt-2 text-sm text-muted">
              Stay in <strong className="text-ink">Terminal</strong> with your current folder set to{" "}
              <code className="text-ink">{REPO_DIR}</code> (you should see that name in your prompt). These are{" "}
              <strong className="text-ink">shell commands</strong>, not Codex chat messages — paste each line below
              into Terminal and press Enter:
            </p>
            <CopyBlock
              lines={["codex plugin marketplace add ./integrations"]}
              hint="Line 1 — paste in Terminal → Enter"
            />
            <CopyBlock
              lines={["codex plugin install promptly-codex@promptly-labs"]}
              hint="Line 2 — paste in Terminal → Enter"
            />
            <p className="mt-3 text-xs text-faint">
              Open the <strong className="text-ink">Codex</strong> app or run <code className="text-ink">codex</code>{" "}
              when you want to work. If Codex asks to trust plugin hooks, accept.
            </p>
          </div>
        </li>
      </StepSection>

      <StepSection n={3} title="Connect your Promptly account">
        <li className="flex gap-3 border-l-2 border-line pl-4 pb-5">
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
              {WHERE_LABEL.browser}
            </span>
            <p className="mt-2 text-sm text-muted">
              <Link href={pairUrl} className="font-semibold text-ink underline hover:no-underline">
                Open pairing page
              </Link>{" "}
              → sign in → copy your code.
            </p>
          </div>
        </li>
        <PasteStep
          where="terminal"
          command={loginExample}
          commandHint="Replace ABCD1234 with your code → paste → Enter"
        >
          In <strong className="text-ink">Terminal</strong> (still in <code className="text-ink">{REPO_DIR}</code>):
        </PasteStep>
        <PasteStep where="terminal" command={statusCmd}>
          Verify connection:
        </PasteStep>
      </StepSection>

      <StepSection n={4} title="Done — use Codex normally">
        <li className="flex gap-3 border-l-2 border-line pl-4 pb-0">
          <div className="min-w-0 flex-1 text-sm text-muted">
            <p>
              Open <strong className="text-ink">Codex</strong>, start a thread, and send prompts. Tracking is automatic
              after install + connect.
            </p>
            <p className="mt-2">
              View results on{" "}
              <Link href="/account/statistics" className="font-semibold text-ink underline hover:no-underline">
                /account/statistics
              </Link>{" "}
              (section: <strong className="text-ink">Coding agents</strong>).
            </p>
          </div>
        </li>
      </StepSection>
    </div>
  );
}

export function IntegrationsHubClient() {
  const [activeTool, setActiveTool] = useState<IdeToolId>("claude_code");
  const activeMeta = useMemo(() => TOOL_TABS.find((t) => t.id === activeTool)!, [activeTool]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Coding agents</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Connect Claude Code, Cursor &amp; Codex
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Follow the steps below: open the app, copy the exact command, paste, press Enter. Same Promptly account as
          the browser extension.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/auth/integrations?tool=${activeTool}`}
            className="inline-flex items-center justify-center rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
          >
            Get pairing code
          </Link>
          <Link
            href="/account/statistics"
            className="inline-flex items-center justify-center rounded-xl border border-line bg-cream px-5 py-2.5 text-sm font-semibold text-ink hover:bg-cream-dark"
          >
            View statistics
          </Link>
        </div>
      </div>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          { title: "1 · Install", body: "Clone repo + paste install commands in Terminal or the app." },
          { title: "2 · Connect", body: "Pairing page → copy code → paste login command in Terminal." },
          { title: "3 · Track", body: "Use the agent. Stats sync automatically." }
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-line bg-cream p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">{item.title}</p>
            <p className="mt-2 text-sm text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-2xl border border-amber-200/60 bg-amber-50/80 p-4">
        <p className="text-sm text-ink">
          <strong>Tip:</strong> Gray labels like <span className="rounded bg-cream-dark px-1.5 py-0.5 text-[10px] font-semibold uppercase">In Terminal</span>{" "}
          vs <span className="rounded bg-cream-dark px-1.5 py-0.5 text-[10px] font-semibold uppercase">In Claude Code</span>{" "}
          tell you <em>where</em> to paste. Commands starting with <code className="text-ink">/</code> go in the agent
          chat. Everything else goes in Terminal.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-cream-dark p-5">
        <h2 className="text-sm font-semibold text-ink">Before you start</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            •{" "}
            <Link href="/account" className="font-medium text-ink underline hover:no-underline">
              Promptly account
            </Link>{" "}
            (free)
          </li>
          <li>
            • <strong className="text-ink">Node.js 18+</strong> — run <code className="text-ink">node --version</code> in
            Terminal
          </li>
          <li>• <strong className="text-ink">Git</strong> — to clone the repo once</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Pick your app</h2>
        <p className="mt-1 text-sm text-muted">Full walkthrough for each tool.</p>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Coding agent">
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
          className="mt-4 rounded-2xl border border-line bg-cream p-5 shadow-card sm:p-6"
          role="tabpanel"
          aria-label={`${activeMeta.label} setup`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <h3 className="text-lg font-semibold text-ink">{activeMeta.label} setup</h3>
              <p className="mt-0.5 text-xs text-faint">~5 minutes · copy each block exactly</p>
            </div>
            <Link
              href={`/auth/integrations?tool=${activeTool}`}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-cream hover:bg-neutral-800"
            >
              Get pairing code
            </Link>
          </div>
          <ToolInstructions tool={activeTool} />
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-cream p-5 shadow-card sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Common questions</h2>
        <dl className="mt-4 space-y-5 text-sm">
          <div>
            <dt className="font-semibold text-ink">Do you save my prompt text?</dt>
            <dd className="mt-1 text-muted">No — only counts, timing, and word estimates.</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Codex: Terminal or inside the app?</dt>
            <dd className="mt-1 text-muted">
              Install commands (<code className="text-ink">codex plugin …</code>) run in{" "}
              <strong className="text-ink">Terminal</strong> from the repo folder. Open the Codex app to chat after
              that.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Claude Code: where do slash commands go?</dt>
            <dd className="mt-1 text-muted">
              Paste <code className="text-ink">/plugin …</code> into the <strong className="text-ink">Claude Code</strong>{" "}
              input — not Terminal.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Pairing code expired?</dt>
            <dd className="mt-1 text-muted">
              Codes last ~10 minutes.{" "}
              <Link href={`/auth/integrations?tool=${activeTool}`} className="underline hover:text-ink">
                Generate a new one
              </Link>
              .
            </dd>
          </div>
        </dl>
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
