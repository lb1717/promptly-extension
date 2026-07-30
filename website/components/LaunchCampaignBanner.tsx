"use client";

import Link from "next/link";
import { SITE } from "@/lib/constants";
import { useLaunchCampaign } from "@/lib/useLaunchCampaign";

export function LaunchCampaignBanner() {
  const { loading, promoActive, remaining } = useLaunchCampaign();

  if (loading || !promoActive) {
    return null;
  }

  return (
    <div className="relative z-[60] border-b border-red-800 bg-red-600 px-4 py-2.5 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 text-center sm:justify-between sm:text-left">
        <p className="text-sm font-semibold sm:text-[15px]">
          First 1,000 Customer Accounts Are Free. Get Yours Now. Only{" "}
          <span className="tabular-nums">{remaining.toLocaleString()}</span> Remaining
        </p>
        <Link
          href={SITE.launchPath}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-ink hover:bg-neutral-100"
        >
          Claim
        </Link>
      </div>
    </div>
  );
}
