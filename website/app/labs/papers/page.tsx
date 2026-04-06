import type { Metadata } from "next";
import Link from "next/link";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Papers & References | Promptly Labs",
  description: "Academic sources and references behind Research Labs."
};

export default function LabsPapersPage() {
  return (
    <main className="relative min-h-screen bg-black text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <article className="mx-auto max-w-2xl px-4 pb-24 pt-16">
          <p className="text-sm text-violet-200/70">
            <Link href="/labs" className="text-violet-200 hover:text-white">
              Research Labs
            </Link>
            <span className="mx-2 opacity-60">/</span>
            Papers &amp; References
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-white">Papers &amp; References</h1>
          <p className="mt-4 text-violet-100/80">
            We are curating a bibliography that maps each lab module to core papers and resources. Check back soon, or
            start with the{" "}
            <Link href="/labs" className="text-violet-300 underline-offset-2 hover:text-white hover:underline">
              lab modules
            </Link>{" "}
            on the main page.
          </p>
        </article>
        <Footer />
      </div>
    </main>
  );
}
