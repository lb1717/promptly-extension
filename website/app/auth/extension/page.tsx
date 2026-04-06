import { AccountClient } from "@/components/account/AccountClient";

export default function ExtensionAuthPage() {
  return (
    <main className="min-h-screen bg-transparent text-ink">
      <AccountClient extensionMode />
    </main>
  );
}
