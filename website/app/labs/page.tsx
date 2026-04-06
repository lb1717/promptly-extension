import type { Metadata } from "next";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Button } from "@/components/ui/Button";
import { Footer } from "@/components/Footer";
import { LabsFAQ } from "@/components/LabsFAQ";
import { Navbar } from "@/components/Navbar";
import { LAB_MODULES } from "@/lib/labsContent";

export const metadata: Metadata = {
  title: "Research Labs | Promptly Labs",
  description:
    "Learn prompt engineering by running experiments — not guessing. Lab modules from prompt anatomy through evaluation, RAG, and security."
};

const STEPS = [
  {
    title: "Learn the concept",
    body: "Short explanations and patterns you can reuse across models and tools."
  },
  {
    title: "Run experiments on the same dataset",
    body: "Hold settings fixed, change only the prompt, and record outcomes with a shared rubric."
  },
  {
    title: "Save the best prompt as a versioned template",
    body: "Promote winners to named versions so your team can regress and improve over time."
  }
];

export default function LabsPage() {
  return (
    <main className="relative min-h-screen bg-black text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />

        <section className="relative overflow-hidden bg-transparent px-4 pb-16 pt-8 sm:pb-20 sm:pt-12">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-5 flex justify-center">
                <div className="rounded-2xl bg-white/80 p-1.5 shadow-[0_10px_24px_rgba(2,6,23,0.28)]">
                  <img src="/images/promptly-logo.png" alt="Promptly Labs" className="h-[54px] w-[54px] object-contain" />
                </div>
              </div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Promptly Labs</p>
              <h1 className="mb-4 text-4xl font-semibold leading-tight text-white sm:text-6xl">Research Labs</h1>
              <p className="mb-6 text-lg font-medium text-violet-200/90 sm:text-xl">
                Learn prompt engineering by running experiments — not guessing.
              </p>
              <p className="mx-auto mb-10 max-w-2xl text-left text-violet-100/85 sm:text-center">
                Prompt engineering is the craft of writing instructions that reliably steer large language models. In
                these labs, you will learn repeatable prompt patterns, measure their impact with tests, and graduate from
                “trial and error” to an engineering workflow.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button href="#lab-1">Start Lab 1: Prompt Anatomy</Button>
                <Button href="#techniques-library" variant="ghost">
                  Browse the Techniques Library
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="techniques-library" className="scroll-mt-24 px-4 pb-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-[0.2em] text-violet-200/80">
              Lab modules
            </h2>
            <p className="mx-auto mb-12 max-w-2xl text-center text-violet-100/75">
              Each module is designed to be hands-on: learn a technique, run it on the same kind of data, and keep a
              record of what worked.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              {LAB_MODULES.map((lab) => (
                <article
                  key={lab.id}
                  id={lab.id}
                  className="scroll-mt-28 flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md transition hover:border-violet-400/25 hover:bg-white/[0.055] sm:p-7"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-300/90">
                    Lab {lab.number}
                  </p>
                  <h3 className="mb-3 text-xl font-semibold text-white">{lab.name}</h3>
                  <p className="mb-4 text-sm leading-relaxed text-violet-100/85">{lab.summary}</p>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-200/70">
                    What you will learn
                  </p>
                  <ul className="mb-6 flex-1 list-disc space-y-1.5 pl-4 text-sm text-violet-100/80">
                    {lab.learnings.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <Button href={`#${lab.id}`} variant="ghost" className="mt-auto w-full sm:w-auto">
                    Run the lab
                  </Button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-12 text-center text-sm font-semibold uppercase tracking-[0.2em] text-violet-200/80">
              How the labs work
            </h2>
            <div className="grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/10">
              {STEPS.map((step, i) => (
                <div key={step.title} className="px-4 text-center md:px-8 md:text-left">
                  <div className="mb-4 flex justify-center md:justify-start">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-400/40 bg-violet-500/15 text-sm font-semibold text-violet-100">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-violet-100/80">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <LabsFAQ />

        <section id="references" className="scroll-mt-24 px-4 pb-24">
          <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-center backdrop-blur-md sm:p-10">
            <p className="mb-6 text-violet-100/85">Want the academic sources behind these labs?</p>
            <Button href="/labs/papers" variant="ghost" className="px-7 py-3.5 text-base">
              See Papers &amp; References
            </Button>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
