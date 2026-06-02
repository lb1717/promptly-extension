import Link from "next/link";
import type { ReactNode } from "react";
import { CopyBlock } from "./integrationCopyBlock";

export type IdeToolId = "claude_code" | "cursor" | "codex";
export type Where = "terminal" | "claude_code" | "cursor_app" | "browser";

export const PLUGIN_PACK_URL = "https://promptly-labs.com/downloads/promptly-coding-agents.zip";
export const INTEGRATIONS_DIR = "$HOME/integrations";
export const TELEMETRY_CLI = `node ${INTEGRATIONS_DIR}/packages/telemetry-cli/bin/promptly-telemetry.mjs`;

export type StepCommands = string[] | (string[])[];

const WHERE_LABEL: Record<Where, string> = {
  terminal: "Terminal",
  claude_code: "Claude Code chat",
  cursor_app: "Cursor",
  browser: "Browser"
};

export function Step({
  n,
  title,
  where,
  children,
  commands
}: {
  n: number;
  title: string;
  where?: Where;
  children?: ReactNode;
  commands?: StepCommands;
}) {
  const commandGroups: (string[])[] = !commands
    ? []
    : Array.isArray(commands[0])
      ? (commands as (string[])[])
      : [commands as string[]];

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
        {children ? <div className="mt-1 text-sm leading-relaxed text-muted">{children}</div> : null}
        {commandGroups.map((lines, i) => (
          <CopyBlock key={i} lines={lines} />
        ))}
      </div>
    </li>
  );
}

export function DownloadStep() {
  return (
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
        the marketplace file path if the download worked.
      </p>
      <p className="mt-2">
        Or{" "}
        <a href={PLUGIN_PACK_URL} className="font-medium text-ink underline hover:no-underline">
          download the zip
        </a>{" "}
        manually and unzip it into your home folder so you have an <code className="text-ink">integrations</code>{" "}
        folder.
      </p>
    </Step>
  );
}

function ConnectStep({ n, pairUrl, loginCmd, statusCmd }: { n: number; pairUrl: string; loginCmd: string; statusCmd: string }) {
  return (
    <Step n={n} title="Connect your Promptly account" where="browser">
      <p>
        <Link href={pairUrl} className="font-medium text-ink underline hover:no-underline">
          Sign in and get a pairing code
        </Link>
        , then run in Terminal (replace <code className="text-ink">YOUR_CODE</code>):
      </p>
      <CopyBlock lines={[loginCmd]} label="Terminal" />
      <CopyBlock lines={[statusCmd]} label="Should show Connected" />
    </Step>
  );
}

export function CodexSetup({ pairUrl, loginCmd, statusCmd }: { pairUrl: string; loginCmd: string; statusCmd: string }) {
  return (
    <ol className="mt-6 list-none space-y-0">
      <DownloadStep />
      <Step
        n={2}
        title="Register the Promptly marketplace in Codex"
        where="terminal"
        commands={[`codex plugin marketplace add "${INTEGRATIONS_DIR}"`, "codex plugin marketplace list"]}
      >
        Run in <strong className="text-ink">Terminal</strong>, not in the Codex chat. The list should include{" "}
        <code className="text-ink">promptly-labs</code>.
      </Step>
      <Step
        n={3}
        title="Install the Codex plugin"
        where="terminal"
        commands={["codex plugin add promptly-codex@promptly-labs", "codex plugin list"]}
      >
        If <code className="text-ink">codex plugin add</code> fails, try{" "}
        <code className="text-ink">codex plugin install promptly-codex@promptly-labs</code>. Accept hook trust if
        prompted, then restart Codex if needed.
      </Step>
      <ConnectStep n={4} pairUrl={pairUrl} loginCmd={loginCmd} statusCmd={statusCmd} />
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

export function ClaudeCodeSetup({ pairUrl, loginCmd, statusCmd }: { pairUrl: string; loginCmd: string; statusCmd: string }) {
  return (
    <ol className="mt-6 list-none space-y-0">
      <DownloadStep />
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
      <ConnectStep n={3} pairUrl={pairUrl} loginCmd={loginCmd} statusCmd={statusCmd} />
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

export function CursorSetup({ pairUrl, loginCmd, statusCmd }: { pairUrl: string; loginCmd: string; statusCmd: string }) {
  return (
    <ol className="mt-6 list-none space-y-0">
      <DownloadStep />
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
      <ConnectStep n={3} pairUrl={pairUrl} loginCmd={loginCmd} statusCmd={statusCmd} />
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
