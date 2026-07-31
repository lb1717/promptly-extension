"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SITE } from "@/lib/constants";
import { useLaunchCampaign } from "@/lib/useLaunchCampaign";

function BannerMessage({
  maxFreeAccounts,
  remaining,
  className = ""
}: {
  maxFreeAccounts: number;
  remaining: number;
  className?: string;
}) {
  return (
    <p
      className={`text-base font-medium leading-snug [overflow-wrap:break-word] [word-break:normal] hyphens-none sm:text-lg ${className}`}
    >
      First {maxFreeAccounts.toLocaleString()} Accounts Are Free. Only{" "}
      <span className="whitespace-nowrap">
        <span className="font-black tracking-tight">{remaining.toLocaleString()}</span> Remaining
      </span>
    </p>
  );
}

export function LaunchCampaignBanner() {
  const { loading, promoActive, maxFreeAccounts, remaining } = useLaunchCampaign();
  const [shineKey, setShineKey] = useState(0);

  useEffect(() => {
    if (!promoActive) {
      return;
    }
    setShineKey(1);
    const repeatTimer = window.setTimeout(() => setShineKey(2), 5000);
    return () => window.clearTimeout(repeatTimer);
  }, [promoActive]);

  if (loading || !promoActive) {
    return null;
  }

  return (
    <div
      className="relative z-[60] overflow-hidden border-b border-red-800 bg-red-600 text-white"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      {shineKey > 0 ? (
        <span key={shineKey} className="launch-banner-shine-sweep pointer-events-none absolute inset-0 z-10" aria-hidden />
      ) : null}

      <div className="relative z-20 mx-auto flex max-w-6xl flex-col items-center justify-center gap-2.5 px-4 py-2.5 text-center sm:flex-row sm:gap-3">
        <BannerMessage maxFreeAccounts={maxFreeAccounts} remaining={remaining} className="max-w-3xl" />
        <Link
          href={SITE.launchPath}
          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-ink hover:bg-neutral-100"
        >
          Claim Now
        </Link>
      </div>
    </div>
  );
}
