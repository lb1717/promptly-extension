"use client";

import { resolveGoogleSignInError } from "@/lib/firebaseAuthAccountHints";
import { listenForGoogleSignInReturn, signInWithGoogleInteractive } from "@/lib/firebaseGoogleAuth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import { useAllAgentsPairing } from "@/components/integrations/integrationPairing";
import {
  allAgentsFullSetupCommands,
  allAgentsSetupValidationItems,
  type AllAgentsPairCodes,
  type OsId
} from "@/components/integrations/integrationOs";
import { StepValidation } from "@/components/integrations/integrationUi";

function SuccessCheckmark() {
  return (
    <svg
      viewBox="0 0 96 96"
      aria-hidden
      className="h-20 w-20 text-emerald-600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="4" opacity="0.25" />
      <path
        d="M28 50 L42 64 L70 34"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CompanionAuthClient() {
  const {
    user,
    loading,
    hasAllCodes,
    pairCodes,
    expiresAt,
    busy,
    error,
    signInAndConnect,
    refreshCodes
  } = useAllAgentsPairing();
  const [activeOs, setActiveOs] = useState<OsId>("mac");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [justSignedIn, setJustSignedIn] = useState(false);

  useEffect(() => {
    return listenForGoogleSignInReturn({
      onSuccess: () => setJustSignedIn(true),
      onError: (message) => {
        setAuthError(resolveGoogleSignInError(new Error(message)).message);
        setAuthBusy(false);
      },
      onSettled: () => setAuthBusy(false)
    });
  }, []);

  useEffect(() => {
    if (!user || loading || hasAllCodes) return;
    void refreshCodes();
  }, [user, loading, hasAllCodes, refreshCodes]);

  async function handleGoogleSignIn() {
    setAuthError("");
    setAuthBusy(true);
    let openedTab = false;
    try {
      const flow = await signInWithGoogleInteractive("/auth/companion");
      if (flow.status === "success") {
        setJustSignedIn(true);
        await signInAndConnect();
      } else if (flow.status === "cancelled") {
        setAuthError("Google sign-in was cancelled.");
      } else {
        openedTab = true;
      }
    } catch (e) {
      setAuthError(resolveGoogleSignInError(e).message);
    } finally {
      if (!openedTab) setAuthBusy(false);
    }
  }

  const terminalLabel = activeOs === "mac" ? "Terminal" : "PowerShell";
  const commandLines =
    hasAllCodes && pairCodes.claude_code
      ? allAgentsFullSetupCommands(activeOs, pairCodes as AllAgentsPairCodes)
      : [];
  const showSignedIn = Boolean(user) && !loading;

  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
      <img src="/images/promptly-logo.png" alt="Promptly" className="mx-auto h-10 w-auto object-contain" />

      {loading ? (
        <p className="mt-8 text-center text-sm text-muted">Loading…</p>
      ) : !showSignedIn ? (
        <>
          <h1 className="mt-6 text-center text-xl font-semibold text-ink">Sign in to Promptly Companion</h1>
          <p className="mt-2 text-center text-sm text-muted">
            Connect your Promptly account so Companion can improve and refine your prompts.
          </p>
          <div className="mt-8 space-y-4">
            <button
              type="button"
              disabled={authBusy || busy}
              onClick={() => void handleGoogleSignIn()}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
            >
              {authBusy ? "Signing in…" : "Sign in with Google"}
              {!authBusy ? (
                <img src="/images/google-logo.png" alt="" aria-hidden className="h-[18px] w-[18px] shrink-0 object-contain" />
              ) : null}
            </button>
            <p className="text-center text-xs text-faint">
              Or{" "}
              <Link href="/account" className="underline hover:text-ink">
                open your account
              </Link>{" "}
              first, then return here.
            </p>
          </div>
        </>
      ) : (
        <div className="mt-6 flex flex-col items-center text-center">
          <SuccessCheckmark />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
            {justSignedIn ? "Signed in!" : "You're signed in"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Signed in as <span className="font-medium text-ink">{user?.email}</span>
          </p>
          <div className="mt-6 w-full rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-left">
            <p className="text-sm font-semibold text-ink">Return to Promptly Companion</p>
            <p className="mt-1 text-sm text-muted">
              Close this tab and switch back to the app. If you still need to connect, run the command below in{" "}
              {terminalLabel}, then tap <span className="font-medium text-ink">I&apos;ve connected — refresh</span> in
              Companion.
            </p>
          </div>
        </div>
      )}

      {showSignedIn ? (
        <div className="mt-8 space-y-4 border-t border-line pt-8 text-left">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-faint">Connect this computer</p>
            <p className="mt-2 text-sm text-muted">
              Copy this command into {terminalLabel} if you have not paired Cursor, Claude Code, or Codex yet.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["mac", "windows"] as const).map((os) => (
              <button
                key={os}
                type="button"
                onClick={() => setActiveOs(os)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                  activeOs === os ? "border-ink bg-ink text-cream" : "border-line text-muted hover:text-ink"
                }`}
              >
                {os === "mac" ? "Mac" : "Windows"}
              </button>
            ))}
            {hasAllCodes ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshCodes()}
                className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-cream-dark disabled:opacity-50"
              >
                New code
              </button>
            ) : null}
          </div>

          {hasAllCodes && commandLines.length ? (
            <>
              {expiresAt ? (
                <p className="text-xs text-faint">
                  Code expires {new Date(expiresAt).toLocaleTimeString()} — run soon after copying.
                </p>
              ) : null}
              <CopyBlock lines={commandLines} label={terminalLabel} />
              <StepValidation items={allAgentsSetupValidationItems()} />
            </>
          ) : (
            <p className="text-sm text-muted">{busy ? "Generating command…" : "Preparing your connect command…"}</p>
          )}
        </div>
      ) : null}

      {authError || error ? (
        <p className="mt-4 text-center text-sm text-red-700">{authError || error}</p>
      ) : null}

      <p className="mt-6 text-center text-xs text-faint">
        <Link href="/integrations" className="underline hover:text-ink">
          Full integrations guide
        </Link>
        {" · "}
        <Link href="/companion" className="underline hover:text-ink">
          Download Companion
        </Link>
      </p>
    </div>
  );
}
