import type { User } from "firebase/auth";

export type EmailVerificationUiStatus = "none" | "sent" | "verified";

export function userNeedsEmailVerification(user: User | null): boolean {
  if (!user) return false;
  const usesPassword = user.providerData.some((provider) => provider.providerId === "password");
  return usesPassword && !user.emailVerified;
}

export function canProceedWithEmailAccount(user: User | null): boolean {
  if (!user) return false;
  return !userNeedsEmailVerification(user);
}

export const EMAIL_VERIFIED_MESSAGE = "Email has been verified.";
