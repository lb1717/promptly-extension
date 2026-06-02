import Link from "next/link";
import type { ReactNode } from "react";
import { CopyBlock } from "./integrationCopyBlock";
import {
  claudeMarketplaceCommand,
  cursorInstallCommands,
  cursorInstallCommandsPowerShell,
  downloadCommands,
  downloadCommandsPowerShell,
  integrationsDir,
  marketplacePath,
  PLUGIN_PACK_URL,
  telemetryCli,
  type OsId
} from "./integrationOs";

export type IdeToolId = "claude_code" | "cursor" | "codex";
export type Where = "terminal" | "claude_code" | "cursor_app" | "browser";

export { PLUGIN_PACK_URL, telemetryCli, type OsId };

export type StepCommands = string[] | (string[])[];

const WHERE_LABEL: Record<Where, string> = {
  terminal: "Terminal",
  claude_code: "Claude Code chat",
  cursor_app: "Cursor",
  browser: "Browser"
};

function terminalWhereLabel(os: OsId): string {
  return os === "mac" ? "Terminal" : "Terminal / PowerShell";
}

export function Step({
  n,
  title,
  where,
  whereLabel,
  children,
  commands
}: {
  n: number;
  title: string;
  where?: Where;
  whereLabel?: string;
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
              {whereLabel ?? WHERE_LABEL[where]}
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

function ReloadWindowHint({ os }: { os: OsId }) {
  if (os === "mac") {
    return (
      <>
        Then in Cursor press{" "}
        <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Cmd+Shift+P</kbd>,
        type <strong className="text-ink">Reload Window</strong>, and press Enter.
      </>
    );
  }
  return (
    <>
      Then in Cursor press{" "}
      <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+P</kbd>,
      type <strong className="text-ink">Reload Window</strong>, and press Enter.
    </>
  );
}

export function DownloadStep({ os }: { os: OsId }) {
  const dir = integrationsDir(os);
  const isWindows = os === "windows";

  return (
    <Step
      n={1}
      title="Download the plugin pack"
      where="terminal"
      whereLabel={terminalWhereLabel(os)}
      commands={
        isWindows
          ? [downloadCommands(os), downloadCommandsPowerShell()]
          : downloadCommands(os)
      }
    >
      <p>
        This creates <code className="text-ink">{dir}</code> on your computer. You should see{" "}
        <code className="text-ink">Download OK</code> or <code className="text-ink">True</code> if it worked.
      </p>
      <p className="mt-2">
        Or{" "}
        <a href={PLUGIN_PACK_URL} className="font-medium text-ink underline hover:no-underline">
          download the zip in your browser
        </a>{" "}
        and unzip it into your user folder so you have an <code className="text-ink">integrations</code> folder at{" "}
        <code className="text-ink">{dir}</code>.
      </p>
      {isWindows ? (
        <p className="mt-2 text-xs text-faint">
          Windows: use the first block in Command Prompt, or the second in PowerShell.
        </p>
      ) : null}
    </Step>
  );
}

function ConnectStep({
  n,
  pairUrl,
  loginCmd,
  statusCmd,
  os
}: {
  n: number;
  pairUrl: string;
  loginCmd: string;
  statusCmd: string;
  os: OsId;
}) {
  return (
    <Step n={n} title="Connect your Promptly account" where="browser">
      <p>
        <Link href={pairUrl} className="font-medium text-ink underline hover:no-underline">
          Sign in and get a pairing code
        </Link>
        , then run in {terminalWhereLabel(os)} (replace <code className="text-ink">YOUR_CODE</code>):
      </p>
      <CopyBlock lines={[loginCmd]} label={terminalWhereLabel(os)} />
      <CopyBlock lines={[statusCmd]} label="Should show Connected" />
    </Step>
  );
}

type SetupProps = { os: OsId; pairUrl: string; loginCmd: string; statusCmd: string };

export function CodexSetup({ os, pairUrl, loginCmd, statusCmd }: SetupProps) {
  const mp = marketplacePath(os);
  return (
    <ol className="mt-6 list-none space-y-0">
      <DownloadStep os={os} />
      <Step
        n={2}
        title="Register the Promptly marketplace in Codex"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={[`codex plugin marketplace add "${mp}"`, "codex plugin marketplace list"]}
      >
        Run in {terminalWhereLabel(os)}, not in the Codex chat. The list should include{" "}
        <code className="text-ink">promptly-labs</code>.
      </Step>
      <Step
        n={3}
        title="Install the Codex plugin"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={["codex plugin add promptly-codex@promptly-labs", "codex plugin list"]}
      >
        If <code className="text-ink">codex plugin add</code> fails, try{" "}
        <code className="text-ink">codex plugin install promptly-codex@promptly-labs</code>. Accept hook trust if
        prompted, then restart Codex if needed.
      </Step>
      <ConnectStep n={4} pairUrl={pairUrl} loginCmd={loginCmd} statusCmd={statusCmd} os={os} />
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

export function ClaudeCodeSetup({ os, pairUrl, loginCmd, statusCmd }: SetupProps) {
  return (
    <ol className="mt-6 list-none space-y-0">
      <DownloadStep os={os} />
      <Step
        n={2}
        title="Install the Claude Code plugin"
        where="claude_code"
        commands={[
          [claudeMarketplaceCommand(os)],
          ["/plugin install promptly-claude-code@promptly-labs"],
          ["/reload-plugins"]
        ]}
      >
        Open <strong className="text-ink">Claude Code</strong> and paste each line into the chat, one at a time,
        pressing Enter after each. If asked to trust hooks, allow.
      </Step>
      <ConnectStep n={3} pairUrl={pairUrl} loginCmd={loginCmd} statusCmd={statusCmd} os={os} />
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

export function CursorSetup({ os, pairUrl, loginCmd, statusCmd }: SetupProps) {
  const isWindows = os === "windows";
  return (
    <ol className="mt-6 list-none space-y-0">
      <DownloadStep os={os} />
      <Step
        n={2}
        title="Install the Cursor plugin"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? [cursorInstallCommands(os), cursorInstallCommandsPowerShell()]
            : cursorInstallCommands(os)
        }
      >
        <ReloadWindowHint os={os} />
        {isWindows ? (
          <p className="mt-2 text-xs text-faint">Use Command Prompt (first block) or PowerShell (second block).</p>
        ) : null}
      </Step>
      <ConnectStep n={3} pairUrl={pairUrl} loginCmd={loginCmd} statusCmd={statusCmd} os={os} />
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
