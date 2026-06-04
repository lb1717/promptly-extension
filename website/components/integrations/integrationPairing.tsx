"use client";

import { openGoogleSignInInNewTab, waitForAuthenticatedUser } from "@/lib/firebaseGoogleAuth";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged, type User } from "firebase/auth";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CopyBlock } from "./integrationCopyBlock";
import {
  connectCommands,
  connectCommandsPowerShell,
  type IdeToolId,
  type OsId
} from "./integrationOs";
import { StepValidation } from "./integrationUi";

function windowsShellBlocks(cmd: string[], ps: string[]): (string[])[] {
  return [cmd, ps];
}

export function useIntegrationPairing(tool: IdeToolId) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const createPairCode = useCallback(
    async (current: User) => {
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
    },
    [tool]
  );

  const signInAndConnect = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      let current = auth.currentUser;
      if (!current) {
        const returnTo =
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : "/integrations";
        openGoogleSignInInNewTab(returnTo);
        current = await waitForAuthenticatedUser(120_000);
      }
      if (!current) {
        throw new Error("Sign-in did not complete. Finish Google sign-in in the other tab, then try again.");
      }
      await createPairCode(current);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [createPairCode]);

  const refreshCode = useCallback(async () => {
    if (!user) return;
    await createPairCode(user);
  }, [user, createPairCode]);

  return {
    user,
    loading,
    pairCode,
    expiresAt,
    busy,
    error,
    signInAndConnect,
    refreshCode
  };
}

export function ConnectAccountStep({
  n,
  os,
  tool
}: {
  n: number;
  os: OsId;
  tool: IdeToolId;
}) {
  const isWindows = os === "windows";
  const { user, loading, pairCode, expiresAt, busy, error, signInAndConnect, refreshCode } =
    useIntegrationPairing(tool);

  const code = pairCode ?? "YOUR_CODE";
  const terminalCommands = isWindows
    ? windowsShellBlocks(connectCommands("windows", tool, code), connectCommandsPowerShell(tool, code))
    : connectCommands("mac", tool, code);

  const terminalLabel = os === "mac" ? "Terminal (zsh)" : undefined;

  return (
    <li className="flex gap-4 pb-8 last:pb-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink">Connect your Promptly account</h3>
          <span className="rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
            Terminal
          </span>
        </div>

        <p className="mt-1 text-sm leading-relaxed text-muted">
          Click below to sign in and generate a one-time code. It fills into the command automatically — copy and run
          the whole block in {os === "mac" ? "Terminal" : "Command Prompt or PowerShell"}.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {loading ? (
            <span className="text-xs text-muted">Checking sign-in…</span>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void signInAndConnect()}
                className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
              >
                {busy ? "Working…" : pairCode ? "Regenerate code" : "Connect account"}
              </button>
              {user ? (
                <span className="text-xs text-muted">
                  Signed in as <span className="font-medium text-ink">{user.email}</span>
                </span>
              ) : (
                <span className="text-xs text-faint">Signs in with Google if needed</span>
              )}
              {pairCode && user ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refreshCode()}
                  className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-cream-dark disabled:opacity-50"
                >
                  New code
                </button>
              ) : null}
            </>
          )}
        </div>

        {pairCode ? (
          <div className="mt-3 rounded-lg border border-line bg-cream-dark px-3 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">Your pairing code</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-ink">{pairCode}</p>
            {expiresAt ? (
              <p className="mt-1 text-xs text-faint">Expires {new Date(expiresAt).toLocaleTimeString()}</p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

        {!pairCode ? (
          <div className="relative mt-3 overflow-hidden rounded-xl border border-dashed border-line bg-cream-dark/80">
            <div className="border-b border-line px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-faint">
              {terminalLabel ?? (isWindows ? "Command Prompt / PowerShell" : "Terminal")}
            </div>
            <pre className="p-3 font-mono text-xs leading-relaxed text-faint">
              {connectCommands(os, tool, "YOUR_CODE")[0]}
            </pre>
            <p className="border-t border-line px-3 py-2 text-xs text-faint">
              Connect account above to fill in your real code.
            </p>
          </div>
        ) : (
          <>
            {(Array.isArray(terminalCommands[0])
              ? (terminalCommands as (string[])[])
              : [terminalCommands as string[]]
            ).map((lines, i) => (
              <CopyBlock
                key={i}
                lines={lines}
                label={
                  (terminalCommands as (string[])[]).length > 1
                    ? i === 0
                      ? "Command Prompt"
                      : "PowerShell"
                    : terminalLabel
                }
              />
            ))}
          </>
        )}

        <StepValidation
          items={[
            'Shows Connected to Promptly as your@email.com',
            'Status output includes "connected": true',
            'If you see "Usage: login", re-run step 2 to get the latest plugin pack, then try again'
          ]}
        />

        <p className="mt-2 text-xs text-faint">
          Prefer a separate page?{" "}
          <Link href={`/auth/integrations?tool=${tool}`} className="underline hover:text-ink">
            Open pairing page
          </Link>
        </p>
      </div>
    </li>
  );
}
