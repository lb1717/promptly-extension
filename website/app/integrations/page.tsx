import { AmbientBackground } from "@/components/AmbientBackground";
import { IntegrationsHubClient } from "@/components/integrations/IntegrationsHubClient";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Coding agent integrations",
  path: "/integrations",
  noIndex: true
});

export default function IntegrationsPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <IntegrationsHubClient />
        <Footer />
      </div>
    </main>
  );
}
