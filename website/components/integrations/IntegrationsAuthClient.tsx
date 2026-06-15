"use client";

import { resolveGoogleSignInError } from "@/lib/firebaseAuthAccountHints";
import { listenForGoogleSignInReturn, signInWithGoogleInteractive } from "@/lib/firebaseGoogleAuth";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged, type User } from "firebase/auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fullSetupCommands, type IdeToolId, type OsId } from "./integrationOs";

type IdeTool = IdeToolId;

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
  const [copiedSetup, setCopiedSetup] = useState(false);
  const [activeOs, setActiveOs] = useState<OsId>("mac");

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
      if (next) {
        setBusy(false);
      }
    });
  }, []);

  useEffect(() => {
    return listenForGoogleSignInReturn({
      onError: (message) => {
        setError(resolveGoogleSignInError(new Error(message)).message);
        setBusy(false);
      },
      onSettled: () => setBusy(false)
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
      const returnTo = `${window.location.pathname}${window.location.search}`;
      await signInWithGoogleInteractive(returnTo);
    } catch (e) {
      setError(resolveGoogleSignInError(e).message);
      setBusy(false);
    }
  }

  async function copySetup() {
    if (!pairCode) return;
    try {
      await navigator.clipboard.writeText(fullSetupCommands(activeOs, tool, pairCode)[0]);
      setCopiedSetup(true);
      window.setTimeout(() => setCopiedSetup(false), 2000);
    } catch {
      setCopiedSetup(false);
    }
  }

  const toolLabel = TOOL_LABELS[tool];
  const setupCmd = pairCode ? fullSetupCommands(activeOs, tool, pairCode)[0] : null;
  const terminalLabel = activeOs === "mac" ? "Terminal" : "PowerShell";

  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
      <img src="/images/promptly-logo.png" alt="Promptly" className="mx-auto h-10 w-auto object-contain" />
      <h1 className="mt-6 text-center text-xl font-semibold text-ink">Connect {toolLabel}</h1>
      <p className="mt-2 text-center text-sm text-muted">
        One command installs Promptly and links your account.
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
              {expiresAt ? (
                <p className="text-center text-xs text-faint">
                  Code expires {new Date(expiresAt).toLocaleTimeString()} — copy and run soon.
                </p>
              ) : null}
              <div className="rounded-xl border border-line bg-white/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">Run in {terminalLabel}</p>
                  <div className="flex gap-1">
                    {(["mac", "windows"] as const).map((os) => (
                      <button
                        key={os}
                        type="button"
                        onClick={() => setActiveOs(os)}
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                          activeOs === os
                            ? "border-ink bg-ink text-cream"
                            : "border-line text-muted hover:text-ink"
                        }`}
                      >
                        {os === "mac" ? "Mac" : "Windows"}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void copySetup()}
                      className="ml-1 shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream"
                    >
                      {copiedSetup ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-ink p-3 font-mono text-xs leading-relaxed text-cream">
                  {setupCmd}
                </pre>
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
        <Link href="/account" className="underline hover:text-ink">
          View statistics
        </Link>
      </p>
    </div>
  );
}
