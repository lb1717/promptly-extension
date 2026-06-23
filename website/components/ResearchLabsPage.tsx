import dynamic from "next/dynamic";
import Link from "next/link";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { PAPER_ENTRIES, TIMELINE_STEPS, type TimelineStep } from "@/lib/researchContent";

const ResearchCompanionDemoLazy = dynamic(
  () => import("@/components/ResearchCompanionDemo").then((m) => ({ default: m.ResearchCompanionDemo })),
  { ssr: false, loading: () => <p className="py-16 text-center text-sm text-faint">Loading demo…</p> }
);

const FAQS = [
  {
    question: "What is prompt engineering?",
    answer:
      "MIT Sloan defines prompt engineering as the practice of designing prompts to guide an AI model's output, including setting roles, specifying format, adding constraints, or giving examples.[1]"
  },
  {
    question: "Why do prompts drift in long chats?",
    answer:
      "Prompt stability can weaken over long multi-turn dialogs. Recent work measures meaningful instruction drift within several rounds and links part of the effect to attention decay, so it is useful to restate important constraints and output contracts.[2]"
  },
  {
    question: "Can prompts be optimised automatically?",
    answer:
      "Yes, at least conceptually and sometimes algorithmically. Research on automatic prompt optimisation, APE, and OPRO treats prompts as search objects that can be critiqued, rescored, and revised, although exact gains depend on task, model, and evaluation setup.[2][3][4]"
  },
  {
    question: "Do templates help?",
    answer:
      "Templates can help when the task benefits from a repeatable structure. MIT's guidance on context and specificity, together with survey work on prompt taxonomies, supports using reusable prompt patterns and explicit output contracts when consistency matters.[5][6]"
  },
  {
    question: "What should I do if the model makes things up?",
    answer:
      "Tighten the prompt's evidence boundary: specify the allowed sources, request explicit assumptions, and require the model to distinguish grounded statements from open uncertainty. That does not eliminate hallucinations, but it makes them easier to inspect and catch.[1][5]"
  }
];

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

