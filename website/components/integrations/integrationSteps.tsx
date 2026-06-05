import type { ReactNode } from "react";
import { CopyBlock } from "./integrationCopyBlock";
import { ConnectAccountStep } from "./integrationPairing";
import {
  claudeIntegrationsFolder,
  claudePluginCommands,
  installCommands,
  PLUGIN_PACK_URL,
  type IdeToolId,
  type OsId
} from "./integrationOs";
import { StepValidation } from "./integrationUi";

export type { IdeToolId, OsId };
export { PLUGIN_PACK_URL };

export type Where = "terminal" | "claude_code" | "cursor_app" | "browser";

export type StepCommands = string[] | (string[])[];

const WHERE_LABEL: Record<Where, string> = {
  terminal: "Terminal",
  claude_code: "Claude Code",
  cursor_app: "Cursor",
  browser: "Browser"
};

function terminalWhereLabel(os: OsId): string {
  return os === "mac" ? "Terminal" : "PowerShell";
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
          <CopyBlock key={i} lines={lines} />
        ))}
        {validation?.length ? <StepValidation items={validation} /> : null}
      </div>
    </li>
  );
}

function ReloadWindowHint({ os }: { os: OsId }) {
  if (os === "mac") {
    return (
      <>
        <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Cmd+Shift+P</kbd> →{" "}
        <strong className="text-ink">Reload Window</strong>
      </>
    );
  }
  return (
    <>
      <kbd className="rounded border border-line bg-cream-dark px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+P</kbd> →{" "}
      <strong className="text-ink">Reload Window</strong>
    </>
  );
}

function LiveTrackingStep({ n, tool, os }: { n: number; tool: IdeToolId; os: OsId }) {
  if (tool === "codex") {
    return (
      <Step n={n} title="Trust hooks" where="cursor_app" whereLabel="Codex">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Quit and reopen Codex.</li>
          <li>
            Run <code className="text-ink">/hooks</code> and trust Promptly hooks.
          </li>
          <li>Send a prompt — check Statistics → Coding agents.</li>
        </ol>
      </Step>
    );
  }

  if (tool === "claude_code") {
    return (
      <Step n={n} title="Allow hooks" where="claude_code">
        <p>Send any prompt in Claude Code. If a popup asks about Promptly hooks, click <strong className="text-ink">Allow</strong>.</p>
        <p className="mt-2">Check Statistics → Coding agents to confirm it&apos;s tracking.</p>
      </Step>
    );
  }

  return (
    <Step n={n} title="Reload & allow hooks" where="cursor_app" whereLabel="Cursor">
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>
          <ReloadWindowHint os={os} />
        </li>
        <li>Allow Promptly hooks if asked.</li>
        <li>Send a prompt in Agent or Composer.</li>
      </ol>
    </Step>
  );
}

function InstallStep({ n, os, tool }: { n: number; os: OsId; tool: IdeToolId }) {
  return (
    <Step
      n={n}
      title="Install"
      where="terminal"
      whereLabel={terminalWhereLabel(os)}
      commands={installCommands(os, tool)}
      validation={['Ends with "Promptly installed" or "plugin pack ready"']}
    >
      Copy and paste into Terminal, then press Enter.
    </Step>
  );
}

function ClaudeInstallStep({ n, os }: { n: number; os: OsId }) {
  const folder = claudeIntegrationsFolder(os);
  const folderPick =
    os === "mac"
      ? "your home folder → the integrations folder"
      : "your user folder → the integrations folder";

  return (
    <li className="flex gap-4 pb-8 last:pb-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-ink">Install</h3>

        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">A. Download files</span>
            <span className="rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
              {terminalWhereLabel(os)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">Copy and paste into Terminal, then press Enter.</p>
          <CopyBlock lines={installCommands(os, "claude_code")} />
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">B. Add plugin in Claude Code</span>
            <span className="rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
              Claude Code
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Open Claude Code (<code className="text-ink">claude</code> in Terminal). Copy the block below and run each
            line in order.
          </p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>
              <code className="text-ink">/plugin marketplace add</code> opens a <strong className="text-ink">folder picker</strong>.
              Navigate to <strong className="text-ink">{folderPick}</strong> and select the{" "}
              <strong className="text-ink">integrations</strong> folder (path:{" "}
              <code className="text-ink">{folder}</code>). Then confirm — you should see a success message in Claude.
            </li>
            <li>
              <code className="text-ink">/plugin install …</code> installs Promptly from that marketplace.
            </li>
            <li>
              <code className="text-ink">/reload-plugins</code> loads the plugin.
            </li>
          </ol>
          <CopyBlock lines={claudePluginCommands()} />
        </div>

        <StepValidation
          items={[
            'Terminal ends with "plugin pack ready"',
            "Claude confirms the marketplace was added",
            "promptly-claude-code@promptly-labs shows in /plugin list"
          ]}
        />
      </div>
    </li>
  );
}

type SetupProps = { os: OsId; tool: IdeToolId };

export function CodexSetup({ os, tool }: SetupProps) {
  return (
    <ol className="mt-6 list-none space-y-0">
      <InstallStep n={1} os={os} tool={tool} />
      <ConnectAccountStep n={2} os={os} tool={tool} />
      <LiveTrackingStep n={3} tool={tool} os={os} />
    </ol>
  );
}

export function ClaudeCodeSetup({ os, tool }: SetupProps) {
  return (
    <ol className="mt-6 list-none space-y-0">
      <ClaudeInstallStep n={1} os={os} />
      <ConnectAccountStep n={2} os={os} tool={tool} />
      <LiveTrackingStep n={3} tool={tool} os={os} />
    </ol>
  );
}

export function CursorSetup({ os, tool }: SetupProps) {
  return (
    <ol className="mt-6 list-none space-y-0">
      <InstallStep n={1} os={os} tool={tool} />
      <ConnectAccountStep n={2} os={os} tool={tool} />
      <LiveTrackingStep n={3} tool={tool} os={os} />
    </ol>
  );
}
