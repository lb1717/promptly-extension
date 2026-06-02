import Link from "next/link";
import type { ReactNode } from "react";
import { CopyBlock } from "./integrationCopyBlock";
import {
  claudeMarketplaceCommand,
  claudePrerequisiteCommands,
  claudePrerequisitePowerShell,
  codexMarketplaceCommands,
  codexMarketplacePowerShell,
  codexPluginInstallCommands,
  codexPluginInstallPowerShell,
  codexPrerequisiteCommands,
  codexPrerequisitePowerShell,
  connectCommands,
  connectCommandsPowerShell,
  cursorInstallCommands,
  cursorInstallCommandsPowerShell,
  cursorPrerequisiteCommands,
  cursorPrerequisitePowerShell,
  downloadCommands,
  downloadCommandsPowerShell,
  integrationsDir,
  NODE_INSTALL_URL,
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
  return os === "mac" ? "Terminal (zsh)" : "Terminal / PowerShell";
}

function windowsShellBlocks(macOrSingle: string[], ps: string[]): StepCommands {
  return [macOrSingle, ps];
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
          <CopyBlock
            key={i}
            lines={lines}
            label={commandGroups.length > 1 ? (i === 0 ? "Command Prompt / zsh" : "PowerShell") : undefined}
          />
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

function PrerequisiteStep({
  n,
  os,
  tool
}: {
  n: number;
  os: OsId;
  tool: "codex" | "claude_code" | "cursor";
}) {
  const isWindows = os === "windows";
  const commands =
    tool === "codex"
      ? isWindows
        ? windowsShellBlocks(codexPrerequisiteCommands("windows"), codexPrerequisitePowerShell())
        : codexPrerequisiteCommands("mac")
      : tool === "claude_code"
        ? isWindows
          ? windowsShellBlocks(claudePrerequisiteCommands("windows"), claudePrerequisitePowerShell())
          : claudePrerequisiteCommands("mac")
        : isWindows
          ? windowsShellBlocks(cursorPrerequisiteCommands("windows"), cursorPrerequisitePowerShell())
          : cursorPrerequisiteCommands("mac");

  const toolName =
    tool === "codex" ? "Codex CLI" : tool === "claude_code" ? "Claude Code CLI" : "Node.js";

  return (
    <Step
      n={n}
      title={tool === "cursor" ? "Check Node.js is installed" : `Install Node.js and ${toolName}`}
      where="terminal"
      whereLabel={terminalWhereLabel(os)}
      commands={commands}
    >
      <p>
        Paste the whole block and press Enter after each line (or run line by line). If Node.js is missing, install it
        from <a href={NODE_INSTALL_URL} className="font-medium text-ink underline hover:no-underline">nodejs.org</a>{" "}
        first, then run this again.
      </p>
      {tool !== "cursor" ? (
        <p className="mt-2">
          The script installs the CLI if it&apos;s not found and fixes PATH so <code className="text-ink">command not found</code>{" "}
          doesn&apos;t happen after <code className="text-ink">npm install -g</code>.
        </p>
      ) : null}
    </Step>
  );
}

export function DownloadStep({ os, n = 2 }: { os: OsId; n?: number }) {
  const dir = integrationsDir(os);
  const isWindows = os === "windows";

  return (
    <Step
      n={n}
      title="Download the plugin pack"
      where="terminal"
      whereLabel={terminalWhereLabel(os)}
      commands={
        isWindows
          ? windowsShellBlocks(downloadCommands("windows"), downloadCommandsPowerShell())
          : downloadCommands("mac")
      }
    >
      <p>
        Creates <code className="text-ink">{dir}</code>. Look for <code className="text-ink">Plugin pack OK</code> or{" "}
        <code className="text-ink">True</code> at the end.
      </p>
      <p className="mt-2">
        Or{" "}
        <a href={PLUGIN_PACK_URL} className="font-medium text-ink underline hover:no-underline">
          download the zip in your browser
        </a>{" "}
        and unzip into your user folder.
      </p>
    </Step>
  );
}

function ConnectStep({
  n,
  pairUrl,
  tool,
  os
}: {
  n: number;
  pairUrl: string;
  tool: IdeToolId;
  os: OsId;
}) {
  const isWindows = os === "windows";
  const code = "YOUR_CODE";
  return (
    <Step
      n={n}
      title="Connect your Promptly account"
      where="browser"
      commands={
        isWindows
          ? windowsShellBlocks(connectCommands("windows", tool, code), connectCommandsPowerShell(tool, code))
          : connectCommands("mac", tool, code)
      }
    >
      <p>
        <Link href={pairUrl} className="font-medium text-ink underline hover:no-underline">
          Sign in and get a pairing code
        </Link>
        , then run (replace <code className="text-ink">YOUR_CODE</code>):
      </p>
    </Step>
  );
}

type SetupProps = { os: OsId; pairUrl: string; tool: IdeToolId };

export function CodexSetup({ os, pairUrl, tool }: SetupProps) {
  const isWindows = os === "windows";
  return (
    <ol className="mt-6 list-none space-y-0">
      <PrerequisiteStep n={1} os={os} tool="codex" />
      <DownloadStep os={os} n={2} />
      <Step
        n={3}
        title="Register the Promptly marketplace"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(codexMarketplaceCommands("windows"), codexMarketplacePowerShell())
            : codexMarketplaceCommands("mac")
        }
      >
        Run in {terminalWhereLabel(os)}, not in the Codex chat. The list should include{" "}
        <code className="text-ink">promptly-labs</code>.
      </Step>
      <Step
        n={4}
        title="Install the Promptly plugin"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(codexPluginInstallCommands("windows"), codexPluginInstallPowerShell())
            : codexPluginInstallCommands("mac")
        }
      >
        Accept hook trust if prompted. Restart Codex if the plugin doesn&apos;t show up. You should see{" "}
        <code className="text-ink">promptly-codex</code> in the plugin list.
      </Step>
      <ConnectStep n={5} pairUrl={pairUrl} tool={tool} os={os} />
      <Step n={6} title="Use Codex normally">
        Open Codex and send prompts. Stats appear under{" "}
        <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
          Statistics → Coding agents
        </Link>
        .
      </Step>
    </ol>
  );
}