function TimelineIcon({ icon }: { icon: TimelineStep["icon"] }) {
  if (icon === "ingest") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 6h14M7 10h10M9 14h6M11 18h2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "embed") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    );
  }

  if (icon === "extract") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 6h12v12H6z" />
        <path d="M9 9h6M9 12h6M9 15h4" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "objective") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 18l5-6 4 3 5-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 7h1v4" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "library") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 7h4v11H5zM10 5h4v13h-4zM15 8h4v10h-4z" />
      </svg>
    );
  }

  if (icon === "optimize") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 8a6 6 0 0 1 10-1" strokeLinecap="round" />
        <path d="M17 7V3h4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 16a6 6 0 0 1-10 1" strokeLinecap="round" />
        <path d="M7 17v4H3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 12h10" strokeLinecap="round" />
      <path d="M13 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 5h5v4H6zM6 15h5v4H6z" />
    </svg>
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
                Prompt engineering research
              </h1>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button href="#companion-demo">See it in action</Button>
                <Button href="/papers" variant="ghost">
                  Browse papers
                </Button>
                <Button href="/" variant="ghost">
                  Product page
                </Button>
              </div>
            </div>
          </div>
        </section>

        <ResearchCompanionDemoLazy />

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

        <section id="how-promptly-works" className="scroll-mt-24 px-4 py-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">How Promptly works</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">A science and maths oriented product narrative</h2>
              <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
                The pipeline below is presented as a conceptual architecture. It shows how a prompt can be normalised,
                represented, decomposed into explicit fields, and iteratively rewritten with retrieved prompt patterns
                and search-style optimisation.[1][2][3][4]
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-3xl border border-line bg-cream p-6 backdrop-blur-sm sm:p-8">
                <div className="space-y-8">
                  {TIMELINE_STEPS.map((step, index) => (
                    <div key={step.title} className="grid grid-cols-[auto_1fr] gap-4">
                      <div className="flex flex-col items-center">
                        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-cream-dark text-muted">
                          <TimelineIcon icon={step.icon} />
                        </div>
                        {index < TIMELINE_STEPS.length - 1 ? (
                          <div className="mt-3 h-full min-h-12 w-px bg-gradient-to-b from-line to-transparent" />
                        ) : null}
                      </div>
                      <div className="pb-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
                          Step {index + 1}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-ink">{step.title}</h3>
                        <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-line bg-cream-dark p-6 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">
                    Conceptual objective function
                  </p>
                  <div className="mt-4 rounded-2xl border border-line bg-cream-dark p-4">
                    <p className="font-mono text-sm leading-relaxed text-ink sm:text-base">
                      min_s L(s;θ) + λ1 Ambiguity(s) + λ2 FormatViolations(s) + λ3 TokenCost(s)
                    </p>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted">
                    This is a compact way to express the design target: improve task fit while penalising ambiguity,
                    formatting failures, and unnecessary token overhead.[2][4]
                  </p>
                </div>

                <div className="rounded-3xl border border-line bg-cream p-6 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Retrieved pattern tags</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      "prompt-contract",
                      "few-shot",
                      "output-schema",
                      "retrieval-grounding",
                      "clarifying-questions",
                      "constraint-check",
                      "rubric-driven",
                      "search-loop"
                    ].map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-line bg-cream-dark px-3 py-1 text-xs font-medium text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-line bg-cream p-6 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Search + textual gradients</p>
                  <div className="mt-4 grid gap-3 text-sm text-muted">
                    <div className="rounded-2xl border border-line bg-cream-dark px-4 py-3">Generate candidate rewrites</div>
                    <div className="rounded-2xl border border-line bg-cream-dark px-4 py-3">Critique against rubric</div>
                    <div className="rounded-2xl border border-line bg-cream-dark px-4 py-3">Search, score, and keep the best candidate</div>
                  </div>
                </div>

                <div className="rounded-3xl border border-line bg-cream p-6 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Emit</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-line bg-cream-dark px-4 py-3 text-sm text-muted">
                      Optimised prompt
                    </div>
                    <div className="rounded-2xl border border-line bg-cream-dark px-4 py-3 text-sm text-muted">
                      Side-by-side diff
                    </div>
                    <div className="rounded-2xl border border-line bg-cream-dark px-4 py-3 text-sm text-muted">
                      Template tags
                    </div>
                    <div className="rounded-2xl border border-line bg-cream-dark px-4 py-3 text-sm text-muted">
                      Export-ready prompt
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-line bg-cream-dark p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Science note</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                The research picture here is intentionally modest: the survey literature supports prompt taxonomies and
                reusable technique families, automatic prompt optimisation work explores textual-gradient style editing,
                dialog studies measure instruction drift over long exchanges, and the recent theory paper offers a more
                formal lens for treating prompts as inference-time configurations.[1][2][3][4]
              </p>
            </div>

            <div className="mt-6 rounded-3xl border border-line bg-cream-dark p-6 text-sm leading-relaxed text-muted">
              <p className="font-semibold text-ink">Accuracy & transparency</p>
              <p className="mt-3">
                The pipeline above is a scientific, implementation-ready design spec. Exact methods may vary by model
                provider, latency budget, and evaluation requirements.
              </p>
            </div>

            <SourcesBlock
              items={[
                { label: "The Prompt Report: A Systematic Survey of Prompt Engineering Techniques", url: PAPER_ENTRIES[2].url },
                {
                  label: "Automatic Prompt Optimization with \"Gradient Descent\" and Beam Search",
                  url: PAPER_ENTRIES[3].url
                },
                {
                  label: "Measuring and Controlling Instruction (In)Stability in Language Model Dialogs",
                  url: PAPER_ENTRIES[4].url
                },
                {
                  label: "A Theoretical Framework for Prompt Engineering: Approximating Smooth Functions with Transformer Prompts",
                  url: PAPER_ENTRIES[5].url
                }
              ]}
            />
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
              {FAQS.map((item) => (
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
