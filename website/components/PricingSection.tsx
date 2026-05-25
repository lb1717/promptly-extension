import { Button } from "@/components/ui/Button";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0.00",
    cadence: "month",
    blurb: "Simple prompt improvement for everyday usage.",
    bullets: [
      "Daily usage tokens: limited",
      "Core models and functionality"
    ],
    cta: "Get started",
    href: "/account?plan=free",
    featured: false
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
    featured: false
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$30.00",
    cadence: "month",
    blurb: "Maximum capability, speed, and reliability at scale.",
    bullets: [
      "Daily usage tokens: 100× Free",
      "Model quality: highest available",
      "Model speed: fastest processing",
      "Research-grade intelligent prompt engineering",
      "Priority during peak times"
    ],
    cta: "Choose Enterprise",
    href: "/account?plan=enterprise",
    featured: true
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
    featured: false
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
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex h-full flex-col rounded-2xl border p-6 sm:p-8 ${
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
              {plan.key === "pro" || plan.key === "student" ? (
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted">Free trial</p>
              ) : null}
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums text-ink sm:text-4xl">{plan.price}</span>
                <span className="text-sm text-faint">/{plan.cadence}</span>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{plan.blurb}</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-muted">
                {plan.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="text-ink">✓</span>
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
