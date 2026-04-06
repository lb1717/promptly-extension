import { AmbientBackground } from "@/components/AmbientBackground";
import { AccountClient } from "@/components/account/AccountClient";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export default function AccountPage() {
  return (
    <main className="relative min-h-screen bg-black text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <AccountClient />
        <Footer />
      </div>
    </main>
  );
}
