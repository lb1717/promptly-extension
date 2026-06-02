"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";

const REPO_CLONE = "https://github.com/lb1717/promptly-extension.git";
const TELEMETRY_CLI = "integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs";

type IdeToolId = "claude_code" | "cursor" | "codex";

const TOOL_TABS: { id: IdeToolId; label: string; accent: string }[] = [
  { id: "claude_code", label: "Claude Code", accent: "#D97757" },
  { id: "cursor", label: "Cursor", accent: "#00D8FF" },
  { id: "codex", label: "Codex", accent: "#10A37F" }
];

function CopyBlock({ lines, label }: { lines: string[]; label?: string }) {
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
    <div className="relative mt-3 overflow-hidden rounded-xl border border-line bg-ink">
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
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">
        {n}
      </span>
      <div className="min-w-0 flex-1 pb-6">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <div className="mt-1.5 text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

function ToolInstructions({ tool }: { tool: IdeToolId }) {
  const pairUrl = `/auth/integrations?tool=${tool}`;
  const loginCmd = `node ${TELEMETRY_CLI} login YOUR_CODE --tool ${tool}`;

  if (tool === "claude_code") {
    return (
      <ol className="mt-2 list-none space-y-0">
        <Step n={1} title="Get the plugin files">
          <p>
            Clone the Promptly repo on your machine (one time). You need the <code className="text-ink">integrations/</code>{" "}
            folder for the marketplace.
          </p>
          <CopyBlock label="Terminal" lines={[`git clone ${REPO_CLONE}`, "cd promptly-extension"]} />
        </Step>
        <Step n={2} title="Install in Claude Code">
          <p>
            Open Claude Code in the cloned repo directory (or pass the full path to{" "}
            <code className="text-ink">integrations</code>). Add the marketplace and install the plugin:
          </p>
          <CopyBlock
            label="Inside Claude Code"
            lines={[
              "/plugin marketplace add ./integrations",
              "/plugin install promptly-claude-code@promptly-labs",
              "/reload-plugins"
            ]}
          />
          <p className="mt-2 text-xs text-faint">
            When asked, <strong className="text-ink">trust the plugin hooks</strong> so Promptly can count prompts and
            session time. Hooks run in the background and never block your agent.
          </p>
        </Step>
        <Step n={3} title="Connect your Promptly account">
          <p>
            <Link href={pairUrl} className="font-medium text-ink underline hover:no-underline">
              Open the pairing page
            </Link>
            , sign in with the same account you use on Promptly, and copy the 8-character code. Then run:
          </p>
          <CopyBlock label="Terminal" lines={[loginCmd.replace("YOUR_CODE", "ABCD1234")]} />
          <p className="mt-2 text-xs text-faint">
            Check connection:{" "}
            <code className="text-ink">node {TELEMETRY_CLI} status</code>
          </p>
        </Step>
        <Step n={4} title="Use Claude Code normally">
          <p>
            Send prompts as usual. Promptly records <strong className="text-ink">how many prompts</strong> you send and{" "}
            <strong className="text-ink">time spent</strong> in the agent — not the text of your prompts.
          </p>
          <p className="mt-2">
            View stats under{" "}
            <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
              Statistics → Coding agents
            </Link>
            .
          </p>
        </Step>
      </ol>
    );
  }

  if (tool === "cursor") {
    return (
      <ol className="mt-2 list-none space-y-0">
        <Step n={1} title="Get the plugin files">
          <p>Clone the repo if you have not already:</p>
          <CopyBlock label="Terminal" lines={[`git clone ${REPO_CLONE}`, "cd promptly-extension"]} />
        </Step>
        <Step n={2} title="Install the Cursor plugin">
          <p>Copy the Cursor plugin into Cursor&apos;s local plugins folder, then reload the window.</p>
          <CopyBlock
            label="Terminal (macOS / Linux)"
            lines={[
              "mkdir -p ~/.cursor/plugins/local",
              "cp -R integrations/cursor ~/.cursor/plugins/local/promptly-cursor"
            ]}
          />
          <p className="mt-2 text-xs text-faint">
            In Cursor: <strong className="text-ink">Developer → Reload Window</strong>. Enable the Promptly MCP server
            under Settings → MCP if you want connect/login tools in chat.
          </p>
        </Step>
        <Step n={3} title="Connect your Promptly account">
          <p>
            <Link href={pairUrl} className="font-medium text-ink underline hover:no-underline">
              Get a pairing code
            </Link>{" "}
            and run:
          </p>
          <CopyBlock label="Terminal" lines={[loginCmd.replace("YOUR_CODE", "ABCD1234")]} />
        </Step>
        <Step n={4} title="Use Cursor Agent / Composer">
          <p>
            Prompt sends and session time are tracked automatically. Stats appear in the{" "}
            <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
              Coding agents
            </Link>{" "}
            section on your statistics page.
          </p>
        </Step>
      </ol>
    );
  }

  return (
    <ol className="mt-2 list-none space-y-0">
      <Step n={1} title="Get the plugin files">
        <p>Clone the repo and open a terminal in the project root:</p>
        <CopyBlock label="Terminal" lines={[`git clone ${REPO_CLONE}`, "cd promptly-extension"]} />
      </Step>
      <Step n={2} title="Install in Codex">
        <p>Add the marketplace from the <code className="text-ink">integrations</code> folder and install the Codex plugin:</p>
        <CopyBlock
          label="Terminal"
          lines={[
            "codex plugin marketplace add ./integrations",
            "codex plugin install promptly-codex@promptly-labs"
          ]}
        />
        <p className="mt-2 text-xs text-faint">
          Review and <strong className="text-ink">trust plugin hooks</strong> when Codex prompts you on first enable.
        </p>
      </Step>
      <Step n={3} title="Connect your Promptly account">
        <p>
          <Link href={pairUrl} className="font-medium text-ink underline hover:no-underline">
            Pair your account
          </Link>
          , then:
        </p>
        <CopyBlock label="Terminal" lines={[loginCmd.replace("YOUR_CODE", "ABCD1234")]} />
      </Step>
      <Step n={4} title="Use Codex normally">
        <p>
          Your prompt counts and screen time show up on{" "}
          <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
            /account/statistics
          </Link>{" "}
          (scroll to <strong className="text-ink">Coding agents</strong>).
        </p>
      </Step>
    </ol>
  );
}

export function IntegrationsHubClient() {
  const [activeTool, setActiveTool] = useState<IdeToolId>("claude_code");
  const activeMeta = useMemo(() => TOOL_TABS.find((t) => t.id === activeTool)!, [activeTool]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
      {/* Hero */}
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Coding agents</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Connect Claude Code, Cursor &amp; Codex
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Track how much you prompt and how long you spend in each coding agent — on the same Promptly account as your
          browser extension. We only store counts and timing, never your prompt text.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/auth/integrations?tool=${activeTool}`}
            className="inline-flex items-center justify-center rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
          >
            Connect account
          </Link>
          <Link
            href="/account/statistics"
            className="inline-flex items-center justify-center rounded-xl border border-line bg-cream px-5 py-2.5 text-sm font-semibold text-ink hover:bg-cream-dark"
          >
            View statistics
          </Link>
        </div>
      </div>

      {/* How it works */}
      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Install",
            body: "Add the Promptly plugin for your agent (one-time setup per machine)."
          },
          {
            title: "Connect",
            body: "Sign in on Promptly and paste a short pairing code in your terminal."
          },
          {
            title: "Track",
            body: "Use the agent as usual. Stats sync to your account automatically."
          }
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-line bg-cream p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">{item.title}</p>
            <p className="mt-2 text-sm text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      {/* Prerequisites */}
      <section className="mt-8 rounded-2xl border border-line bg-cream-dark p-5">
        <h2 className="text-sm font-semibold text-ink">Before you start</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li className="flex gap-2">
            <span className="text-faint">•</span>
            A free{" "}
            <Link href="/account" className="font-medium text-ink underline hover:no-underline">
              Promptly account
            </Link>
          </li>
          <li className="flex gap-2">
            <span className="text-faint">•</span>
            <strong className="font-medium text-ink">Node.js 18+</strong> on your PATH (<code className="text-ink">node --version</code>)
          </li>
          <li className="flex gap-2">
            <span className="text-faint">•</span>
            Git, to clone the repo once (commands below include the clone URL)
          </li>
        </ul>
      </section>

      {/* Per-tool instructions */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Setup by tool</h2>
        <p className="mt-1 text-sm text-muted">Pick your coding agent for step-by-step instructions.</p>

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
            <h3 className="text-lg font-semibold text-ink">{activeMeta.label}</h3>
            <Link
              href={`/auth/integrations?tool=${activeTool}`}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream-dark"
            >
              Get pairing code →
            </Link>
          </div>
          <ToolInstructions tool={activeTool} />
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-10 rounded-2xl border border-line bg-cream p-5 shadow-card sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-faint">Common questions</h2>
        <dl className="mt-4 space-y-5">
          <div>
            <dt className="text-sm font-semibold text-ink">Do you read my prompts?</dt>
            <dd className="mt-1 text-sm text-muted">
              No. We only send metadata: prompt counts, word-count estimates, session duration, and engagement phases
              (drafting, waiting, idle). Prompt text is discarded on your machine before anything is uploaded.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink">Where do I see my stats?</dt>
            <dd className="mt-1 text-sm text-muted">
              On{" "}
              <Link href="/account/statistics" className="underline hover:text-ink">
                /account/statistics
              </Link>
              , scroll to the <strong className="text-ink">Coding agents</strong> section at the bottom — separate from
              web ChatGPT / Claude / Gemini charts.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink">Pairing code expired?</dt>
            <dd className="mt-1 text-sm text-muted">
              Codes last about 10 minutes. Open{" "}
              <Link href={`/auth/integrations?tool=${activeTool}`} className="underline hover:text-ink">
                /auth/integrations
              </Link>{" "}
              again and generate a new one.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink">Hooks not firing or stats stay empty?</dt>
            <dd className="mt-1 text-sm text-muted">
              Confirm <code className="text-ink">node {TELEMETRY_CLI} status</code> shows connected, hooks are trusted,
              and you ran <code className="text-ink">/reload-plugins</code> (Claude Code) or reloaded Cursor. Send a
              test prompt and refresh statistics after a minute.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink">Same account as the browser extension?</dt>
            <dd className="mt-1 text-sm text-muted">
              Yes. Sign in with the same email when pairing. Web chat stats and coding-agent stats stay in separate
              chart sections for now.
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-8 text-center text-xs text-faint">
        Need the extension for ChatGPT, Claude, and Gemini in the browser?{" "}
        <Link href="/get-started" className="underline hover:text-ink">
          Get started
        </Link>
      </p>
    </div>
  );
}
