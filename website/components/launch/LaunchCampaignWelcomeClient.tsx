"use client";

import Link from "next/link";
import { SITE } from "@/lib/constants";
import { useLaunchCampaign } from "@/lib/useLaunchCampaign";

export function LaunchCampaignWelcomeClient() {
  const { loading, promoActive, remaining } = useLaunchCampaign();

  if (loading) {
    return <p className="py-20 text-center text-sm text-muted">Loading launch offer…</p>;
  }

  if (!promoActive) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold text-ink">Launch offer ended</h1>
        <p className="mt-3 text-sm text-muted">The free Pro launch campaign is no longer available.</p>
        <Link href={SITE.getStartedPath} className="mt-6 inline-block text-sm font-semibold text-ink underline">
          Continue to get started
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 pb-24">
      <div className="rounded-2xl border border-line bg-cream p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-semibold text-ink">Welcome to Promptly Labs</h1>
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
          <p className="text-sm font-semibold text-emerald-900">First 1,000 customer accounts are free</p>
          <p className="mt-1 text-sm leading-relaxed text-emerald-800">
            Set up your Pro account in a few minutes — no payment required during our public launch.
          </p>
        </div>
        <p className="mt-5 text-center text-sm font-semibold text-ink">
          {remaining.toLocaleString()} free {remaining === 1 ? "account" : "accounts"} remaining
        </p>
        <Link
          href={`${SITE.getStartedPath}?campaign=launch`}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-neutral-800"
        >
          Set Up Free Account
        </Link>
      </div>
    </div>
  );
}
