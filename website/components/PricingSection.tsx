import { Button } from "@/components/ui/Button";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "Try Promptly on your everyday prompts with generous daily limits.",
    bullets: ["Core rewrite & improve", "Works in ChatGPT, Claude, Gemini", "Upgrade anytime"],
    cta: "Get started",
    href: "/account",
    featured: false
  },
  {
    name: "Promptly Pro",
    price: "$0.99",
    cadence: "month",
    blurb: "Everything in Free, with higher limits and priority quality of service.",
    bullets: ["Higher daily usage", "Early access to new lab techniques", "Email support"],
    cta: "Upgrade to Pro",
    href: "/account",
    featured: true
  }
] as const;

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-24 border-t border-white/10 px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-[0.2em] text-violet-200/80">
          Plans
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-lg font-semibold text-white sm:text-xl">
          Free for everyday use, or Promptly Pro when you need more.
        </p>
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-6 backdrop-blur-md sm:p-8 ${
                plan.featured
                  ? "border-violet-400/40 bg-violet-500/[0.12] shadow-[0_20px_60px_rgba(124,58,237,0.2)]"
                  : "border-white/10 bg-white/[0.04]"
              }`}
            >
              {plan.featured ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-500 px-3 py-0.5 text-xs font-semibold text-white">
                  Popular
                </span>
              ) : null}
              <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums text-white sm:text-4xl">{plan.price}</span>
                <span className="text-sm text-violet-200/70">/{plan.cadence}</span>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-violet-100/80">{plan.blurb}</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-violet-100/85">
                {plan.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="text-violet-400">✓</span>
                    {b}
                  </li>
                ))}
              </ul>
              <Button
                href={plan.href}
                variant={plan.featured ? "primary" : "ghost"}
                className="mt-8 w-full justify-center py-3"
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
