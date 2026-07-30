"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import Link from "next/link";
import { useEffect, useState } from "react";

type CampaignResponse = {
  ok?: boolean;
  error?: string;
  active?: boolean;
  promoActive?: boolean;
  maxFreeAccounts?: number;
  claimedCount?: number;
  remaining?: number;
  baselineAccountCount?: number;
  newClaimsSinceInit?: number;
  initializedAt?: string | null;
};

function formatNumber(value: number) {
  return Intl.NumberFormat("en-US").format(Math.max(0, Number(value || 0)));
}

export function AdminCampaignClient() {
  const [data, setData] = useState<CampaignResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [maxFreeAccounts, setMaxFreeAccounts] = useState("1000");
  const [claimedCount, setClaimedCount] = useState("0");

  async function load() {
    try {
      const res = await fetch("/api/admin/campaign", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as CampaignResponse;
      if (!res.ok) {
        throw new Error(json.error || "Failed to load campaign.");
      }
      setData(json);
      setMaxFreeAccounts(String(json.maxFreeAccounts ?? 1000));
      setClaimedCount(String(json.claimedCount ?? 0));
      setError("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
  }, []);

  async function patchCampaign(body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = (await res.json().catch(() => ({}))) as CampaignResponse;
      if (!res.ok) {
        throw new Error(json.error || "Failed to update campaign.");
      }
      setData(json);
      setMaxFreeAccounts(String(json.maxFreeAccounts ?? 1000));
      setClaimedCount(String(json.claimedCount ?? 0));
      setNotice("Campaign updated.");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin" className="text-xs font-medium text-violet-300/80 hover:text-violet-100">
            ← Admin dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white">Launch campaign</h1>
          <p className="mt-1 text-sm text-violet-200/70">
            Track and control the first 1,000 free Pro accounts for public launch.
          </p>
        </div>
        <AdminLogoutButton />
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-violet-200/70">Loading campaign…</p>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-violet-500/30 bg-[#221830]/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-violet-300/70">Remaining</p>
              <p className="mt-2 text-3xl font-semibold text-white">{formatNumber(data?.remaining ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-[#221830]/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-violet-300/70">Claimed / cap</p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {formatNumber(data?.claimedCount ?? 0)} / {formatNumber(data?.maxFreeAccounts ?? 1000)}
              </p>
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-[#221830]/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-violet-300/70">Baseline accounts</p>
              <p className="mt-2 text-3xl font-semibold text-white">{formatNumber(data?.baselineAccountCount ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-[#221830]/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-violet-300/70">New since launch</p>
              <p className="mt-2 text-3xl font-semibold text-white">{formatNumber(data?.newClaimsSinceInit ?? 0)}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-violet-500/30 bg-[#221830]/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Campaign status</p>
                <p className="mt-1 text-sm text-violet-200/70">
                  {data?.promoActive
                    ? "Live on the homepage and get-started funnel."
                    : data?.active
                      ? "Suspended or sold out — site funnels back to normal pricing."
                      : "Paused by admin."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || data?.active === true}
                  onClick={() => void patchCampaign({ active: true })}
                  className="rounded-xl border border-emerald-500/40 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  Resume campaign
                </button>
                <button
                  type="button"
                  disabled={saving || data?.active === false}
                  onClick={() => void patchCampaign({ active: false })}
                  className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/10 disabled:opacity-50"
                >
                  Suspend campaign
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-violet-500/30 bg-[#221830]/70 p-6">
            <h2 className="text-sm font-semibold text-white">Manual controls</h2>
            <p className="mt-1 text-sm text-violet-200/70">
              Adjust the cap or claimed count if you need to steer the launch manually.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-violet-100">
                <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-violet-300/70">Max free accounts</span>
                <input
                  type="number"
                  min={1}
                  value={maxFreeAccounts}
                  onChange={(e) => setMaxFreeAccounts(e.target.value)}
                  className="w-full rounded-xl border border-violet-500/30 bg-[#150c22] px-3 py-2 text-white outline-none"
                />
              </label>
              <label className="block text-sm text-violet-100">
                <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-violet-300/70">Claimed count</span>
                <input
                  type="number"
                  min={0}
                  value={claimedCount}
                  onChange={(e) => setClaimedCount(e.target.value)}
                  className="w-full rounded-xl border border-violet-500/30 bg-[#150c22] px-3 py-2 text-white outline-none"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void patchCampaign({
                  max_free_accounts: Number(maxFreeAccounts),
                  claimed_count: Number(claimedCount)
                })
              }
              className="mt-4 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save campaign settings"}
            </button>
            {data?.initializedAt ? (
              <p className="mt-4 text-xs text-violet-300/60">
                Initialized {new Date(data.initializedAt).toLocaleString()} — existing admin accounts were counted toward
                the cap at first load.
              </p>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}
