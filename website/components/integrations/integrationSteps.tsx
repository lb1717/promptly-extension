import type { ReactNode } from "react";
import { CopyBlock } from "./integrationCopyBlock";
import { ConnectAccountStep } from "./integrationPairing";
import {
  claudeMarketplaceCommand,
  installCommands,
  installScriptUrl,
  NODE_INSTALL_URL,
  PLUGIN_PACK_URL,
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
  return os === "mac" ? "Terminal (zsh)" : "PowerShell";
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
          After your account shows connected, <strong className="text-ink">real Codex prompts only count after this:</strong>
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
          After your account shows connected, <strong className="text-ink">live tracking needs hook permission:</strong>
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
        After your account shows connected, <strong className="text-ink">Cursor needs a reload to pick up hooks:</strong>
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

function InstallStep({ n, os, tool }: { n: number; os: OsId; tool: IdeToolId }) {
  const toolLabel =
    tool === "codex" ? "Codex" : tool === "cursor" ? "Cursor" : "Claude Code";

  return (
    <Step
      n={n}
      title={`Install Promptly for ${toolLabel}`}
      where="terminal"
      whereLabel={terminalWhereLabel(os)}
      commands={installCommands(os, tool)}
      validation={[
        `Ends with "Promptly installed for ${toolLabel}" or "plugin pack ready"`,
        tool === "claude_code"
          ? "Claude Code CLI ready (if you didn't have it already)"
          : tool === "codex"
            ? "Codex CLI ready and promptly-codex in plugin list"
            : "Cursor plugin OK"
      ]}
    >
      <p>
        One command downloads the plugin pack, checks prerequisites, and installs everything for {toolLabel}. Requires
        Node.js — install from{" "}
        <a href={NODE_INSTALL_URL} className="font-medium text-ink underline hover:no-underline">
          nodejs.org
        </a>{" "}
        if the script stops early.
      </p>
      <p className="mt-2 text-xs text-faint">
        Script:{" "}
        <a href={installScriptUrl(os, tool)} className="underline hover:text-ink">
          {installScriptUrl(os, tool)}
        </a>
        {" · "}
        <a href={PLUGIN_PACK_URL} className="underline hover:text-ink">
          zip only
        </a>
      </p>
      {tool === "codex" ? (
        <StepNote>
          <strong className="text-ink">Using the Codex desktop app?</strong> You still need the CLI once — this script
          installs it if missing. After setup, keep using the app as usual.
        </StepNote>
      ) : null}
      {tool === "claude_code" ? (
        <StepNote>
          <strong className="text-ink">Claude desktop app ≠ Claude Code.</strong> This installs the{" "}
          <code className="text-ink">claude</code> terminal agent and downloads the plugin pack. Step 2 registers the
          plugin inside Claude Code.
        </StepNote>
      ) : null}
      {tool === "cursor" ? (
        <StepNote>
          <strong className="text-ink">Need the Cursor app installed.</strong> This step only copies the plugin files —
          open Cursor separately if you haven&apos;t already.
        </StepNote>
      ) : null}
    </Step>
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
      <InstallStep n={1} os={os} tool={tool} />

      <Step
        n={2}
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

      <ConnectAccountStep n={3} os={os} tool={tool} />
      <LiveTrackingStep n={4} tool={tool} os={os} />
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
