"use client";

import Link from "next/link";
import { useMemo } from "react";

const APP_URL = typeof window !== "undefined" ? window.location.origin : "https://promptly-labs.com";

function cursorMcpDeeplink() {
  const config = {
    type: "stdio",
    command: "node",
    args: ["-e", "console.error('Install Promptly Cursor plugin from /integrations first')"]
  };
  const encoded = typeof btoa !== "undefined" ? btoa(JSON.stringify(config)) : "";
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=Promptly&config=${encodeURIComponent(encoded)}`;
}

const TOOLS = [
  {
    id: "claude_code",
    name: "Claude Code",
    install: [
      "Clone github.com/promptly-labs/Promptly, then in Claude Code:",
      "/plugin marketplace add ./integrations",
      "/plugin install promptly-claude-code@promptly-labs",
      "/reload-plugins"
    ],
    note: "Trust hooks when prompted. Run /reload-plugins after install."
  },
  {
    id: "cursor",
    name: "Cursor",
    install: [
      "Copy integrations/cursor to ~/.cursor/plugins/local/promptly-cursor",
      "Restart Cursor (Developer: Reload Window)"
    ],
    note: "Or clone the repo and symlink the cursor plugin folder into ~/.cursor/plugins/local/"
  },
  {
    id: "codex",
    name: "Codex",
    install: [
      "codex plugin marketplace add ./integrations",
      "codex plugin install promptly-codex@promptly-labs"
    ],
    note: "Review and trust plugin hooks on first enable."
  }
] as const;

export function IntegrationsHubClient() {
  const deeplink = useMemo(() => (typeof window !== "undefined" ? cursorMcpDeeplink() : "#"), []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">Coding agent integrations</h1>
      <p className="mt-2 text-sm text-muted">
        Track prompts and screen time from Claude Code, Cursor, and Codex on your{" "}
        <Link href="/account/statistics" className="underline hover:text-ink">
          statistics page
        </Link>
        . Metadata only — Promptly never stores your prompt text from these tools.
      </p>

      <div className="mt-8 space-y-6">
        {TOOLS.map((tool) => (
          <section key={tool.id} className="rounded-2xl border border-line bg-cream p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">{tool.name}</h2>
              <Link
                href={`/auth/integrations?tool=${tool.id}`}
                className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-cream hover:bg-neutral-800"
              >
                Connect account
              </Link>
            </div>
            <p className="mt-1 text-xs text-faint">{tool.note}</p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
              {tool.install.map((line) => (
                <li key={line}>
                  <code className="rounded bg-cream-dark px-1.5 py-0.5 text-xs text-ink">{line}</code>
                </li>
              ))}
              <li>
                Open{" "}
                <Link href={`/auth/integrations?tool=${tool.id}`} className="underline hover:text-ink">
                  pairing page
                </Link>
                , sign in, run{" "}
                <code className="rounded bg-cream-dark px-1 text-xs">promptly-telemetry login CODE --tool {tool.id}</code>
              </li>
            </ol>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-line bg-cream-dark p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">CLI (all tools)</h2>
        <p className="mt-2 text-sm text-muted">
          From the repo:{" "}
          <code className="text-xs">node integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs</code>
        </p>
        <p className="mt-2 text-xs text-faint">
          Set <code>PROMPTLY_API_URL={APP_URL}</code> when testing against a local dev server.
        </p>
      </section>

      <p className="mt-6 text-center text-xs text-faint">
        <a href={deeplink} className="underline hover:text-ink">
          Cursor MCP install link (optional)
        </a>
      </p>
    </div>
  );
}
