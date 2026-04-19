import type { Metadata } from "next";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Benefits } from "@/components/Benefits";
import { ComparisonTable } from "@/components/ComparisonTable";
import { DemoSection } from "@/components/DemoSection";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HeroStats } from "@/components/HeroStats";
import { IntegratedWith } from "@/components/IntegratedWith";
import { Navbar } from "@/components/Navbar";
import { PricingSection } from "@/components/PricingSection";

export const metadata: Metadata = {
  title: "Promptly | Better prompts, better results",
  description: "Premium landing page for the Promptly Chrome extension."
};

export default function ProductPage() {
  return (
    <main className="relative min-h-screen bg-black text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <Hero />
        <DemoSection />
        <IntegratedWith />
        <HeroStats />
        <PricingSection />
        <ComparisonTable />
        <Benefits />
        <FinalCTA />
        <Footer />
      </div>
    </main>
  );
}
