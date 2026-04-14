import type { Metadata } from "next";
import Link from "next/link";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { PAPER_ENTRIES } from "@/lib/researchContent";

export const metadata: Metadata = {
  title: "Papers | Promptly Research Labs",
  description: "A curated reading list of MIT and arXiv sources behind the Promptly Research Labs pages."
};

export default function PapersPage() {
  return (
    <main className="relative min-h-screen bg-black text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />

        <section className="px-4 pb-16 pt-10 sm:pb-20 sm:pt-14">
          <div className="mx-auto max-w-5xl">
            <p className="text-sm text-violet-200/70">
              <Link href="/labs" className="text-violet-200 hover:text-white">
                Promptly Research Labs
              </Link>
              <span className="mx-2 opacity-60">/</span>
              Papers
            </p>
            <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">Papers &amp; sources</h1>
            <p className="mt-5 max-w-3xl text-sm leading-relaxed text-violet-100/78 sm:text-base">
              This page collects the MIT and arXiv references used across the research experience. The annotations are
              intentionally short so you can scan for theory, prompting guidance, stability work, and optimisation
              methods quickly.
            </p>
          </div>
        </section>

        <section className="px-4 pb-24">
          <div className="mx-auto max-w-5xl space-y-4">
            {PAPER_ENTRIES.map((entry, index) => (
              <article
                key={entry.url}
                className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 backdrop-blur-md sm:p-7"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-3xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/80">
                      Source {index + 1}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">{entry.title}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-violet-100/80">{entry.annotation}</p>
                  </div>
                  <a
                    href={entry.url}
                    className="inline-flex w-fit items-center justify-center rounded-xl border border-violet-300/30 bg-white/5 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-white/10 hover:text-white"
                  >
                    Open source
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
