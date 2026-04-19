export function HeroStats() {
  return (
    <section className="px-4 pb-16 pt-6 sm:pb-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-4xl border-t border-white/10 pt-10 text-center">
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
    </section>
  );
}
