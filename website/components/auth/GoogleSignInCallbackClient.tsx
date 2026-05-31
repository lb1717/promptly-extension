"use client";

import {
  clearGoogleRedirectPending,
  consumeGoogleSignInRedirectResult,
  notifyGoogleSignInOpenerError,
  notifyGoogleSignInOpenerSuccess,
  startGoogleSignInRedirect,
  tryCloseGoogleSignInTab,
  wasGoogleRedirectPending
} from "@/lib/firebaseGoogleAuth";
import { resolveGoogleSignInError } from "@/lib/firebaseAuthAccountHints";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { syncPromptlyUserDoc } from "@/lib/promptlyUserSync";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Status = "loading" | "redirecting" | "done" | "cancelled" | "error";

export function GoogleSignInCallbackClient() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || "/account";
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function finishSuccess() {
      if (finishedRef.current || cancelled) return;
      finishedRef.current = true;
      clearGoogleRedirectPending();
      setStatus("done");
      notifyGoogleSignInOpenerSuccess();
      tryCloseGoogleSignInTab();
    }

    async function finishError(message: string) {
      if (finishedRef.current || cancelled) return;
      finishedRef.current = true;
      clearGoogleRedirectPending();
      setErrorMessage(message);
      setStatus("error");
      notifyGoogleSignInOpenerError(message);
    }

    (async () => {
      try {
        const result = await consumeGoogleSignInRedirectResult();
        if (cancelled || finishedRef.current) return;

        const hadPendingRedirect = wasGoogleRedirectPending();
        clearGoogleRedirectPending();

        if (result?.user) {
          await syncPromptlyUserDoc(result.user);
          await finishSuccess();
          return;
        }

        const auth = getFirebaseAuth();
        if (auth.currentUser) {
          await syncPromptlyUserDoc(auth.currentUser);
          await finishSuccess();
          return;
        }

        if (hadPendingRedirect) {
          finishedRef.current = true;
          setStatus("cancelled");
          notifyGoogleSignInOpenerError("Google sign-in was cancelled.");
          return;
        }

        setStatus("redirecting");
        await startGoogleSignInRedirect();
      } catch (e) {
        if (cancelled || finishedRef.current) return;
        const resolved = resolveGoogleSignInError(e);
        await finishError(resolved.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-page px-6 py-16 text-ink">
      <img src="/images/promptly-logo.png" alt="Promptly" className="h-12 w-auto object-contain" />
      <h1 className="mt-4 text-xl font-semibold">Google sign-in</h1>

      {status === "loading" || status === "redirecting" ? (
        <p className="mt-3 text-sm text-muted">
          {status === "redirecting" ? "Redirecting to Google…" : "Completing sign-in…"}
        </p>
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
          <p className="text-sm text-muted">Sign-in was cancelled. Close this tab and try again from Promptly.</p>
          <Link href={returnTo} className="mt-4 inline-block text-sm font-semibold text-ink underline">
            Back to Promptly
          </Link>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-4 max-w-sm text-center">
          <p className="text-sm text-red-700">{errorMessage || "Google sign-in failed."}</p>
          <Link href={returnTo} className="mt-4 inline-block text-sm font-semibold text-ink underline">
            Back to Promptly
          </Link>
        </div>
      ) : null}
    </main>
  );
}
