import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-hero-radial px-4 pb-20 pt-16 sm:pt-24">
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
            Upgrade every AI prompt from vague to high-performing
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
        </div>
      </div>
    </section>
  );
}
