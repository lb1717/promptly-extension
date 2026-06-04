"use client";

import {
  clearGoogleRedirectPending,
  consumeGoogleSignInRedirectResult,
  isReturningFromGoogleRedirect,
  notifyGoogleSignInOpenerError,
  notifyGoogleSignInOpenerSuccess,
  resetGoogleRedirectAuthState,
  startGoogleSignInRedirect,
  tryCloseGoogleSignInTab,
  waitForAuthenticatedUser,
  wasGoogleRedirectPending
} from "@/lib/firebaseGoogleAuth";
import { resolveGoogleSignInError } from "@/lib/firebaseAuthAccountHints";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { syncPromptlyUserDoc } from "@/lib/promptlyUserSync";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";

type Status = "loading" | "ready" | "working" | "done" | "cancelled" | "error";

const REDIRECT_WAIT_MS = 20_000;

export function GoogleSignInCallbackClient() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || "/account";
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const finishedRef = useRef(false);
  const bootstrappedRef = useRef(false);

  const finishSuccess = useCallback(async (user: User) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearGoogleRedirectPending();
    await syncPromptlyUserDoc(user);
    setStatus("done");
    notifyGoogleSignInOpenerSuccess();
    tryCloseGoogleSignInTab();
  }, []);

  const finishError = useCallback((message: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearGoogleRedirectPending();
    setErrorMessage(message);
    setStatus("error");
    notifyGoogleSignInOpenerError(message);
  }, []);

  const finishCancelled = useCallback((message?: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearGoogleRedirectPending();
    const text = message || "Google sign-in was cancelled.";
    setErrorMessage(text);
    setStatus("cancelled");
    notifyGoogleSignInOpenerError(text);
  }, []);

  const handleContinueWithGoogle = useCallback(async () => {
    if (finishedRef.current) return;
    setStatus("working");
    setErrorMessage("");

    try {
      await startGoogleSignInRedirect();
    } catch (redirectError) {
      const resolved = resolveGoogleSignInError(redirectError);
      finishError(resolved.message);
    }
  }, [finishError]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const auth = getFirebaseAuth();
        if (auth.currentUser) {
          await finishSuccess(auth.currentUser);
          return;
        }

        const returning = isReturningFromGoogleRedirect();

        if (!returning) {
          const openedFromSite = Boolean(window.opener && !window.opener.closed);
          if (openedFromSite) {
            await handleContinueWithGoogle();
          } else if (!cancelled) {
            setStatus("ready");
          }
          return;
        }

        setStatus("loading");
        const result = await consumeGoogleSignInRedirectResult();
        if (cancelled || finishedRef.current) return;

        if (result?.user) {
          await finishSuccess(result.user);
          return;
        }

        if (auth.currentUser) {
          await finishSuccess(auth.currentUser);
          return;
        }

        const hadPendingRedirect = wasGoogleRedirectPending();
        if (hadPendingRedirect) {
          const user = await waitForAuthenticatedUser(REDIRECT_WAIT_MS);
          if (cancelled || finishedRef.current) return;
          if (user) {
            await finishSuccess(user);
            return;
          }

          const isLocalhost =
            window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
          finishCancelled(
            isLocalhost
              ? "Google sign-in did not complete. For local dev, add http://localhost:3000 to Firebase Authentication → Settings → Authorized domains, and add the localhost redirect URI on your Google OAuth web client (see ACCOUNT_SETUP.md)."
              : "Google sign-in was cancelled or could not be verified. Close this tab and try again from Promptly."
          );
          return;
        }

        if (!cancelled) {
          setStatus("ready");
        }
      } catch (e) {
        if (cancelled || finishedRef.current) return;
        const resolved = resolveGoogleSignInError(e);
        finishError(resolved.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [finishCancelled, finishError, finishSuccess, handleContinueWithGoogle]);

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
              resetGoogleRedirectAuthState();
              void handleContinueWithGoogle();
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
          <button
            type="button"
            onClick={() => {
              finishedRef.current = false;
              resetGoogleRedirectAuthState();
              setStatus("ready");
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
    </main>
  );
}
