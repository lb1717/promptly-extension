"use client";

import { getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import type { User } from "firebase/auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type IdeTool = "claude_code" | "cursor" | "codex";

const TOOL_LABELS: Record<IdeTool, string> = {
  claude_code: "Claude Code",
  cursor: "Cursor",
  codex: "Codex"
};

function normalizeTool(raw: string | null): IdeTool {
  const v = String(raw || "claude_code")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (v === "cursor" || v === "codex") return v;
  return "claude_code";
}

function buildAgentPrompt(tool: IdeTool, label: string, code: string): string {
  return `Set up Promptly on ${label} for me.

My pairing code: ${code}
(Get a new code at promptly-labs.com/auth/integrations?tool=${tool} if it expired.)

Please install Promptly if needed, connect my account with that code (tool: ${tool}), and confirm I'm connected. Use the Promptly MCP tools (promptly_login, promptly_status) if you have them.

Only track metadata — prompt counts and time, not prompt content. Tell me when you're done.`;
}

export function IntegrationsAuthClient({ initialTool }: { initialTool?: string | null }) {
  const searchParams = useSearchParams();
  const tool = useMemo(
    () => normalizeTool(initialTool ?? searchParams.get("tool")),
    [initialTool, searchParams]
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const createPairCode = useCallback(async (current: User) => {
    setBusy(true);
    setError("");
    try {
      const token = await current.getIdToken(true);
      const res = await fetch("/api/integrations/pair", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tool })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setPairCode(String(data.code || ""));
      setExpiresAt(typeof data.expiresAt === "string" ? data.expiresAt : null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [tool]);

  useEffect(() => {
    if (!user || loading) return;
    void createPairCode(user);
  }, [user, loading, createPairCode]);

  async function handleGoogleSignIn() {
    setError("");
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!pairCode) return;
    try {
      await navigator.clipboard.writeText(pairCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(false);
    }
  }

  async function copyPrompt() {
    if (!pairCode) return;
    try {
      await navigator.clipboard.writeText(buildAgentPrompt(tool, TOOL_LABELS[tool], pairCode));
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      setCopiedPrompt(false);
    }
  }

  const toolLabel = TOOL_LABELS[tool];
  const agentPrompt = pairCode ? buildAgentPrompt(tool, toolLabel, pairCode) : null;

  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
      <img src="/images/promptly-logo.png" alt="Promptly" className="mx-auto h-10 w-auto object-contain" />
      <h1 className="mt-6 text-center text-xl font-semibold text-ink">Connect {toolLabel}</h1>
      <p className="mt-2 text-center text-sm text-muted">
        Sign in, copy your code, then paste the ready-made message into {toolLabel}.
      </p>

      {loading ? (
        <p className="mt-8 text-center text-sm text-muted">Loading…</p>
      ) : !user ? (
        <div className="mt-8 space-y-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGoogleSignIn()}
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
          >
            Sign in with Google
          </button>
          <p className="text-center text-xs text-faint">
            Or{" "}
            <Link href="/account" className="underline hover:text-ink">
              open your account
            </Link>{" "}
            first, then return here.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <p className="text-center text-sm text-muted">
            Signed in as <span className="font-medium text-ink">{user.email}</span>
          </p>
          {pairCode ? (
            <>
              <div className="rounded-xl border border-line bg-cream-dark p-4 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-faint">Pairing code</p>
                <p className="mt-2 font-mono text-3xl font-bold tracking-[0.35em] text-ink">{pairCode}</p>
                {expiresAt ? (
                  <p className="mt-2 text-xs text-faint">Expires {new Date(expiresAt).toLocaleTimeString()}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="mt-4 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream"
                >
                  {copiedCode ? "Copied" : "Copy code"}
                </button>
              </div>

              <div className="rounded-xl border border-line bg-white/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">Paste into {toolLabel}</p>
                  <button
                    type="button"
                    onClick={() => void copyPrompt()}
                    className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream"
                  >
                    {copiedPrompt ? "Copied" : "Copy message"}
                  </button>
                </div>
                <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-cream">
                  {agentPrompt}
                </pre>
                <p className="mt-3 text-xs text-faint">
                  Open {toolLabel}, start a chat, paste this message, and press Enter. The agent handles the rest.
                </p>
              </div>
            </>
          ) : (
            <p className="text-center text-sm text-muted">{busy ? "Generating code…" : "No code yet"}</p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void createPairCode(user)}
            className="w-full rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-cream-dark disabled:opacity-50"
          >
            Generate new code
          </button>
        </div>
      )}

      {error ? <p className="mt-4 text-center text-sm text-red-700">{error}</p> : null}

      <p className="mt-6 text-center text-xs text-faint">
        <Link href="/integrations" className="underline hover:text-ink">
          Setup guide
        </Link>
        {" · "}
        <Link href="/account/statistics" className="underline hover:text-ink">
          View statistics
        </Link>
      </p>
    </div>
  );
}
