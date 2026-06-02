import Link from "next/link";
import type { ReactNode } from "react";
import { CopyBlock } from "./integrationCopyBlock";
import { ConnectAccountStep } from "./integrationPairing";
import {
  claudeCliSetupCommands,
  claudeCliSetupPowerShell,
  claudeMarketplaceCommand,
  codexCliSetupCommands,
  codexCliSetupPowerShell,
  codexPluginSetupCommands,
  codexPluginSetupPowerShell,
  cursorInstallCommands,
  cursorInstallCommandsPowerShell,
  downloadCommands,
  downloadCommandsPowerShell,
  integrationsDir,
  nodeCheckCommands,
  nodeCheckPowerShell,
  NODE_INSTALL_URL,
  PLUGIN_PACK_URL,
  verifyConnectionCommands,
  verifyConnectionPowerShell,
  type IdeToolId,
  type OsId
} from "./integrationOs";
import { StepNote, StepValidation } from "./integrationUi";

export type { IdeToolId, OsId };
export { PLUGIN_PACK_URL };

export type Where = "terminal" | "claude_code" | "cursor_app" | "browser";

export type StepCommands = string[] | (string[])[];

const WHERE_LABEL: Record<Where, string> = {
  terminal: "Terminal",
  claude_code: "Claude Code chat",
  cursor_app: "Cursor",
  browser: "Browser"
};

function terminalWhereLabel(os: OsId): string {
  return os === "mac" ? "Terminal (zsh)" : "Command Prompt / PowerShell";
}

function windowsShellBlocks(cmd: string[], ps: string[]): StepCommands {
  return [cmd, ps];
}

export function Step({
  n,
  title,
  where,
  whereLabel,
  children,
  commands,
  validation
}: {
  n: number;
  title: string;
  where?: Where;
  whereLabel?: string;
  children?: ReactNode;
  commands?: StepCommands;
  validation?: string[];
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
            label={
              commandGroups.length > 1
                ? i === 0
                  ? osLabelForBlock(i, commandGroups.length)
                  : "PowerShell"
                : undefined
            }
          />
        ))}
        {validation?.length ? <StepValidation items={validation} /> : null}
      </div>
    </li>
  );
}

function osLabelForBlock(index: number, total: number): string | undefined {
  if (total <= 1) return undefined;
  return index === 0 ? "Command Prompt" : "PowerShell";
}

function ReloadWindowHint({ os }: { os: OsId }) {
  if (os === "mac") {
    return (
      <>
        In Cursor press{" "}
        <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Cmd+Shift+P</kbd>,
        type <strong className="text-ink">Reload Window</strong>, Enter.
      </>
    );
  }
  return (
    <>
      In Cursor press{" "}
      <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+P</kbd>,
      type <strong className="text-ink">Reload Window</strong>, Enter.
    </>
  );
}

type SetupProps = { os: OsId; tool: IdeToolId };

export function CodexSetup({ os, tool }: SetupProps) {
  const isWindows = os === "windows";
  const dir = integrationsDir(os);

  return (
    <ol className="mt-6 list-none space-y-0">
      <Step
        n={1}
        title="Install the Codex CLI"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(codexCliSetupCommands("windows"), codexCliSetupPowerShell())
            : codexCliSetupCommands("mac")
        }
        validation={[
          "A version number from codex --version",
          'Final line: "Codex CLI ready" (or ✓ on Mac)'
        ]}
      >
        <StepNote>
          <strong className="text-ink">Using the Codex desktop app?</strong> That&apos;s fine — you still need the small
          CLI once to register the Promptly plugin. After setup, keep using the app as usual.
        </StepNote>
        <p className="mt-2">
          Requires Node.js. If the script stops, install from{" "}
          <a href={NODE_INSTALL_URL} className="font-medium text-ink underline hover:no-underline">
            nodejs.org
          </a>{" "}
          and rerun this step.
        </p>
      </Step>

      <Step
        n={2}
        title="Download the Promptly plugin pack"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(downloadCommands("windows"), downloadCommandsPowerShell())
            : downloadCommands("mac")
        }
        validation={['"Plugin pack OK" at the end (not "Failed")', `Folder exists at ${dir}`]}
      >
        <p>
          Or{" "}
          <a href={PLUGIN_PACK_URL} className="font-medium text-ink underline hover:no-underline">
            download the zip in your browser
          </a>{" "}
          and unzip into your user folder so you have <code className="text-ink">{dir}</code>.
        </p>
      </Step>

      <Step
        n={3}
        title="Install Promptly in Codex"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(codexPluginSetupCommands("windows"), codexPluginSetupPowerShell())
            : codexPluginSetupCommands("mac")
        }
        validation={[
          "promptly-labs appears when listing marketplaces",
          "promptly-codex appears in codex plugin list",
          '"Promptly plugin installed" at the end'
        ]}
      >
        Run in {terminalWhereLabel(os)}, not inside the Codex chat. Accept hook trust if prompted, then restart Codex.
      </Step>

      <ConnectAccountStep n={4} os={os} tool={tool} />

      <Step
        n={5}
        title="Verify Promptly is tracking"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(verifyConnectionCommands("windows"), verifyConnectionPowerShell())
            : verifyConnectionCommands("mac")
        }
        validation={[
          'Status shows "connected": true',
          "After one prompt in Codex, activity appears under Statistics → Coding agents"
        ]}
      >
        Send any prompt in Codex, then check{" "}
        <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
          Statistics → Coding agents
        </Link>
        . Counts may take a minute to update.
      </Step>
    </ol>
  );
}

