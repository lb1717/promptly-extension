export type SalesTeamTier = "pro" | "student" | "enterprise";

export type SalesTeamOfferKind = "percent_1m" | "percent_2m" | "trial";

export type SalesTeamOfferSpec = {
  offerKey: string;
  kind: SalesTeamOfferKind;
  percentOff?: number;
  months?: number;
  trialDays?: number;
  catalogKey: string;
  labelSuffix: string;
};

export const SALES_TEAM_TIERS: SalesTeamTier[] = ["enterprise", "pro", "student"];

const TIER_LABEL: Record<SalesTeamTier, string> = {
  enterprise: "Enterprise",
  pro: "Pro",
  student: "Student"
};

const PERCENT_1M = [10, 20, 30, 40, 50] as const;
const PERCENT_2M = [10, 20, 30, 40] as const;
const TRIAL_DAYS = [7, 10, 14] as const;

function buildPercentOffers(
  percents: readonly number[],
  months: 1 | 2,
  kind: "percent_1m" | "percent_2m"
): SalesTeamOfferSpec[] {
  return percents.map((percentOff) => {
    const offerKey = `${percentOff}p-${months}m`;
    const catalogKey = offerKey;
    const monthLabel = months === 1 ? "1 month" : "2 months";
    return {
      offerKey,
      kind,
      percentOff,
      months,
      catalogKey,
      labelSuffix: `${percentOff}% off first ${monthLabel}`
    };
  });
}

const PERCENT_OFFERS: SalesTeamOfferSpec[] = [
  ...buildPercentOffers(PERCENT_1M, 1, "percent_1m"),
  ...buildPercentOffers(PERCENT_2M, 2, "percent_2m")
];

const TRIAL_OFFERS: SalesTeamOfferSpec[] = TRIAL_DAYS.map((trialDays) => ({
  offerKey: `trial-${trialDays}d`,
  kind: "trial" as const,
  trialDays,
  catalogKey: `trial-${trialDays}d`,
  labelSuffix: `${trialDays}-day free trial`
}));

export const SALES_TEAM_OFFER_SPECS: SalesTeamOfferSpec[] = [...PERCENT_OFFERS, ...TRIAL_OFFERS];

export function salesTeamOfferLabel(tier: SalesTeamTier, spec: SalesTeamOfferSpec): string {
  return `${TIER_LABEL[tier]} — ${spec.labelSuffix}`;
}

export function salesTeamLinkSlug(teamSlug: string, tier: SalesTeamTier, offerKey: string): string {
  return `${teamSlug}-${tier}-${offerKey}`.toLowerCase();
}

export const SALES_TEAM_LINK_COUNT =
  SALES_TEAM_TIERS.length * SALES_TEAM_OFFER_SPECS.length;

export function countSalesTeamLinks(): number {
  return SALES_TEAM_LINK_COUNT;
}
