import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { DemoSection } from "@/components/DemoSection";
import { ComparisonTable } from "@/components/ComparisonTable";
import { Benefits } from "@/components/Benefits";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-violetDark text-ink">
      <Navbar />
      <Hero />
      <DemoSection />
      <ComparisonTable />
      <Benefits />
      <FinalCTA />
      <Footer />
    </main>
  );
}
