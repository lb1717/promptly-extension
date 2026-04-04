import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Research | Promptly Labs",
  description: "Promptly Labs research."
};

export default function ResearchPage() {
  return (
    <main className="min-h-screen bg-violetDark text-ink">
      <Navbar />
      <article className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:pt-14">
        <p className="text-sm font-medium text-violet-200/70">
          <Link href="/" className="text-violet-200 hover:text-white">
            Home
          </Link>
          <span className="mx-2 opacity-60">/</span>
          Research
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Research</h1>
        <p className="mt-4 text-violet-200/85">
          This page is for research notes, papers, or experiments. Replace this copy with your content.
        </p>
      </article>
      <Footer />
    </main>
  );
}
