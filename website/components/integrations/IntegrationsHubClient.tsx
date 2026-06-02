"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";

type IdeToolId = "claude_code" | "cursor" | "codex";
type Where = "terminal" | "claude_code" | "cursor_app" | "browser";

const PLUGIN_PACK_URL = "https://promptly-labs.com/downloads/promptly-coding-agents.zip";
const INTEGRATIONS_DIR = "$HOME/integrations";
const TELEMETRY_CLI = `node ${INTEGRATIONS_DIR}/packages/telemetry-cli/bin/promptly-telemetry.mjs`;

const TOOL_TABS: { id: IdeToolId; label: string; accent: string }[] = [
  { id: "claude_code", label: "Claude Code", accent: "#D97757" },
  { id: "cursor", label: "Cursor", accent: "#00D8FF" },
  { id: "codex", label: "Codex", accent: "#10A37F" }
];

const WHERE_LABEL: Record<Where, string> = {
  terminal: "Terminal",
  claude_code: "Claude Code chat",
  cursor_app: "Cursor",
  browser: "Browser"
};

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
    <div className="relative mt-2 overflow-hidden rounded-xl border border-line bg-ink">
      {label ? (
        <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
          {label}
        </div>
      ) : null}
      <pre className="overflow-x-auto whitespace-pre-wrap p-3 pr-20 font-mono text-xs leading-relaxed text-cream">
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

function Step({
  n,
  title,
  where,
  children,
  commands
}: {
  n: number;
  title: string;
  where?: Where;
  children: ReactNode;
  commands?: string[] | string[][];
}) {
  const commandGroups = commands
    ? Array.isArray(commands[0])
      ? (commands as string[][])
      : [commands as string[]]
    : [];

  return (
    <li className="flex gap-4 pb-8 last:pb-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink">{title}</h3>
          {where ? (
            <span className="rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
              {WHERE_LABEL[where]}
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-sm leading-relaxed text-muted">{children}</div>
        {commandGroups.map((lines, i) => (
          <CopyBlock key={i} lines={lines} />
        ))}
      </div>
    </li>
  );
}

function ToolSetup({ tool, label }: { tool: IdeToolId; label: string }) {
  const pairUrl = `/auth/integrations?tool=${tool}`;
  const loginCmd = `${TELEMETRY_CLI} login YOUR_CODE --tool ${tool}`;
  const statusCmd = `${TELEMETRY_CLI} status`;

  const downloadSteps = (
    <Step
      n={1}
      title="Download the plugin pack"
      where="terminal"
      commands={[
        `curl -L -o "$HOME/promptly.zip" ${PLUGIN_PACK_URL}`,
        'unzip -o "$HOME/promptly.zip" -d "$HOME"',
        `ls "${INTEGRATIONS_DIR}/.claude-plugin/marketplace.json"`
      ]}
    >
      <p>
        This creates <code className="text-ink">{INTEGRATIONS_DIR}</code> on your Mac. The last command should print
        the marketplace file path — if it does, the download worked.
      </p>
      <p className="mt-2">
        Or{" "}
        <a href={PLUGIN_PACK_URL} className="font-medium text-ink underline hover:no-underline">
          download the zip in your browser
        </a>{" "}
        and unzip it into your home folder so you have an <code className="text-ink">integrations</code> folder at{" "}
        <code className="text-ink">{INTEGRATIONS_DIR}</code>.
      </p>
    </Step>
  );

  if (tool === "codex") {
    return (
      <ol className="mt-6 list-none space-y-0">
        {downloadSteps}
        <Step
          n={2}
          title="Register the Promptly marketplace in Codex"
          where="terminal"
          commands={[`codex plugin marketplace add "${INTEGRATIONS_DIR}"`, "codex plugin marketplace list"]]}
        >
          Run in <strong className="text-ink">Terminal</strong> — not in the Codex chat. The list command should show{" "}
          <code className="text-ink">promptly-labs</code>.
        </Step>
        <Step
          n={3}
          title="Install the Codex plugin"
          where="terminal"
          commands={[
            "codex plugin add promptly-codex@promptly-labs",
            "codex plugin list"
          ]}
        >
          If <code className="text-ink">codex plugin add</code> is not found, try{" "}
          <code className="text-ink">codex plugin install promptly-codex@promptly-labs</code>. Restart Codex if the
          plugin does not appear. Accept hook trust if prompted.
        </Step>
        <Step n={4} title="Connect your Promptly account" where="browser">
          <p>
            <Link href={pairUrl} className="font-medium text-ink underline hover:no-underline">
              Sign in and get a pairing code
            </Link>
            , then run in Terminal (replace <code className="text-ink">YOUR_CODE</code>):
          </p>
          <CopyBlock lines={[loginCmd]} label="Terminal" />
          <CopyBlock lines={[statusCmd]} label="Should show Connected" />
        </Step>
        <Step n={5} title="Use Codex normally">
          Open Codex and send prompts. Stats appear under{" "}
          <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
            Statistics → Coding agents
          </Link>
          .
        </Step>
      </ol>
    );
  }

  if (tool === "claude_code") {
    return (
      <ol className="mt-6 list-none space-y-0">
        {downloadSteps}
        <Step
          n={2}
          title="Install the Claude Code plugin"
          where="claude_code"
          commands={[
            [`/plugin marketplace add ${INTEGRATIONS_DIR}`],
            ["/plugin install promptly-claude-code@promptly-labs"],
            ["/reload-plugins"]
          ]}
        >
          Open <strong className="text-ink">Claude Code</strong> and paste each line into the chat, one at a time,
          pressing Enter after each. If asked to trust hooks, allow.
        </Step>
        <Step n={3} title="Connect your Promptly account" where="browser">
          <p>
            <Link href={pairUrl} className="font-medium text-ink underline hover:no-underline">
              Sign in and get a pairing code
            </Link>
            , then run in Terminal:
          </p>
          <CopyBlock lines={[loginCmd]} label="Terminal" />
          <CopyBlock lines={[statusCmd]} label="Should show Connected" />
        </Step>
        <Step n={4} title="Use Claude Code normally">
          Send prompts as usual. View stats under{" "}
          <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
            Statistics → Coding agents
          </Link>
          .
        </Step>
      </ol>
    );
  }

  return (
    <ol className="mt-6 list-none space-y-0">
      {downloadSteps}
      <Step
        n={2}
        title="Install the Cursor plugin"
        where="terminal"
        commands={[
          "mkdir -p ~/.cursor/plugins/local",
          `cp -R "${INTEGRATIONS_DIR}/cursor" ~/.cursor/plugins/local/promptly-cursor`
        ]}
      >
        Then in Cursor press{" "}
        <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Cmd+Shift+P</kbd>{" "}
        (Mac) or{" "}
        <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+P</kbd>{" "}
        (Windows), type <strong className="text-ink">Reload Window</strong>, and press Enter.
      </Step>
      <Step n={3} title="Connect your Promptly account" where="browser">
        <p>
          <Link href={pairUrl} className="font-medium text-ink underline hover:no-underline">
            Sign in and get a pairing code
          </Link>
          , then run in Terminal:
        </p>
        <CopyBlock lines={[loginCmd]} label="Terminal" />
        <CopyBlock lines={[statusCmd]} label="Should show Connected" />
      </Step>
      <Step n={4} title="Use Cursor Agent normally">
        Use Composer or Agent as usual. Stats appear under{" "}
        <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
          Statistics → Coding agents
        </Link>
        .
      </Step>
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
          <ToolSetup tool={activeTool} label={activeMeta.label} />
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
