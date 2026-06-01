import type { EmailVerificationUiStatus } from "@/lib/emailVerification";
import { EMAIL_VERIFIED_MESSAGE } from "@/lib/emailVerification";

type Props = {
  status: Exclude<EmailVerificationUiStatus, "none">;
  email: string;
  className?: string;
};

export function EmailVerificationNotice({ status, email, className = "mt-4" }: Props) {
  if (status === "sent") {
    return (
      <p
        className={`rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 ${className}`}
        role="status"
        aria-live="polite"
      >
        A verification email has been sent to <strong>{email}</strong>.
      </p>
    );
  }

  return (
    <p
      className={`rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ${className}`}
      role="status"
      aria-live="polite"
    >
      {EMAIL_VERIFIED_MESSAGE}
    </p>
  );
}
