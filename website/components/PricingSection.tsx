import { Button } from "@/components/ui/Button";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0.00",
    cadence: "month",
    blurb: "Single prompt improvement for minimal everyday usage or trials.",
    bullets: [
      "Core models and functionality",
      "Daily limited tokens"
    ],
    cta: "Get started",
    href: "/get-started",
    featured: false,
    available: true
  },
  {
    key: "pro",
    name: "Promptly Pro",
    price: "$2.99",
    cadence: "month",
    blurb: "Higher quality and speed for frequent users.",
    bullets: [
      "7-day free trial (card required)",
      "Daily usage tokens: 25× Free",
      "Model quality: higher than Free",
      "Model speed: faster than Free"
    ],
    cta: "Upgrade to Pro",
    href: "/account?plan=pro",
    featured: false,
    available: false
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$70.00",
    cadence: "month",
    blurb: "Maximum capability, speed, and reliability at scale.",
    bullets: [
      "Research-grade intelligence prompt engineering",
      "Highest model quality available",
      "Fastest model quality available",
      "Extensive AI usage statistics"
    ],
    cta: "Choose Enterprise",
    href: "/account?plan=enterprise",
    featured: true,
    available: true
  },
  {
    key: "student",
    name: "Student",
    price: "$1.49",
    cadence: "month",
    blurb: "Pro-level capability with student pricing.",
    bullets: [
      "7-day free trial (card required)",
      "Daily usage tokens: 25× Free",
      "All features included in Pro",
      "Discounted price versus Pro"
    ],
    cta: "Choose Student",
    href: "/account?plan=student",
    featured: false,
    available: false
  }
] as const;

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
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          {PLANS.filter((plan) => plan.available).map((plan) => (
            <div
              key={plan.name}
              className={`relative flex h-full min-h-[430px] flex-col rounded-2xl border p-6 sm:min-h-[460px] sm:p-8 ${
                plan.featured
                  ? "border-ink bg-cream shadow-card"
                  : "border-line bg-cream"
              }`}
            >
              {plan.featured ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-0.5 text-xs font-semibold text-cream">
                  Popular
                </span>
              ) : null}
              <h3 className="text-xl font-semibold text-ink">{plan.name}</h3>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums text-ink sm:text-4xl">{plan.price}</span>
                <span className="text-sm text-faint">/{plan.cadence}</span>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{plan.blurb}</p>
              <ul className="mt-6 min-h-[7.5rem] flex-1 space-y-2 text-sm leading-relaxed text-muted">
                {plan.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="shrink-0 text-ink">✓</span>
                    {b}
                  </li>
                ))}
              </ul>
              <Button
                href={plan.href}
                variant={plan.featured ? "primary" : "ghost"}
                className="mt-auto w-full justify-center py-3"
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
