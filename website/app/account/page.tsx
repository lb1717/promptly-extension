import { Suspense } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { AccountClient } from "@/components/account/AccountClient";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export default function AccountPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <Suspense fallback={<div className="px-6 py-16 text-center text-sm text-muted">Loading account…</div>}>
          <AccountClient />
        </Suspense>
        <Footer />
      </div>
    </main>
  );
}
