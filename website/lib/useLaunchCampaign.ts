"use client";

import { SITE } from "@/lib/constants";
import { useCallback, useEffect, useState } from "react";

const DEFAULT_MAX_FREE_ACCOUNTS = 1000;

export type LaunchCampaignStatus = {
  promoActive: boolean;
  maxFreeAccounts: number;
  claimedCount: number;
  remaining: number;
};

export function useLaunchCampaign(options: { pollMs?: number } = {}) {
  const pollMs = options.pollMs ?? 10_000;
  const [status, setStatus] = useState<LaunchCampaignStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/campaign/status", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus({
          promoActive: Boolean(data.promoActive),
          maxFreeAccounts: Math.max(0, Number(data.maxFreeAccounts || 0)),
          claimedCount: Math.max(0, Number(data.claimedCount || 0)),
          remaining: Math.max(0, Number(data.remaining || 0))
        });
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), pollMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollMs, refresh]);

  const promoActive = Boolean(status?.promoActive);

  return {
    loading,
    status,
    promoActive,
    maxFreeAccounts: status?.maxFreeAccounts ?? DEFAULT_MAX_FREE_ACCOUNTS,
    remaining: status?.remaining ?? 0,
    launchPath: SITE.launchPath,
    getStartedPath: promoActive ? SITE.launchPath : SITE.getStartedPath
  };
}
