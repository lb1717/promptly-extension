"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SITE } from "@/lib/constants";
import { useLaunchCampaign } from "@/lib/useLaunchCampaign";

function BannerMessage({ remaining, className = "" }: { remaining: number; className?: string }) {
  return (
    <span className={`whitespace-nowrap [overflow-wrap:normal] [word-break:keep-all] ${className}`}>
      First 1,000 Accounts Are Free. Only{" "}
      <span className="font-black tracking-tight">{remaining.toLocaleString()}</span> Remaining
    </span>
  );
}

export function LaunchCampaignBanner() {
  const { loading, promoActive, remaining } = useLaunchCampaign();
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

      <div className="relative z-20 mx-auto max-w-6xl px-4 py-2.5 md:hidden">
        <div className="launch-banner-marquee overflow-hidden" aria-live="polite">
          <div className="launch-banner-marquee-track flex w-max">
            {[0, 1].map((copy) => (
              <span key={copy} className="inline-flex shrink-0 px-6" aria-hidden={copy === 1}>
                <BannerMessage remaining={remaining} className="text-base font-medium" />
              </span>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-center">
          <Link
            href={SITE.launchPath}
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-ink hover:bg-neutral-100"
          >
            Claim Now
          </Link>
        </div>
      </div>

      <div className="relative z-20 mx-auto hidden max-w-6xl flex-col items-center justify-center gap-2.5 px-4 py-2.5 text-center md:flex md:flex-row md:gap-3">
        <BannerMessage remaining={remaining} className="shrink-0 text-base font-medium lg:text-lg" />
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
