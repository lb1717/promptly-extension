import { AccountClient } from "@/components/account/AccountClient";

export default function ExtensionAuthPage() {
  return (
    <main className="min-h-screen bg-violetDark text-ink">
      <AccountClient extensionMode />
    </main>
  );
}
