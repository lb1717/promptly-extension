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

/** Stored on bulk-created join links — used to detect generic (non-personalized) welcome. */
export const SALES_TEAM_JOIN_OFFER_TITLE = "Your Promptly plan";

export function isSalesTeamJoinLink(link: {
  salesTeamLink?: boolean;
  salesTeamId?: string | null;
  offerKey?: string | null;
  offerTitle?: string;
}): boolean {
  if (link.salesTeamLink) return true;
  if (link.salesTeamId) return true;
  if (link.offerKey) return true;
  return String(link.offerTitle || "").trim() === SALES_TEAM_JOIN_OFFER_TITLE;
}

export function countSalesTeamLinks(): number {
  return SALES_TEAM_LINK_COUNT;
}

export function salesTeamTierLabel(tier: SalesTeamTier): string {
  return TIER_LABEL[tier];
}

export function salesTeamOfferDisplayLabel(offerLabel: string | null | undefined): string {
  const label = String(offerLabel || "").trim();
  if (!label) return "";
  const sep = " — ";
  const idx = label.indexOf(sep);
  return idx >= 0 ? label.slice(idx + sep.length).trim() : label;
}

export function isSalesTeamTrialOfferKey(offerKey: string | null | undefined): boolean {
  return String(offerKey || "").startsWith("trial-");
}

export type SalesTeamLinkRow = {
  id: string;
  slug: string;
  tier: SalesTeamTier;
  offerKey: string | null;
  offerLabel: string | null;
  signupCount: number;
  active: boolean;
};

export type SalesTeamPlanLinkGroup = {
  tier: SalesTeamTier;
  planLabel: string;
  discounts: SalesTeamLinkRow[];
  trials: SalesTeamLinkRow[];
};

function offerKeySortIndex(offerKey: string | null | undefined): number {
  const key = String(offerKey || "");
  const idx = SALES_TEAM_OFFER_SPECS.findIndex((spec) => spec.offerKey === key);
  return idx >= 0 ? idx : 999;
}

function sortByOfferSpecOrder(rows: SalesTeamLinkRow[]): SalesTeamLinkRow[] {
  return [...rows].sort((a, b) => offerKeySortIndex(a.offerKey) - offerKeySortIndex(b.offerKey));
}

export function organizeSalesTeamLinks(links: SalesTeamLinkRow[]): SalesTeamPlanLinkGroup[] {
  return SALES_TEAM_TIERS.map((tier) => {
    const forTier = links.filter((link) => link.tier === tier);
    const discounts = sortByOfferSpecOrder(
      forTier.filter((link) => !isSalesTeamTrialOfferKey(link.offerKey))
    );
    const trials = sortByOfferSpecOrder(forTier.filter((link) => isSalesTeamTrialOfferKey(link.offerKey)));
    return {
      tier,
      planLabel: TIER_LABEL[tier],
      discounts,
      trials
    };
  });
}
