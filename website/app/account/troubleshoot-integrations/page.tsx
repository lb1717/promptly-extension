import { AmbientBackground } from "@/components/AmbientBackground";
import { TroubleshootIntegrationsClient } from "@/components/account/TroubleshootIntegrationsClient";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export default function TroubleshootIntegrationsPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <TroubleshootIntegrationsClient />
        <Footer />
      </div>
    </main>
  );
}
