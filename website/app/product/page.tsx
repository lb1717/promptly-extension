import type { Metadata } from "next";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Benefits } from "@/components/Benefits";
import { DemoSection } from "@/components/DemoSection";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { IntegratedWith } from "@/components/IntegratedWith";
import { Navbar } from "@/components/Navbar";
import { PricingSection } from "@/components/PricingSection";

export const metadata: Metadata = {
  title: "Promptly Labs",
  description:
    "One-click prompt improvement inside ChatGPT, Claude, and Gemini—clearer intent, structured outputs, and usage tracking."
};

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
