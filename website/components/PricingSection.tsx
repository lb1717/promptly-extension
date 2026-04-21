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
    <section id="pricing" className="scroll-mt-24 border-t border-white/10 px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-[0.2em] text-violet-200/80">
          Plans
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-lg font-semibold text-white sm:text-xl">
          Choose the plan that fits your workflow.
        </p>
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 xl:grid-cols-4">
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
