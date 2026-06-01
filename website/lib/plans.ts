export type PlanKey = "free" | "pro" | "student" | "enterprise";

export type PaidPlanKey = "pro" | "student" | "enterprise";

export type WebsitePlan = {
  key: PlanKey;
  name: string;
  priceDisplay: string;
  subtitle: string;
  details: readonly string[];
  paid: boolean;
  available: boolean;
  featured?: boolean;
};

export const WEBSITE_PLANS: readonly WebsitePlan[] = [
  {
    key: "free",
    name: "Free",
    priceDisplay: "$0.00/mo",
    subtitle: "Try Promptly with daily token limits.",
    details: ["Core models and functionality", "Daily limited tokens"],
    paid: false,
    available: true
  },
  {
    key: "student",
    name: "Student",
    priceDisplay: "$9.99/mo",
    subtitle: "Built for coursework, research, and academic writing.",
    details: [
      "Model tuned for student work and academics",
      "Strong prompt quality for essays, papers, and study",
      "Daily usage suited for classes and projects",
      "AI usage statistics"
    ],
    paid: true,
    available: true
  },
  {
    key: "pro",
    name: "Pro",
    priceDisplay: "$20.00/mo",
    subtitle: "Professional-grade prompting for frequent daily use.",
    details: [
      "Advanced prompt engineering for professional workflows",
      "High model quality and fast rewrites",
      "Generous daily usage for frequent prompting",
      "AI usage statistics"
    ],
    paid: true,
    available: true,
    featured: true
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceDisplay: "$70.00/mo",
    subtitle: "Maximum capability for professionals and teams.",
    details: [
      "Research-grade intelligence prompt engineering",
      "Highest model quality available",
      "Fastest model quality available",
      "Extensive AI usage statistics"
    ],
    paid: true,
    available: true
  }
] as const;

export const ONBOARDING_PLANS = WEBSITE_PLANS.filter((plan) => plan.available);

export const PRICING_PAGE_PLANS = WEBSITE_PLANS.filter((plan) => plan.available);

export const ACCOUNT_PLANS = WEBSITE_PLANS;

export function isPaidPlanKey(key: string): key is PaidPlanKey {
  return key === "pro" || key === "student" || key === "enterprise";
}

export function planDetailsForTier(tier: PaidPlanKey): Pick<WebsitePlan, "name" | "priceDisplay" | "details"> {
  const plan = WEBSITE_PLANS.find((p) => p.key === tier);
  if (!plan) {
    throw new Error(`Unknown plan tier: ${tier}`);
  }
  return { name: plan.name, priceDisplay: plan.priceDisplay, details: plan.details };
}
