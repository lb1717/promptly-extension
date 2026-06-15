import { Suspense } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { AccountHubClient } from "@/components/account/AccountHubClient";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { EB_Garamond, Roboto } from "next/font/google";

const robotoChart = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto-chart",
  display: "swap"
});

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-eb-garamond",
  display: "swap"
});

export default function AccountPage() {
  return (
    <main
      className={`relative min-h-screen bg-page text-ink ${robotoChart.variable} ${ebGaramond.variable}`}
    >
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <Suspense fallback={<div className="px-6 py-16 text-center text-sm text-muted">Loading account…</div>}>
          <AccountHubClient />
        </Suspense>
        <Footer />
      </div>
    </main>
  );
}