export function ClaudeCodeSetup({ os, tool }: SetupProps) {
  const isWindows = os === "windows";
  const dir = integrationsDir(os);

  return (
    <ol className="mt-6 list-none space-y-0">
      <Step
        n={1}
        title="Install the Claude Code CLI"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(claudeCliSetupCommands("windows"), claudeCliSetupPowerShell())
            : claudeCliSetupCommands("mac")
        }
        validation={[
          "A version number from claude --version",
          'Final line: "Claude Code CLI ready"'
        ]}
      >
        <StepNote>
          <strong className="text-ink">Claude desktop app ≠ Claude Code.</strong> Promptly hooks into Claude Code — the
          terminal agent you start with the <code className="text-ink">claude</code> command.
        </StepNote>
      </Step>

      <Step
        n={2}
        title="Download the Promptly plugin pack"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(downloadCommands("windows"), downloadCommandsPowerShell())
            : downloadCommands("mac")
        }
        validation={['"Plugin pack OK" at the end', `Folder exists at ${dir}`]}
      >
        <p>
          Or{" "}
          <a href={PLUGIN_PACK_URL} className="font-medium text-ink underline hover:no-underline">
            download the zip in your browser
          </a>{" "}
          and unzip into your user folder.
        </p>
      </Step>

      <Step
        n={3}
        title="Install Promptly in Claude Code"
        where="claude_code"
        commands={[
          [claudeMarketplaceCommand(os)],
          ["/plugin install promptly-claude-code@promptly-labs"],
          ["/plugin list"],
          ["/reload-plugins"]
        ]}
        validation={[
          "promptly-claude-code@promptly-labs in /plugin list",
          "No error when reloading plugins",
          "Allow hooks if Claude asks"
        ]}
      >
        Open Claude Code (<code className="text-ink">claude</code> in Terminal) and paste each line into the chat, one at
        a time.
      </Step>

      <ConnectAccountStep n={4} os={os} tool={tool} />

      <Step
        n={5}
        title="Verify Promptly is tracking"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(verifyConnectionCommands("windows"), verifyConnectionPowerShell())
            : verifyConnectionCommands("mac")
        }
        validation={[
          'Status shows "connected": true',
          "After one prompt in Claude Code, activity appears under Statistics → Coding agents"
        ]}
      >
        Send any prompt, then check{" "}
        <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
          Statistics → Coding agents
        </Link>
        .
      </Step>
    </ol>
  );
}

export function CursorSetup({ os, tool }: SetupProps) {
  const isWindows = os === "windows";
  const dir = integrationsDir(os);

  return (
    <ol className="mt-6 list-none space-y-0">
      <Step
        n={1}
        title="Check Node.js"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(nodeCheckCommands("windows"), nodeCheckPowerShell())
            : nodeCheckCommands("mac")
        }
        validation={['"Node.js OK" and a version number']}
      >
        <StepNote>
          <strong className="text-ink">Need the Cursor app installed.</strong> This step only checks Node.js for the
          copy script. Open Cursor separately if you haven&apos;t already.
        </StepNote>
      </Step>

      <Step
        n={2}
        title="Download the Promptly plugin pack"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(downloadCommands("windows"), downloadCommandsPowerShell())
            : downloadCommands("mac")
        }
        validation={['"Plugin pack OK" at the end', `Folder exists at ${dir}`]}
      >
        <p>
          Or{" "}
          <a href={PLUGIN_PACK_URL} className="font-medium text-ink underline hover:no-underline">
            download the zip in your browser
          </a>
          .
        </p>
      </Step>

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
        validation={['"Cursor plugin OK" at the end', "Reload Window completes without errors"]}
      >
        <ReloadWindowHint os={os} />
      </Step>

      <ConnectAccountStep n={4} os={os} tool={tool} />

      <Step
        n={5}
        title="Verify Promptly is tracking"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(verifyConnectionCommands("windows"), verifyConnectionPowerShell())
            : verifyConnectionCommands("mac")
        }
        validation={[
          'Status shows "connected": true',
          "After one Agent/Composer prompt, activity appears under Statistics → Coding agents"
        ]}
      >
        Use Agent or Composer once, then check{" "}
        <Link href="/account/statistics" className="font-medium text-ink underline hover:no-underline">
          Statistics → Coding agents
        </Link>
        .
      </Step>
    </ol>
  );
}
