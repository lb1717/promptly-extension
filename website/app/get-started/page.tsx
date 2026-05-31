import { Suspense } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { GeneralOnboardingClient } from "@/components/onboarding/GeneralOnboardingClient";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export default function GetStartedPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <Suspense fallback={<div className="px-6 py-16 text-center text-sm text-muted">Loading…</div>}>
          <GeneralOnboardingClient />
        </Suspense>
        <Footer />
      </div>
    </main>
  );
}
