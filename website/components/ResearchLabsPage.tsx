import dynamic from "next/dynamic";
import Link from "next/link";
import { AmbientBackground } from "@/components/AmbientBackground";
import { BrowserExtensionDemoShell } from "@/components/DemoAnimationShells";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { PAPER_ENTRIES, RESEARCH_FAQS } from "@/lib/researchContent";

const DemoSectionLazy = dynamic(
  () => import("@/components/DemoSection").then((m) => ({ default: m.DemoSection })),
  { ssr: false, loading: () => <BrowserExtensionDemoShell embedded /> }
);
function SourcesBlock({
  title = "Sources",
  items
}: {
  title?: string;
  items: Array<{ label: string; url: string }>;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-line bg-cream-dark p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">{title}</p>
      <ol className="mt-3 space-y-2 text-sm text-muted">
        {items.map((item, index) => (
          <li key={item.url}>
            <span className="mr-2 text-faint">[{index + 1}]</span>
            <a href={item.url} className="underline-offset-2 hover:text-ink hover:underline">
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SpotlightCard({
  title,
  body,
  href
}: {
  title: string;
  body: string;
  href: string;
}) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-line bg-cream p-6 backdrop-blur-sm">
      <h3 className="text-xl font-semibold text-ink">{title}</h3>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">{body}</p>
      <a
        href={href}
        className="mt-6 inline-flex w-fit items-center justify-center rounded-xl border border-line bg-cream-dark px-4 py-2.5 text-sm font-semibold text-muted transition hover:bg-cream-dark hover:text-ink"
      >
        Read on arXiv
      </a>
    </article>
  );
}

type Props = Record<string, never>;

export function ResearchLabsPage(_props?: Props) {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground variant="static" />
      <div className="relative z-10">
        <Navbar />

        <section className="px-4 pb-6 pt-10 sm:pb-8 sm:pt-14">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Research</p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight text-ink sm:text-6xl">
                Prompt Engineering
              </h1>
            </div>
          </div>
        </section>

        <section id="browser-extension-demo" className="scroll-mt-24 px-4 pb-6 pt-2 sm:pb-8 sm:pt-4">
          <div className="mx-auto max-w-6xl">
            <DemoSectionLazy embedded />
          </div>
        </section>

        <section className="border-t border-line px-4 pb-4 pt-2 sm:pb-6">
          <div className="mx-auto max-w-6xl text-center">
            <p className="text-sm text-muted">
              Looking for the{" "}
              <Link href="/" className="font-semibold text-ink underline-offset-2 hover:underline">
                Promptly browser extension
              </Link>
              ? That&apos;s on our product page — this section covers the research behind it.
            </p>
          </div>
        </section>

        <section id="prompt-optimisation-research" className="scroll-mt-24 px-4 py-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Prompt optimisation research</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">From better prompting advice to repeatable engineering loops</h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-line bg-cream p-6 backdrop-blur-sm sm:p-8">
                <h3 className="text-2xl font-semibold text-ink">How to write an effective prompt</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  MIT Sloan Teaching & Learning Technologies frames prompting as a way of programming with words and
                  emphasises three practical habits: provide context, be specific, and build on the conversation.[1]
                </p>
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-line bg-cream-dark p-4">
                    <p className="font-semibold text-ink">Provide context</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      Describe the domain, assumptions, audience, and available inputs so the model knows what frame it
                      should operate within.[1]
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line bg-cream-dark p-4">
                    <p className="font-semibold text-ink">Be specific</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      State the task, the constraints, and the expected output structure as clearly as possible.[1]
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line bg-cream-dark p-4">
                    <p className="font-semibold text-ink">Build on the conversation</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      Use iteration deliberately: refine the request, keep what worked, and ask clarifying questions when
                      requirements are underspecified.[1]
                    </p>
                  </div>
                </div>
                <p className="mt-6 text-sm leading-relaxed text-muted">
                  A practical way to operationalise that guidance is to write prompts as explicit contracts: context,
                  task, constraints, output schema, examples when needed, and an iteration hook that tells the model how
                  to handle missing information.[1][2]
                </p>
              </article>

              <article className="rounded-3xl border border-line bg-cream p-6 backdrop-blur-sm sm:p-8">
                <h3 className="text-2xl font-semibold text-ink">From craft to engineering</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  The literature increasingly treats prompts as structured artefacts that can be catalogued, tested, and
                  improved with more than intuition alone.[2][3][4]
                </p>
                <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted">
                  <div>
                    <p className="font-semibold text-ink">Prompt pattern libraries</p>
                    <p className="mt-2">
                      Surveys such as <em>The Prompt Report</em> show that prompting techniques form recognizable families,
                      which makes reusable templates and pattern tags a sensible engineering primitive.[2]
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-ink">Test suites and rubrics</p>
                    <p className="mt-2">
                      Once a prompt is treated as a versioned artefact, it becomes natural to evaluate candidates against
                      the same rubric rather than relying on ad hoc impressions.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-ink">Iterative optimisation loops</p>
                    <p className="mt-2">
                      Automatic prompt optimisation, APE, and OPRO all explore the same broad idea: generate candidate
                      instructions, score them, critique them, and keep iterating until the task objective is better
                      satisfied.[3][4][5]
                    </p>
                  </div>
                </div>
                <p className="mt-6 text-sm leading-relaxed text-muted">
                  That is why Promptly is best described as a conceptual architecture for prompt optimisation rather than
                  a promise of universal performance gains.
                </p>
              </article>
            </div>

            <SourcesBlock
              items={[
                { label: "Effective Prompts for AI: The Essentials", url: PAPER_ENTRIES[0].url },
                { label: "The Prompt Report: A Systematic Survey of Prompt Engineering Techniques", url: PAPER_ENTRIES[2].url },
                { label: "Automatic Prompt Optimization with \"Gradient Descent\" and Beam Search", url: PAPER_ENTRIES[3].url },
                { label: "Large Language Models Are Human-Level Prompt Engineers", url: PAPER_ENTRIES[6].url },
                { label: "Large Language Models as Optimizers", url: PAPER_ENTRIES[7].url }
              ]}
            />
          </div>
        </section>

        <section id="research-spotlight" className="scroll-mt-24 px-4 py-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Research spotlight</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">Two useful ways to think about prompt engineering</h2>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <SpotlightCard
                title="A Theoretical Framework for Prompt Engineering"
                body="This recent theory paper includes a Harvard-affiliated author and frames prompts as inference-time configurations that can shape transformer computation. For the site narrative, it supports the modest claim that structured prompts can be reasoned about more formally than mere phrasing tips.[1]"
                href={PAPER_ENTRIES[5].url}
              />
              <SpotlightCard
                title="The Prompt Report"
                body="The Prompt Report is a field map: it assembles a shared vocabulary and taxonomy for prompt engineering techniques. It is especially helpful for explaining why few-shot examples, output contracts, reasoning scaffolds, retrieval grounding, and optimisation loops belong to the same broader design space.[2]"
                href={PAPER_ENTRIES[2].url}
              />
            </div>
            <SourcesBlock
              items={[
                {
                  label: "A Theoretical Framework for Prompt Engineering: Approximating Smooth Functions with Transformer Prompts",
                  url: PAPER_ENTRIES[5].url
                },
                { label: "The Prompt Report: A Systematic Survey of Prompt Engineering Techniques", url: PAPER_ENTRIES[2].url }
              ]}
            />
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 px-4 py-10 pb-24">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">FAQ</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">Common questions about prompt engineering and optimisation</h2>
            </div>
            <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-cream backdrop-blur-sm">
              {RESEARCH_FAQS.map((item) => (
                <article key={item.question} className="px-6 py-6 sm:px-8">
                  <h3 className="text-lg font-semibold text-ink">{item.question}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{item.answer}</p>
                </article>
              ))}
            </div>
            <SourcesBlock
              items={[
                { label: "Glossary of Terms: Generative AI Basics", url: PAPER_ENTRIES[1].url },
                {
                  label: "Measuring and Controlling Instruction (In)Stability in Language Model Dialogs",
                  url: PAPER_ENTRIES[4].url
                },
                { label: "Automatic Prompt Optimization with \"Gradient Descent\" and Beam Search", url: PAPER_ENTRIES[3].url },
                { label: "Large Language Models Are Human-Level Prompt Engineers", url: PAPER_ENTRIES[6].url },
                { label: "Effective Prompts for AI: The Essentials", url: PAPER_ENTRIES[0].url },
                { label: "The Prompt Report: A Systematic Survey of Prompt Engineering Techniques", url: PAPER_ENTRIES[2].url }
              ]}
            />
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
