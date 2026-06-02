import { AmbientBackground } from "@/components/AmbientBackground";
import { StatisticsClient } from "@/components/account/StatisticsClient";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Roboto } from "next/font/google";

const robotoChart = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto-chart",
  display: "swap"
});

export default function AccountStatisticsPage() {
  return (
    <main className={`relative min-h-screen bg-page text-ink ${robotoChart.variable}`}>
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <StatisticsClient />
        <Footer />
      </div>
    </main>
  );
}
