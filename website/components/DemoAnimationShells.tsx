import { DEMO_PROMPT_PLACEHOLDER_CLASS } from "@/lib/demoPromptStyles";

export function ResearchCompanionDemoShell({ compactTop = false }: { compactTop?: boolean }) {
  return (
    <section
      id="companion-demo"
      className={`scroll-mt-24 px-4 pb-8 sm:pb-10 ${compactTop ? "pt-2 sm:pt-3" : "py-8 sm:py-10"}`}
      aria-hidden
    >
      <div className="mx-auto max-w-6xl">
        <div className="research-companion-scene relative mx-auto flex h-[380px] w-full max-w-[min(100%,570px)] flex-col overflow-hidden rounded-lg border border-[#d8dce5] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.12)] sm:h-[420px] sm:max-w-[min(100%,630px)]">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#e5e7eb] bg-[#fafafa] px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <div className="ml-2 h-3 w-24 rounded bg-[#e5e7eb]" />
          </div>

          <div className="relative min-h-0 flex-1 bg-white">
            <div className="absolute right-3 top-3 h-[196px] w-[220px] max-w-[calc(100%-1.5rem)] rounded-lg border border-[#d8dce5] bg-[#f4f5f7]" />
          </div>

          <div className="shrink-0 border-t border-[#e5e7eb] bg-white px-4 py-3 sm:px-5">
            <div className="flex h-11 items-center rounded-xl border border-[#d1d5db] bg-[#fafafa] px-3 sm:h-12">
              <span className={`text-[11px] leading-none ${DEMO_PROMPT_PLACEHOLDER_CLASS}`}>Type prompt...</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BrowserExtensionDemoShell({ embedded = false }: { embedded?: boolean }) {
  return (
    <div
      className={
        embedded
          ? "relative mx-auto max-w-5xl px-3 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-20"
          : "relative mx-auto max-w-5xl rounded-2xl border border-line bg-cream px-3 pb-4 pt-16 shadow-card sm:rounded-3xl sm:px-8 sm:pb-8 sm:pt-20"
      }
      aria-hidden
    >
      <div className="relative mx-auto max-w-[980px] rounded-[18px] border border-slate-300/70 bg-white px-3 py-3 shadow-[0_12px_30px_rgba(2,6,23,0.12)] sm:rounded-[26px] sm:px-5 sm:py-4">
        <div className="min-h-[2rem] sm:min-h-[2.5rem]" />
      </div>
      <div className="absolute -top-10 right-[14%] h-9 w-[168px] rounded-t-lg rounded-bl-none bg-ink sm:-top-[51px] sm:right-[40px] sm:h-[49px] sm:w-[320px] sm:rounded-t-xl" />
    </div>
  );
}
