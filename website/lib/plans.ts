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
    subtitle: "Try Promptly with weekly token limits.",
    details: ["Core models and functionality", "Weekly limited tokens"],
    paid: false,
    available: true
  },
  {
    key: "student",
    name: "Student",
    priceDisplay: "$9.99/mo",
    subtitle: "Built for coursework, research, and academic writing.",
    details: [
      "Prompt engineering designed for students",
      "Created to improve academic work",
      "Strong and fast models available",
      "Basic AI usage statistics"
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
      "Advanced prompt optimization for professionals",
      "Created to save time on extensive AI use",
      "Highest model quality available",
      "Fastest model quality available",
      "Extensive AI usage statistics"
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
      "Usage statistics to understand AI across teams and cut time on prompting",
      "Designed for founders and executives tracking AI performance firm-wide"
    ],
    paid: true,
    available: true
  }
] as const;

export const ONBOARDING_PLANS = WEBSITE_PLANS.filter((plan) => plan.available).sort((a, b) => {
  if (a.key === "free") return 1;
  if (b.key === "free") return -1;
  return 0;
});

/** Paid plans shown on /get-started — free is offered as de-emphasized text instead. */
export const GET_STARTED_PLANS = WEBSITE_PLANS.filter((plan) => plan.available && plan.paid);

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
