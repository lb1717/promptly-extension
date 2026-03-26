import { Navbar } from "@/components/Navbar";
import { AccountClient } from "@/components/account/AccountClient";

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-violetDark text-ink">
      <Navbar />
      <AccountClient />
    </main>
  );
}
