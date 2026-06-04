import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  type User,
  type UserCredential
} from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebaseClient";

export const PROMPTLY_GOOGLE_SIGN_IN_DONE = "PROMPTLY_GOOGLE_SIGN_IN_DONE";
export const PROMPTLY_GOOGLE_SIGN_IN_ERROR = "PROMPTLY_GOOGLE_SIGN_IN_ERROR";

const REDIRECT_PENDING_KEY = "promptly_google_redirect_pending";

let redirectResultPromise: Promise<UserCredential | null> | null = null;
let redirectFlowStarted = false;

export function resetGoogleRedirectAuthState(): void {
  redirectResultPromise = null;
  redirectFlowStarted = false;
}

/** True when this page load is likely the return hop from Google OAuth. */
export function isReturningFromGoogleRedirect(): boolean {
  if (typeof window === "undefined") return false;
  if (wasGoogleRedirectPending()) return true;
  const search = new URLSearchParams(window.location.search);
  const hash = window.location.hash || "";
  return (
    search.has("code") ||
    search.has("state") ||
    hash.includes("access_token=") ||
    hash.includes("id_token=") ||
    hash.includes("apiKey=")
  );
}

export function googleAuthCallbackPath(returnTo?: string): string {
  const path =
    returnTo ||
    (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/account");
  return `/auth/google?returnTo=${encodeURIComponent(path)}`;
}

/** Open Google sign-in in a new browser tab (not a popup window). */
export function openGoogleSignInInNewTab(returnTo?: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(googleAuthCallbackPath(returnTo), window.location.origin).href;

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  // Keep opener so /auth/google can postMessage back to this page when sign-in finishes.
  link.rel = "opener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export type GoogleSignInFlowResult =
  | { status: "success"; user: User }
  | { status: "opened-tab" }
  | { status: "cancelled" };

/** Opens Google sign-in in a new tab; the original page listens for completion via postMessage. */
export async function signInWithGoogleInteractive(returnTo?: string): Promise<GoogleSignInFlowResult> {
  openGoogleSignInInNewTab(returnTo);
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
  return Boolean(window.sessionStorage.getItem(REDIRECT_PENDING_KEY));
}

export async function startGoogleSignInRedirect(): Promise<void> {
  resetGoogleRedirectAuthState();
  redirectFlowStarted = true;
  markGoogleRedirectPending();
  await signInWithRedirect(getFirebaseAuth(), getGoogleProvider());
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
