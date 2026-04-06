import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyPolicyDocument } from "@/components/privacy/PrivacyPolicyDocument";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy | Promptly",
  description:
    "Privacy Policy for Promptly — website, APIs, and Chrome extension. How we collect, use, and share information."
};

const LAST_UPDATED = "March 30, 2026";

export default function PrivacyPage() {
  const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim() || null;

  return (
    <main className="min-h-screen bg-transparent text-ink">
      <Navbar />
      <article className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:pt-14">
        <p className="text-sm font-medium text-violet-200/70">
          <Link href="/product" className="text-violet-200 hover:text-white">
            Product
          </Link>
          <span className="mx-2 opacity-60">/</span>
          Privacy
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-violet-200/75">
          Full policy for <strong>{SITE.name}</strong> (website + Chrome extension).
        </p>

        <div className="mt-10">
          <PrivacyPolicyDocument lastUpdated={LAST_UPDATED} privacyEmail={privacyEmail} />
        </div>
      </article>
      <Footer />
    </main>
  );
}
