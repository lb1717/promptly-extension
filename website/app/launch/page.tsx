import { LaunchCampaignWelcomeClient } from "@/components/launch/LaunchCampaignWelcomeClient";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Free Pro Launch Offer",
  description: "Claim one of the first 1,000 free Promptly Pro accounts during our public launch.",
  path: "/launch"
});

export default function LaunchPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground variant="static" />
      <div className="relative z-10">
        <Navbar />
        <LaunchCampaignWelcomeClient />
        <Footer />
      </div>
    </main>
  );
}
