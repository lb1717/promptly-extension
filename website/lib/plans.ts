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
    subtitle: "Improve prompts in the browser and see how you use AI.",
    details: [
      "One-click prompt improvement in ChatGPT, Claude, and Gemini",
      "Personal statistics on prompt volume and screen time",
      "Weekly token limits"
    ],
    paid: false,
    available: true
  },
  {
    key: "student",
    name: "Student",
    priceDisplay: "$9.99/mo",
    subtitle: "Stronger prompts and usage stats for coursework and research.",
    details: [
      "Prompt improvement for essays, problem sets, and research drafts",
      "Track prompt volume, time on AI, and which models you use",
      "Explore prompt diagnostics and research tools on the Labs page",
      "Higher weekly token limits at student pricing"
    ],
    paid: true,
    available: true
  },
  {
    key: "pro",
    name: "Pro",
    priceDisplay: "$20.00/mo",
    subtitle: "Professional prompt quality plus a full picture of your AI habits.",
    details: [
      "Advanced one-click prompt optimization for daily professional work",
      "Statistics on prompts, screen time, and models across web AI tools",
      "Claude Code, Cursor, and Codex usage in one statistics dashboard",
      "Prompt diagnostics and research tools to sharpen how you write instructions",
      "Highest token limits and model quality"
    ],
    paid: true,
    available: true,
    featured: true
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceDisplay: "$70.00/mo",
    subtitle: "Firm-wide prompt quality, diagnostics, and spend visibility.",
    details: [
      "Everything in Pro for power users and team leads",
      "Aggregate statistics on prompt volume, engagement, and tool adoption",
      "Track Claude Code, Cursor, and Codex usage across your organization",
      "Subscription spend tracking and budget visibility for AI plans",
      "Prompt diagnostics to keep team output consistent and measurable",
      "Maximum token limits for intensive daily use"
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
