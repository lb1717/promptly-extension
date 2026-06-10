import type { User } from "firebase/auth";
import { canProceedWithEmailAccount } from "@/lib/emailVerification";

/** Ignore the first auth resolution so an existing session does not count as a fresh sign-in. */
export function markAuthHydrated(
  hydratedRef: { current: boolean },
  prevUserRef: { current: User | null },
  user: User | null
): boolean {
  if (hydratedRef.current) return false;
  hydratedRef.current = true;
  prevUserRef.current = user;
  return true;
}

export function detectAuthTransition(
  prevUserRef: { current: User | null },
  user: User | null
): { justSignedIn: boolean; justSignedOut: boolean } {
  const justSignedIn = Boolean(user && !prevUserRef.current);
  const justSignedOut = Boolean(!user && prevUserRef.current);
  prevUserRef.current = user;
  return { justSignedIn, justSignedOut };
}

export function welcomeContinueStep(
  user: User | null,
  accountStep: number,
  afterAccountStep: number
): number {
  if (user && canProceedWithEmailAccount(user)) return afterAccountStep;
  return accountStep;
}

export function shouldAdvanceAfterAccountAuth(
  user: User | null,
  step: number,
  accountStep: number
): boolean {
  return step === accountStep && Boolean(user && canProceedWithEmailAccount(user));
}

/** @deprecated use shouldAdvanceAfterAccountAuth */
export function shouldAdvanceToPlanAfterAuth(
  user: User | null,
  step: number,
  accountStep: number
): boolean {
  return shouldAdvanceAfterAccountAuth(user, step, accountStep);
}
