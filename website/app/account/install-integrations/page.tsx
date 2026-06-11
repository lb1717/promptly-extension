import { Suspense } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { AccountIntegrationsGate } from "@/components/account/AccountIntegrationsGate";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export default function InstallIntegrationsPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <Suspense fallback={<p className="px-6 py-16 text-center text-sm text-muted">Loading…</p>}>
          <AccountIntegrationsGate mode="install" />
        </Suspense>
        <Footer />
      </div>
    </main>
  );
}
