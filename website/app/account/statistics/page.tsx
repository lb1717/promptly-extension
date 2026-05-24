import { AmbientBackground } from "@/components/AmbientBackground";
import { StatisticsClient } from "@/components/account/StatisticsClient";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export default function AccountStatisticsPage() {
  return (
    <main className="relative min-h-screen bg-black text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <StatisticsClient />
        <Footer />
      </div>
    </main>
  );
}
