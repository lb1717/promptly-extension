import { AmbientBackground } from "@/components/AmbientBackground";
import { CompanionDesktopInstallClient } from "@/components/companion/CompanionDesktopInstallClient";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Install Promptly on Desktop",
  description:
    "Install the Promptly desktop app on Mac or Windows with one command, plus troubleshooting steps if macOS or SmartScreen blocks the installer.",
  path: "/companion/install"
});

export default function CompanionInstallPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <CompanionDesktopInstallClient />
        <Footer />
      </div>
    </main>
  );
}
