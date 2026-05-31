import { type FirebaseError } from "firebase/app";
import {
  Auth,
  fetchSignInMethodsForEmail
} from "firebase/auth";

export const GOOGLE_PROVIDER_ID = "google.com";
export const PASSWORD_PROVIDER_ID = "password";

export type AuthProviderHint = "use-google" | "use-email" | null;

export function getFirebaseErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as FirebaseError).code || "");
  }
  return "";
}

function getFirebaseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "Something went wrong.");
}

/** Map Identity Toolkit REST error codes (extension email panel) to Firebase-style codes. */
export function normalizeIdentityToolkitErrorCode(message: string): string {
  const raw = String(message || "").trim();
  if (!raw) {
    return "";
  }
  const upper = raw.toUpperCase();
  if (upper === "EMAIL_EXISTS") {
    return "auth/email-already-in-use";
  }
  if (upper === "INVALID_LOGIN_CREDENTIALS" || upper === "INVALID_PASSWORD") {
    return "auth/invalid-credential";
  }
  return "";
}

export async function fetchEmailSignInMethods(auth: Auth, email: string): Promise<string[]> {
  const trimmed = String(email || "").trim();
  if (!trimmed) {
    return [];
  }
  try {
    return await fetchSignInMethodsForEmail(auth, trimmed);
  } catch {
    return [];
  }
}

export function usesGoogleSignIn(methods: string[]): boolean {
  return methods.includes(GOOGLE_PROVIDER_ID);
}

export function usesPasswordSignIn(methods: string[]): boolean {
  return methods.includes(PASSWORD_PROVIDER_ID);
}

export async function preflightEmailRegistration(
  auth: Auth,
  email: string
): Promise<{ blocked: boolean; message: string; hint: AuthProviderHint } | null> {
  const methods = await fetchEmailSignInMethods(auth, email);
  if (!methods.length) {
    return null;
  }
  if (usesGoogleSignIn(methods) && !usesPasswordSignIn(methods)) {
    return {
      blocked: true,
      message:
        "This email is already registered with Google. Use Sign in with Google instead of creating a password account.",
      hint: "use-google"
    };
  }
  if (usesPasswordSignIn(methods)) {
    return {
      blocked: true,
      message: "An account with this email already exists. Sign in with your password instead.",
      hint: "use-email"
    };
  }
  return {
    blocked: true,
    message: "An account with this email already exists. Try signing in instead.",
    hint: null
  };
}

export async function resolveEmailRegistrationError(
  auth: Auth,
  email: string,
  error: unknown
): Promise<{ message: string; hint: AuthProviderHint }> {
  const code =
    getFirebaseErrorCode(error) || normalizeIdentityToolkitErrorCode(getFirebaseErrorMessage(error));
  if (code === "auth/email-already-in-use") {
    const methods = await fetchEmailSignInMethods(auth, email);
    if (usesGoogleSignIn(methods) && !usesPasswordSignIn(methods)) {
      return {
        message:
          "This email is already registered with Google. Use Sign in with Google instead of creating a password account.",
        hint: "use-google"
      };
    }
    if (usesPasswordSignIn(methods)) {
      return {
        message: "An account with this email already exists. Sign in with your password instead.",
        hint: "use-email"
      };
    }
  }
  return { message: getFirebaseErrorMessage(error), hint: null };
}

export async function resolveEmailSignInError(
  auth: Auth,
  email: string,
  error: unknown
): Promise<{ message: string; hint: AuthProviderHint }> {
  const code =
    getFirebaseErrorCode(error) || normalizeIdentityToolkitErrorCode(getFirebaseErrorMessage(error));
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found" ||
    code === "auth/invalid-login-credentials"
  ) {
    const methods = await fetchEmailSignInMethods(auth, email);
    if (usesGoogleSignIn(methods) && !usesPasswordSignIn(methods)) {
      return {
        message: "This email uses Google sign-in. Use Sign in with Google instead.",
        hint: "use-google"
      };
    }
  }
  return { message: getFirebaseErrorMessage(error), hint: null };
}

export function resolveGoogleSignInError(error: unknown): { message: string; hint: AuthProviderHint } {
  if (getFirebaseErrorCode(error) === "auth/account-exists-with-different-credential") {
    return {
      message:
        "This email is registered with email and password. Sign in with email below instead of Google.",
      hint: "use-email"
    };
  }
  if (getFirebaseErrorCode(error) === "auth/popup-closed-by-user") {
    return { message: "Google sign-in was cancelled.", hint: null };
  }
  if (getFirebaseErrorCode(error) === "auth/redirect-cancelled-by-user") {
    return { message: "Google sign-in was cancelled.", hint: null };
  }
  return { message: getFirebaseErrorMessage(error), hint: null };
}

export function emailFromGoogleCredentialError(error: unknown): string {
  if (error && typeof error === "object" && "customData" in error) {
    const customData = (error as FirebaseError).customData as { email?: string } | undefined;
    return String(customData?.email || "").trim();
  }
  return "";
}
