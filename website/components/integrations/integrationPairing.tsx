"use client";

import { openGoogleSignInInNewTab, waitForAuthenticatedUser } from "@/lib/firebaseGoogleAuth";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { CopyBlock } from "./integrationCopyBlock";
import {
  allAgentsFullSetupCommands,
  allAgentsSetupValidationItems,
  fixAccountCommands,
  fullSetupCommands,
  type AllAgentsPairCodes,
  type IdeToolId,
  type OsId
} from "./integrationOs";
import { StepValidation } from "./integrationUi";

const ALL_TOOLS: IdeToolId[] = ["claude_code", "cursor", "codex"];

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

function installSuccessHint(tool: IdeToolId): string {
  if (tool === "claude_code") return "Promptly installed for Claude Code";
  if (tool === "codex") return "Promptly installed for Codex";
  return "Promptly installed for Cursor";
}

function toolStatusSnippet(tool: IdeToolId): string {
  return `"tool": "${tool}" and "connected": true`;
}

export function useAllAgentsPairing() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pairCodes, setPairCodes] = useState<Partial<AllAgentsPairCodes>>({});
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

  const hasAllCodes = Boolean(pairCodes.claude_code?.trim());

  const createAllPairCodes = useCallback(async (current: User) => {
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
        body: JSON.stringify({ tool: "claude_code" })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Pairing failed (${res.status})`);
      }
      const code = String(data.code || "");
      setPairCodes({
        claude_code: code,
        cursor: code,
        codex: code
      });
      setExpiresAt(typeof data.expiresAt === "string" ? data.expiresAt : null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, []);

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
      await createAllPairCodes(current);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [createAllPairCodes]);

  const refreshCodes = useCallback(async () => {
    if (!user) return;
    await createAllPairCodes(user);
  }, [user, createAllPairCodes]);

  return {
    user,
    loading,
    pairCodes,
    hasAllCodes,
    expiresAt,
    busy,
    error,
    signInAndConnect,
    refreshCodes
  };
}

export function AllAgentsConnectStep({
  n = 1,
  os,
  buttonLabel = "Press to Connect Account Now",
  compact = false,
  errorClassName = "text-red-700"
}: {
  n?: number;
  os: OsId;
  buttonLabel?: string;
  compact?: boolean;
  errorClassName?: string;
}) {
  const { loading, hasAllCodes, pairCodes, expiresAt, busy, error, signInAndConnect, refreshCodes } =
    useAllAgentsPairing();
  const terminalLabel = os === "mac" ? "Terminal" : "PowerShell";
  const commandLines =
    hasAllCodes && pairCodes.claude_code
      ? allAgentsFullSetupCommands(os, pairCodes as AllAgentsPairCodes)
      : [];

  const inner = (
    <>
      <div className={compact ? "mt-0" : "mt-3"}>
        {loading ? (
          <span className="text-xs text-muted">Loading…</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void signInAndConnect()}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
            >
              {busy ? "Generating command…" : buttonLabel}
            </button>
            {hasAllCodes ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshCodes()}
                className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-cream-dark disabled:opacity-50"
              >
                New codes
              </button>
            ) : null}
          </div>
        )}
      </div>

      {!hasAllCodes ? (
        <p className="mt-3 text-sm text-muted">
          Sign in with your Promptly account, then copy one command into {terminalLabel}. It removes old plugins,
          reinstalls Claude Code, Cursor, and Codex, pairs all three, and runs status checks.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">
            Copy this entire command into {terminalLabel} — install, connect, and verify in one paste.
          </p>
          {expiresAt ? (
            <p className="mt-1 text-xs text-faint">
              Pairing codes expire {new Date(expiresAt).toLocaleTimeString()} — run soon after copying.
            </p>
          ) : null}
          <CopyBlock lines={commandLines} label={terminalLabel} />
          <StepValidation items={allAgentsSetupValidationItems()} />
        </>
      )}

      {error ? <p className={`mt-2 text-xs ${errorClassName}`}>{error}</p> : null}
    </>
  );

  if (compact) {
    return inner;
  }

  return (
    <li className="flex gap-4 pb-8 last:pb-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink">Install &amp; connect all agents</h3>
          <span className="rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
            {terminalLabel}
          </span>
        </div>
        {inner}
      </div>
    </li>
  );
}

export function AlignDeviceConnectStep({
  os,
  compact = false,
  buttonLabel = "Generate fix split stats command",
  errorClassName = "text-red-700"
}: {
  os: OsId;
  compact?: boolean;
  buttonLabel?: string;
  errorClassName?: string;
}) {
  const { loading, pairCode, expiresAt, busy, error, signInAndConnect, refreshCode } =
    useIntegrationPairing("claude_code");
  const terminalLabel = os === "mac" ? "Terminal" : "PowerShell";
  const commandLines = pairCode ? fixAccountCommands(os, pairCode) : [];

  const inner = (
    <>
      <div className={compact ? "mt-0" : "mt-3"}>
        {loading ? (
          <span className="text-xs text-muted">Loading…</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void signInAndConnect()}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
            >
              {busy ? "Connecting…" : buttonLabel}
            </button>
            {pairCode ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshCode()}
                className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-cream-dark disabled:opacity-50"
              >
                New code
              </button>
            ) : null}
          </div>
        )}
      </div>

      {!pairCode ? (
        <p className="mt-3 text-sm text-muted">
          Sign in with the Promptly account you want all coding-agent stats on. Copy one command into{" "}
          {terminalLabel} — it downloads the latest CLI, sets that account as the only one on this computer,
          re-pairs all agents, and merges any split stats.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">
            Copy into {terminalLabel} (works even if Promptly was installed before — always pulls the latest fix).
          </p>
          {expiresAt ? (
            <p className="mt-1 text-xs text-faint">
              Code expires {new Date(expiresAt).toLocaleTimeString()} — run soon after copying.
            </p>
          ) : null}
          <CopyBlock lines={commandLines} label={terminalLabel} />
          <StepValidation
            items={[
              'Output shows "ok": true and your email',
              "All three tools show matches_primary: true",
              "Done message with promptly-labs.com statistics link"
            ]}
          />
        </>
      )}

      {error ? <p className={`mt-2 text-xs ${errorClassName}`}>{error}</p> : null}
    </>
  );

  if (compact) {
    return inner;
  }

  return (
    <li className="flex gap-4 pb-8 last:pb-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">
        2
      </span>
      <div className="min-w-0 flex-1">{inner}</div>
    </li>
  );
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
  const { loading, pairCode, expiresAt, busy, error, signInAndConnect, refreshCode } =
    useIntegrationPairing(tool);

  const terminalLabel = os === "mac" ? "Terminal" : "PowerShell";

  return (
    <li className="flex gap-4 pb-8 last:pb-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink">Install &amp; connect</h3>
          <span className="rounded-md bg-cream-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
            {terminalLabel}
          </span>
        </div>

        <div className="mt-3">
          {loading ? (
            <span className="text-xs text-muted">Loading…</span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void signInAndConnect()}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
              >
                {busy ? "Connecting…" : "Press to Connect Account Now"}
              </button>
              {pairCode ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refreshCode()}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-cream-dark disabled:opacity-50"
                >
                  New code
                </button>
              ) : null}
            </div>
          )}
        </div>

        {!pairCode ? (
          <p className="mt-3 text-sm text-muted">
            Press the button to sign in — then copy the one command below into {terminalLabel}.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">
              Copy and paste into {terminalLabel}. Installs Promptly and connects your account in one go.
            </p>
            {expiresAt ? (
              <p className="mt-1 text-xs text-faint">
                Code expires {new Date(expiresAt).toLocaleTimeString()} — run soon after copying.
              </p>
            ) : null}
            <CopyBlock lines={fullSetupCommands(os, tool, pairCode)} />
            <StepValidation
              items={[
                `"${installSuccessHint(tool)}" in the output`,
                toolStatusSnippet(tool)
              ]}
            />
          </>
        )}

        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      </div>
    </li>
  );
}
