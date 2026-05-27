import { Suspense } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { AccountClient } from "@/components/account/AccountClient";

function ExtensionAuthFallback() {
  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-6">
      <img
        src="/images/promptly-logo.png"
        alt="Promptly"
        className="h-12 w-auto max-w-[220px] object-contain"
      />
      <p className="mt-6 text-sm text-muted">Loading…</p>
    </div>
  );
}

export default function ExtensionAuthPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground variant="static" />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-10">
        <Suspense fallback={<ExtensionAuthFallback />}>
          <AccountClient extensionMode />
        </Suspense>
      </div>
    </main>
  );
}
