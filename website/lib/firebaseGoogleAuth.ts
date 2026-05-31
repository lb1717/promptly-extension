import { getRedirectResult, signInWithRedirect, type UserCredential } from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebaseClient";

export const PROMPTLY_GOOGLE_SIGN_IN_DONE = "PROMPTLY_GOOGLE_SIGN_IN_DONE";
export const PROMPTLY_GOOGLE_SIGN_IN_ERROR = "PROMPTLY_GOOGLE_SIGN_IN_ERROR";

const REDIRECT_PENDING_KEY = "promptly_google_redirect_pending";

export function googleAuthCallbackPath(returnTo?: string): string {
  const path =
    returnTo ||
    (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/account");
  return `/auth/google?returnTo=${encodeURIComponent(path)}`;
}

/** Open Google sign-in in a new tab (falls back to same-tab navigation if blocked). */
export function openGoogleSignInInNewTab(returnTo?: string): void {
  if (typeof window === "undefined") return;
  const url = googleAuthCallbackPath(returnTo);
  // Do not pass noopener — the callback tab notifies window.opener when sign-in completes.
  const opened = window.open(url, "_blank");
  if (!opened) {
    window.location.assign(url);
  }
}

export function markGoogleRedirectPending(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(REDIRECT_PENDING_KEY, String(Date.now()));
}

export function clearGoogleRedirectPending(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(REDIRECT_PENDING_KEY);
}

export function wasGoogleRedirectPending(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.sessionStorage.getItem(REDIRECT_PENDING_KEY));
}

export async function startGoogleSignInRedirect(): Promise<void> {
  markGoogleRedirectPending();
  await signInWithRedirect(getFirebaseAuth(), getGoogleProvider());
}

export async function consumeGoogleSignInRedirectResult(): Promise<UserCredential | null> {
  return getRedirectResult(getFirebaseAuth());
}

export function notifyGoogleSignInOpenerSuccess(): void {
  if (typeof window === "undefined" || !window.opener || window.opener.closed) return;
  window.opener.postMessage({ type: PROMPTLY_GOOGLE_SIGN_IN_DONE }, window.location.origin);
}

export function notifyGoogleSignInOpenerError(message: string): void {
  if (typeof window === "undefined" || !window.opener || window.opener.closed) return;
  window.opener.postMessage({ type: PROMPTLY_GOOGLE_SIGN_IN_ERROR, message }, window.location.origin);
}

export function tryCloseGoogleSignInTab(): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.close();
  }, 400);
}

export type GoogleSignInReturnHandlers = {
  onSuccess?: () => void;
  onError?: (message: string) => void;
  onSettled?: () => void;
};

export function listenForGoogleSignInReturn(handlers: GoogleSignInReturnHandlers): () => void {
  if (typeof window === "undefined") return () => {};

  function onMessage(event: MessageEvent) {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === PROMPTLY_GOOGLE_SIGN_IN_DONE) {
      handlers.onSuccess?.();
      handlers.onSettled?.();
    }
    if (data.type === PROMPTLY_GOOGLE_SIGN_IN_ERROR) {
      handlers.onError?.(typeof data.message === "string" ? data.message : "Google sign-in failed.");
      handlers.onSettled?.();
    }
  }

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
