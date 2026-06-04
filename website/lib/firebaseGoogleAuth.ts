import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  type User,
  type UserCredential
} from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebaseClient";

export const PROMPTLY_GOOGLE_SIGN_IN_DONE = "PROMPTLY_GOOGLE_SIGN_IN_DONE";
export const PROMPTLY_GOOGLE_SIGN_IN_ERROR = "PROMPTLY_GOOGLE_SIGN_IN_ERROR";

const REDIRECT_PENDING_KEY = "promptly_google_redirect_pending";
const REDIRECT_PENDING_MAX_AGE_MS = 15 * 60 * 1000;

let redirectResultPromise: Promise<UserCredential | null> | null = null;
let redirectFlowStarted = false;

export function resetGoogleRedirectAuthState(): void {
  redirectResultPromise = null;
  redirectFlowStarted = false;
}

export function googleAuthCallbackPath(returnTo?: string, fromAccount = false): string {
  const path =
    returnTo ||
    (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/account");
  const params = new URLSearchParams({ returnTo: path });
  if (fromAccount) {
    params.set("from", "account");
  }
  return `/auth/google?${params.toString()}`;
}

/** Open Google sign-in in a new tab (falls back to same-tab navigation if blocked). */
export function openGoogleSignInInNewTab(returnTo?: string, fromAccount = true): void {
  if (typeof window === "undefined") return;
  const url = googleAuthCallbackPath(returnTo, fromAccount);
  // Do not pass noopener — the callback tab notifies window.opener when sign-in completes.
  const opened = window.open(url, "_blank");
  if (!opened) {
    window.location.assign(url);
  }
}

export type GoogleSignInFlowResult =
  | { status: "success"; user: User }
  | { status: "opened-tab" }
  | { status: "cancelled" };

/** Open /auth/google in a new tab; that page redirects to Google (not a popup window). */
export async function signInWithGoogleInteractive(returnTo?: string): Promise<GoogleSignInFlowResult> {
  openGoogleSignInInNewTab(returnTo, true);
  return { status: "opened-tab" };
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
  const raw = window.sessionStorage.getItem(REDIRECT_PENDING_KEY);
  if (!raw) return false;
  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt > REDIRECT_PENDING_MAX_AGE_MS) {
    clearGoogleRedirectPending();
    return false;
  }
  return true;
}

export async function startGoogleSignInRedirect(): Promise<void> {
  if (redirectFlowStarted) return;
  redirectFlowStarted = true;
  markGoogleRedirectPending();
  await signInWithRedirect(getFirebaseAuth(), getGoogleProvider());
}

export async function signInWithGooglePopupInTab(): Promise<UserCredential> {
  return signInWithPopup(getFirebaseAuth(), getGoogleProvider());
}

export async function consumeGoogleSignInRedirectResult(): Promise<UserCredential | null> {
  if (!redirectResultPromise) {
    redirectResultPromise = getRedirectResult(getFirebaseAuth());
  }
  return redirectResultPromise;
}

export function waitForAuthenticatedUser(timeoutMs: number): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      unsub();
      resolve(user);
    };

    const timer = window.setTimeout(() => finish(auth.currentUser), timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        finish(user);
      }
    });
  });
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