export function ClaudeCodeSetup({ os, pairUrl, tool }: SetupProps) {
  return (
    <ol className="mt-6 list-none space-y-0">
      <PrerequisiteStep n={1} os={os} tool="claude_code" />
      <DownloadStep os={os} n={2} />
      <Step
        n={3}
        title="Install the Promptly plugin in Claude Code"
        where="claude_code"
        commands={[
          [claudeMarketplaceCommand(os)],
          ["/plugin install promptly-claude-code@promptly-labs"],
          ["/reload-plugins"]
        ]}
      >
        Open <strong className="text-ink">Claude Code</strong> (run <code className="text-ink">claude</code> in Terminal
        if needed) and paste each line into the chat, one at a time. Allow hooks if asked.
      </Step>
      <ConnectStep n={4} pairUrl={pairUrl} tool={tool} os={os} />
      <Step n={5} title="Use Claude Code normally">
        Send prompts as usual. View stats under{" "}
        <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
          Statistics → Coding agents
        </Link>
        .
      </Step>
    </ol>
  );
}

export function CursorSetup({ os, pairUrl, tool }: SetupProps) {
  const isWindows = os === "windows";
  return (
    <ol className="mt-6 list-none space-y-0">
      <PrerequisiteStep n={1} os={os} tool="cursor" />
      <DownloadStep os={os} n={2} />
      <Step
        n={3}
        title="Install the Cursor plugin"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(cursorInstallCommands("windows"), cursorInstallCommandsPowerShell())
            : cursorInstallCommands("mac")
        }
      >
        <ReloadWindowHint os={os} />
        Look for <code className="text-ink">Cursor plugin OK</code> at the end.
      </Step>
      <ConnectStep n={4} pairUrl={pairUrl} tool={tool} os={os} />
      <Step n={5} title="Use Cursor Agent normally">
        Use Composer or Agent as usual. Stats appear under{" "}
        <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
          Statistics → Coding agents
        </Link>
        .
      </Step>
    </ol>
  );
}
