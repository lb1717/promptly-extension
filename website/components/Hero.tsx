import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-transparent px-4 pb-20 pt-8 sm:pt-12">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 flex justify-center">
            <div className="rounded-2xl bg-white/80 p-1.5 shadow-[0_10px_24px_rgba(2,6,23,0.28)]">
              <img src="/images/promptly-logo.png" alt="Promptly logo" className="h-[54px] w-[54px] object-contain" />
            </div>
          </div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
            Promptly Chrome Extension
          </p>
          <h1 className="mb-5 text-4xl font-semibold leading-tight text-white sm:text-6xl">
            Improve every prompt.
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-violet-100/80">
            Promptly improves your prompt in one click directly inside ChatGPT, Claude, and Gemini, so you get
            better output with less trial-and-error.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button href={SITE.chromeStoreUrl}>Add Promptly to Chrome</Button>
            <Button href="#how-it-works" variant="ghost">
              See how it works
            </Button>
          </div>

          <div className="mx-auto mt-14 max-w-4xl border-t border-white/10 pt-10 text-center">
            <div className="grid gap-8 sm:grid-cols-3 sm:gap-6">
              <div className="flex flex-col items-center text-center">
                <p className="mb-3 min-h-[2.75rem] text-xs font-semibold uppercase tracking-wide text-violet-200/90 sm:min-h-0 sm:text-[0.7rem]">
                  Better Performing Prompts
                </p>
                <p className="mb-2 text-4xl font-semibold tabular-nums text-white sm:text-5xl">2.1×</p>
                <p className="max-w-[220px] text-xs leading-relaxed text-violet-200/75 sm:text-sm">
                  Task performance relative to human prompting
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <p className="mb-3 min-h-[2.75rem] text-xs font-semibold uppercase tracking-wide text-violet-200/90 sm:min-h-0 sm:text-[0.7rem]">
                  Faster LLM Response Time
                </p>
                <p className="mb-2 text-4xl font-semibold tabular-nums text-white sm:text-5xl">20%</p>
                <p className="max-w-[220px] text-xs leading-relaxed text-violet-200/75 sm:text-sm">
                  Faster response time given more accurate scope
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <p className="mb-3 min-h-[2.75rem] text-xs font-semibold uppercase tracking-wide text-violet-200/90 sm:min-h-0 sm:text-[0.7rem]">
                  Reduced Hallucinations
                </p>
                <p className="mb-2 text-4xl font-semibold tabular-nums text-white sm:text-5xl">61%</p>
                <p className="max-w-[220px] text-xs leading-relaxed text-violet-200/75 sm:text-sm">
                  Less likely to hallucinate
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
