import { Suspense } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { CompanionAuthClient } from "@/components/companion/CompanionAuthClient";

function AuthFallback() {
  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-line bg-cream p-8 text-center text-sm text-muted">
      Loading…
    </div>
  );
}

export default function CompanionAuthPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground variant="static" />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <Suspense fallback={<AuthFallback />}>
          <CompanionAuthClient />
        </Suspense>
      </div>
    </main>
  );
}
