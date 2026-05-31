import { AmbientBackground } from "@/components/AmbientBackground";
import { Benefits } from "@/components/Benefits";
import { DemoSection } from "@/components/DemoSection";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { IntegratedWith } from "@/components/IntegratedWith";
import { Navbar } from "@/components/Navbar";
import { PricingSection } from "@/components/PricingSection";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Promptly — One-Click Prompt Improvement for ChatGPT, Claude & Gemini",
  description:
    "Improve AI prompts in one click inside ChatGPT, Claude, and Gemini. Promptly rewrites for clearer intent, structured outputs, and less wasted effort.",
  path: "/product"
});

export default function ProductPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <Hero />
        <DemoSection />
        <IntegratedWith />
        <Benefits />
        <PricingSection />
        <FinalCTA />
        <Footer />
      </div>
    </main>
  );
}
