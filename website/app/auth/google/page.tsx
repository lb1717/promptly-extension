import { GoogleSignInCallbackClient } from "@/components/auth/GoogleSignInCallbackClient";
import { Suspense } from "react";

export default function GoogleAuthPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-page px-6 text-sm text-muted">
          Loading…
        </main>
      }
    >
      <GoogleSignInCallbackClient />
    </Suspense>
  );
}
