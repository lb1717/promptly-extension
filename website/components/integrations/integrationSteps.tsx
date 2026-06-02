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
  testTrackingCommands,
  testTrackingPowerShell,
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
        Press{" "}
        <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Cmd+Shift+P</kbd>,
        type <strong className="text-ink">Reload Window</strong>, and press Enter.
      </>
    );
  }
  return (
    <>
      Press{" "}
      <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+P</kbd>,
      type <strong className="text-ink">Reload Window</strong>, and press Enter.
    </>
  );
}

function LiveTrackingStep({ n, tool, os }: { n: number; tool: IdeToolId; os: OsId }) {
  if (tool === "codex") {
    return (
      <Step n={n} title="Trust hooks and restart Codex" where="cursor_app" whereLabel="Codex">
        <p>
          Step 5 confirms your account is linked. <strong className="text-ink">Real Codex prompts only count after this:</strong>
        </p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            <strong className="text-ink">Quit Codex completely</strong> and open it again (desktop app or{" "}
            <code className="text-ink">codex</code> in Terminal).
          </li>
          <li>
            In Codex, type <code className="text-ink">/hooks</code> and{" "}
            <strong className="text-ink">trust every Promptly hook</strong>. Without this, prompts are not tracked.
          </li>
          <li>Send any prompt in Codex — it should appear under Statistics → Coding agents within a minute.</li>
        </ol>
      </Step>
    );
  }

  if (tool === "claude_code") {
    return (
      <Step n={n} title="Allow hooks and restart Claude Code" where="claude_code">
        <p>
          Step 5 confirms your account is linked. <strong className="text-ink">Live tracking needs hook permission:</strong>
        </p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            In Claude Code, run <code className="text-ink">/reload-plugins</code>.
          </li>
          <li>
            If Claude asks to allow hooks from Promptly, choose <strong className="text-ink">Allow</strong> or{" "}
            <strong className="text-ink">Trust</strong>.
          </li>
          <li>
            If Claude was already open during setup, exit and run <code className="text-ink">claude</code> again.
          </li>
          <li>Send a prompt — it should appear under Statistics → Coding agents.</li>
        </ol>
      </Step>
    );
  }

  return (
    <Step n={n} title="Reload Cursor and send a prompt" where="cursor_app" whereLabel="Cursor">
      <p>
        Step 5 confirms your account is linked. <strong className="text-ink">Cursor needs a reload to pick up hooks:</strong>
      </p>
      <ol className="mt-2 list-decimal space-y-2 pl-5">
        <li>
          <ReloadWindowHint os={os} />
        </li>
        <li>
          If Cursor asks to allow hooks from the Promptly plugin, choose <strong className="text-ink">Allow</strong>.
        </li>
        <li>
          Open <strong className="text-ink">Agent</strong> or <strong className="text-ink">Composer</strong> and send a
          prompt — it should appear under Statistics → Coding agents.
        </li>
      </ol>
    </Step>
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
        Run in {terminalWhereLabel(os)}, not inside the Codex chat.
      </Step>

      <ConnectAccountStep n={4} os={os} tool={tool} />

      <Step
        n={5}
        title="Verify your account link"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(testTrackingCommands("windows", tool), testTrackingPowerShell(tool))
            : testTrackingCommands("mac", tool)
        }
        validation={[
          '"Test prompt uploaded" in Terminal',
          'Status still shows "connected": true',
          "Codex shows Connected on Statistics → Coding agents"
        ]}
      >
        <p>
          This uploads one test prompt to confirm Promptly sees your account. It does{" "}
          <strong className="text-ink">not</strong> replace step 6 — real Codex prompts still need trusted hooks.
        </p>
      </Step>

      <LiveTrackingStep n={6} tool={tool} os={os} />
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
        title="Verify your account link"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(testTrackingCommands("windows", tool), testTrackingPowerShell(tool))
            : testTrackingCommands("mac", tool)
        }
        validation={[
          '"Test prompt uploaded" in Terminal',
          "Claude Code shows Connected on Statistics → Coding agents"
        ]}
      >
        <p>
          Confirms Promptly sees your account. Complete step 6 so live Claude Code prompts are tracked automatically.
        </p>
      </Step>

      <LiveTrackingStep n={6} tool={tool} os={os} />
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
        validation={['"Cursor plugin OK" at the end']}
      >
        <p className="mt-2">You will reload Cursor again in step 6 after connecting your account.</p>
      </Step>

      <ConnectAccountStep n={4} os={os} tool={tool} />

      <Step
        n={5}
        title="Verify your account link"
        where="terminal"
        whereLabel={terminalWhereLabel(os)}
        commands={
          isWindows
            ? windowsShellBlocks(testTrackingCommands("windows", tool), testTrackingPowerShell(tool))
            : testTrackingCommands("mac", tool)
        }
        validation={[
          '"Test prompt uploaded" in Terminal',
          "Cursor shows Connected on Statistics → Coding agents"
        ]}
      >
        <p>Confirms Promptly sees your account. Complete step 6 so Agent/Composer prompts are tracked.</p>
      </Step>

      <LiveTrackingStep n={6} tool={tool} os={os} />
    </ol>
  );
}
