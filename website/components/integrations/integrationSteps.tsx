import type { ReactNode } from "react";
import { ConnectAccountStep } from "./integrationPairing";
import { PLUGIN_PACK_URL, type IdeToolId, type OsId } from "./integrationOs";

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

export function Step({
  n,
  title,
  where,
  whereLabel,
  children
}: {
  n: number;
  title: string;
  where?: Where;
  whereLabel?: string;
  children?: ReactNode;
}) {
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
      </div>
    </li>
  );
}

function LiveTrackingStep({ n, tool, os }: { n: number; tool: IdeToolId; os: OsId }) {
  const improveHint =
    tool === "claude_code" ? (
      <p className="mt-2">
        Improve a draft: type <code className="text-ink">/promptly</code> then your draft (or{" "}
        <code className="text-ink">/promptly-claude-code:promptly</code>). Run{" "}
        <code className="text-ink">/reload-plugins</code> once if it does not appear.
      </p>
    ) : tool === "codex" ? (
      <p className="mt-2">
        Improve a draft: type <code className="text-ink">/promptly-codex:promptly</code> then your
        draft.
      </p>
    ) : (
      <p className="mt-2">
        Improve a draft: type <code className="text-ink">/promptly</code> in chat, then your draft.
        Reload Cursor if it does not appear.
      </p>
    );

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
        {improveHint}
      </Step>
    );
  }

  if (tool === "claude_code") {
    return (
      <Step n={n} title="Allow hooks" where="claude_code">
        <p>Send any prompt in Claude Code. If a popup asks about Promptly hooks, click <strong className="text-ink">Allow</strong>.</p>
        <p className="mt-2">Check Statistics → Coding agents to confirm it&apos;s tracking.</p>
        {improveHint}
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
      {improveHint}
    </Step>
  );
}

type SetupProps = { os: OsId; tool: IdeToolId };

function AgentSetup({ os, tool }: SetupProps) {
  return (
    <ol className="mt-6 list-none space-y-0">
      <ConnectAccountStep n={1} os={os} tool={tool} />
      <LiveTrackingStep n={2} tool={tool} os={os} />
    </ol>
  );
}

export function CodexSetup(props: SetupProps) {
  return <AgentSetup {...props} />;
}

export function ClaudeCodeSetup(props: SetupProps) {
  return <AgentSetup {...props} />;
}

export function CursorSetup(props: SetupProps) {
  return <AgentSetup {...props} />;
}
