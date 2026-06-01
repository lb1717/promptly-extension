import { Button } from "@/components/ui/Button";
import { PRICING_PAGE_PLANS } from "@/lib/plans";

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-24 border-t border-line px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-[0.2em] text-faint">
          Plans
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-lg font-semibold text-ink sm:text-xl">
          Simple plans for everyday use and professional workflows.
        </p>
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
          {PRICING_PAGE_PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`relative flex h-full min-h-[430px] flex-col rounded-2xl border p-6 sm:min-h-[460px] sm:p-8 ${
                plan.featured ? "border-ink bg-cream shadow-card" : "border-line bg-cream"
              }`}
            >
              {plan.featured ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-0.5 text-xs font-semibold text-cream">
                  Popular
                </span>
              ) : null}
              <h3 className="text-xl font-semibold text-ink">{plan.name}</h3>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums text-ink sm:text-4xl">
                  {plan.priceDisplay.replace("/mo", "")}
                </span>
                <span className="text-sm text-faint">/month</span>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{plan.subtitle}</p>
              <ul className="mt-6 min-h-[7.5rem] flex-1 space-y-2 text-sm leading-relaxed text-muted">
                {plan.details.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="shrink-0 text-ink">✓</span>
                    {b}
                  </li>
                ))}
              </ul>
              <Button
                href={plan.key === "free" ? "/get-started" : `/account?plan=${plan.key}`}
                variant={plan.featured ? "primary" : "ghost"}
                className="mt-auto w-full justify-center py-3"
              >
                {plan.key === "free" ? "Get started" : `Choose ${plan.name}`}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
