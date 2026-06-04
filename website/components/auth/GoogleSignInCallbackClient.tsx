"use client";

import {
  clearGoogleRedirectPending,
  consumeGoogleSignInRedirectResult,
  notifyGoogleSignInOpenerError,
  notifyGoogleSignInOpenerSuccess,
  resetGoogleRedirectAuthState,
  signInWithGooglePopupInTab,
  startGoogleSignInRedirect,
  tryCloseGoogleSignInTab,
  waitForAuthenticatedUser,
  wasGoogleRedirectPending
} from "@/lib/firebaseGoogleAuth";
import { getFirebaseErrorCode, resolveGoogleSignInError } from "@/lib/firebaseAuthAccountHints";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { syncPromptlyUserDoc } from "@/lib/promptlyUserSync";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";

type Status = "loading" | "ready" | "working" | "done" | "cancelled" | "error";

const REDIRECT_WAIT_MS = 20_000;
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "";

export function GoogleSignInCallbackClient() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || "/account";
  const openedFromAccount = searchParams.get("from") === "account";
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const finishedRef = useRef(false);
  const redirectStartedRef = useRef(false);

  const finishSuccess = useCallback(async (user: User) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearGoogleRedirectPending();
    await syncPromptlyUserDoc(user);
    setStatus("done");
    notifyGoogleSignInOpenerSuccess();
    tryCloseGoogleSignInTab();
  }, []);

  const finishError = useCallback((message: string, code = "") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearGoogleRedirectPending();
    setErrorMessage(message);
    setErrorCode(code);
    setStatus("error");
    notifyGoogleSignInOpenerError(message);
  }, []);

  const startRedirectSignIn = useCallback(async () => {
    if (finishedRef.current || redirectStartedRef.current) return;
    redirectStartedRef.current = true;
    setStatus("working");
    setErrorMessage("");
    setErrorCode("");

    try {
      await startGoogleSignInRedirect();
    } catch (redirectError) {
      redirectStartedRef.current = false;
      const resolved = resolveGoogleSignInError(redirectError);
      finishError(resolved.message, getFirebaseErrorCode(redirectError));
    }
  }, [finishError]);

  const handleContinueWithGoogle = useCallback(async () => {
    if (finishedRef.current) return;
    setStatus("working");
    setErrorMessage("");
    setErrorCode("");

    try {
      const cred = await signInWithGooglePopupInTab();
      await finishSuccess(cred.user);
    } catch (e) {
      const code = getFirebaseErrorCode(e);
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        finishedRef.current = true;
        clearGoogleRedirectPending();
        setStatus("cancelled");
        notifyGoogleSignInOpenerError("Google sign-in was cancelled.");
        return;
      }

      await startRedirectSignIn();
    }
  }, [finishSuccess, startRedirectSignIn]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await consumeGoogleSignInRedirectResult();
        if (cancelled || finishedRef.current) return;

        if (result?.user) {
          await finishSuccess(result.user);
          return;
        }

        const auth = getFirebaseAuth();
        if (auth.currentUser) {
          await finishSuccess(auth.currentUser);
          return;
        }

        const hadPendingRedirect = wasGoogleRedirectPending();
        clearGoogleRedirectPending();

        if (hadPendingRedirect) {
          const user = await waitForAuthenticatedUser(REDIRECT_WAIT_MS);
          if (cancelled || finishedRef.current) return;
          if (user) {
            await finishSuccess(user);
            return;
          }
          finishedRef.current = true;
          setStatus("cancelled");
          notifyGoogleSignInOpenerError(
            "Google sign-in did not finish. Close this tab, go back to Promptly, and try again."
          );
          return;
        }

        const hasOpener = Boolean(window.opener && !window.opener.closed);
        if (openedFromAccount && hasOpener) {
          await startRedirectSignIn();
          return;
        }

        if (!cancelled) {
          setStatus("ready");
        }
      } catch (e) {
        if (cancelled || finishedRef.current) return;
        const resolved = resolveGoogleSignInError(e);
        finishError(resolved.message, getFirebaseErrorCode(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [finishError, finishSuccess, openedFromAccount, startRedirectSignIn]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-page px-6 py-16 text-ink">
      <img src="/images/promptly-logo.png" alt="Promptly" className="h-12 w-auto object-contain" />
      <h1 className="mt-4 text-xl font-semibold">Google sign-in</h1>

      {status === "loading" || status === "working" ? (
        <p className="mt-3 text-sm text-muted">
          {status === "working" ? "Redirecting to Google…" : "Completing sign-in…"}
        </p>
      ) : null}

      {status === "ready" ? (
        <div className="mt-6 flex max-w-sm flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted">Continue in this tab to connect your Promptly account with Google.</p>
          <button
            type="button"
            onClick={() => {
              finishedRef.current = false;
              redirectStartedRef.current = false;
              resetGoogleRedirectAuthState();
              void handleContinueWithGoogle();
            }}
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
          >
            Continue with Google
            <img src="/images/google-logo.png" alt="" aria-hidden className="h-[18px] w-[18px] shrink-0 object-contain" />
          </button>
          <Link href={returnTo} className="text-sm font-semibold text-muted underline hover:text-ink">
            Back to Promptly
          </Link>
        </div>
      ) : null}

      {status === "done" ? (
        <div className="mt-4 max-w-sm text-center">
          <p className="text-sm text-muted">You&apos;re signed in. You can close this tab and return to Promptly.</p>
          <Link href={returnTo} className="mt-4 inline-block text-sm font-semibold text-ink underline">
            Continue to Promptly
          </Link>
        </div>
      ) : null}

      {status === "cancelled" ? (
        <div className="mt-4 max-w-sm text-center">
          <p className="text-sm text-muted">
            {errorMessage || "Sign-in was cancelled. Close this tab and try again from Promptly."}
          </p>
          <button
            type="button"
            onClick={() => {
              finishedRef.current = false;
              redirectStartedRef.current = false;
              resetGoogleRedirectAuthState();
              void startRedirectSignIn();
            }}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
          >
            Try again
          </button>
          <Link href={returnTo} className="mt-3 block text-sm font-semibold text-ink underline">
            Back to Promptly
          </Link>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-4 max-w-sm text-center">
          <p className="text-sm text-red-700">{errorMessage || "Google sign-in failed."}</p>
          {errorCode ? <p className="mt-2 font-mono text-xs text-muted">Error code: {errorCode}</p> : null}
          <button
            type="button"
            onClick={() => {
              finishedRef.current = false;
              redirectStartedRef.current = false;
              resetGoogleRedirectAuthState();
              void startRedirectSignIn();
            }}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
          >
            Try again
          </button>
          <Link href={returnTo} className="mt-3 block text-sm font-semibold text-ink underline">
            Back to Promptly
          </Link>
        </div>
      ) : null}

      {(status === "error" || status === "cancelled") && AUTH_DOMAIN ? (
        <p className="mt-6 max-w-md text-center text-xs text-muted">
          Auth domain for this build: <span className="font-mono">{AUTH_DOMAIN}</span>
        </p>
      ) : null}
    </main>
  );
}
