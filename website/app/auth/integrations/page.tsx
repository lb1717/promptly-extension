import { Suspense } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { IntegrationsAuthClient } from "@/components/integrations/IntegrationsAuthClient";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

function AuthFallback() {
  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-line bg-cream p-8 text-center text-sm text-muted">
      Loading…
    </div>
  );
}

export default function IntegrationsAuthPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground variant="static" />
      <div className="relative z-10">
        <Navbar />
        <div className="px-4 py-10 sm:px-6">
          <Suspense fallback={<AuthFallback />}>
            <IntegrationsAuthClient />
          </Suspense>
        </div>
        <Footer />
      </div>
    </main>
  );
}
