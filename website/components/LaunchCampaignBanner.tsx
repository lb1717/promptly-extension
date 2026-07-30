"use client";

import Link from "next/link";
import { SITE } from "@/lib/constants";
import { useLaunchCampaign } from "@/lib/useLaunchCampaign";

function bannerMessage(remaining: number) {
  return `First 1,000 Customer Accounts Are Free. Get Yours Now. Only ${remaining.toLocaleString()} Remaining`;
}

export function LaunchCampaignBanner() {
  const { loading, promoActive, remaining } = useLaunchCampaign();

  if (loading || !promoActive) {
    return null;
  }

  const message = bannerMessage(remaining);

  return (
    <div
      className="relative z-[60] border-b border-red-800 bg-red-600 text-white"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div className="mx-auto max-w-6xl px-4 py-2.5 sm:hidden">
        <div className="launch-banner-marquee overflow-hidden" aria-live="polite">
          <div className="launch-banner-marquee-track flex w-max">
            {[0, 1].map((copy) => (
              <span key={copy} className="shrink-0 px-6 text-sm font-semibold" aria-hidden={copy === 1}>
                {message}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-center">
          <Link
            href={SITE.launchPath}
            className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-ink hover:bg-neutral-100"
          >
            Claim
          </Link>
        </div>
      </div>

      <div className="mx-auto hidden max-w-6xl flex-col items-center justify-center gap-2.5 px-4 py-2.5 text-center sm:flex sm:flex-row sm:gap-3">
        <p className="text-[15px] font-semibold">{message}</p>
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
