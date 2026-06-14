"use client";

import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import {
  detectVendorUsageInstallOs,
  vendorUsageSyncCommand,
  type VendorUsageInstallOs
} from "@/lib/vendorUsageSyncCommand";

const VENDOR_USAGE_PASSWORD = "oat123";
const UNLOCK_KEY = "promptly_vendor_usage_unlocked";

type UsageWindow = {
  utilization: number;
  resets_at: string | null;
  window_seconds: number | null;
};

type VendorProfile = {
  provider: "claude_code" | "codex" | "cursor";
  profile_id: string;
  profile_label: string;
  config_dir: string | null;
  vendor_email: string | null;
  plan_slug: string | null;
  plan_display: string | null;
  primary_window: UsageWindow | null;
  secondary_window: UsageWindow | null;
  sync_error: string | null;
  synced_at_ms: number;
  plan_monthly_usd: number | null;
  primary_dollars_used: number | null;
  secondary_dollars_used: number | null;
  secondary_dollars_unused: number | null;
};

type VendorUsagePayload = {
  ok?: boolean;
  settings: {
    claude_code: { enabled: boolean; extra_profile_dirs: string[] };
    codex: { enabled: boolean; extra_profile_dirs: string[] };
    cursor: { enabled: boolean; extra_profile_dirs: string[] };
  };
  profiles: VendorProfile[];
  overview: {
    profile_count: number;
    total_plan_monthly_usd: number;
    total_secondary_window_dollars_used: number;
    total_secondary_window_dollars_unused: number;
  };
};

function formatResetCountdown(resetsAt: string | null): string {
  if (!resetsAt) return "—";
  const ms = Date.parse(resetsAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "soon";
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 48) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatSyncedAt(ms: number): string {
  if (!ms) return "Never";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ms).toLocaleString();
}

function UsageBar({ label, window, dollarsUsed }: { label: string; window: UsageWindow | null; dollarsUsed: number | null }) {
  if (!window) return null;
  const util = Math.max(0, Math.min(100, window.utilization));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-muted">
          {util}% used
          {dollarsUsed != null ? ` · ~$${dollarsUsed.toFixed(2)} of allowance` : null}
          {" · resets in "}
          {formatResetCountdown(window.resets_at)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-cream-dark">
        <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${util}%` }} />
      </div>
    </div>
  );
}

function ProfileCard({ profile }: { profile: VendorProfile }) {
  const providerLabel =
    profile.provider === "claude_code" ? "Claude Code" : profile.provider === "codex" ? "Codex" : "Cursor";
  const primaryLabel = profile.provider === "cursor" ? "Included API usage" : "5-hour window";
  const secondaryLabel = profile.provider === "cursor" ? "Billing cycle total" : "Weekly window";
  return (
    <div className="rounded-xl border border-line bg-white/70 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">{providerLabel}</p>
          <p className="text-sm font-semibold text-ink">
            {profile.plan_display || "Unknown plan"}
            {profile.plan_monthly_usd != null ? (
              <span className="ml-1 text-xs font-medium text-muted">(${profile.plan_monthly_usd}/mo catalog)</span>
            ) : null}
          </p>
          <p className="text-xs text-muted">
            {profile.profile_label}
            {profile.vendor_email ? ` · ${profile.vendor_email}` : null}
          </p>
        </div>
        <p className="text-[10px] text-faint">Synced {formatSyncedAt(profile.synced_at_ms)}</p>
      </div>
      {profile.sync_error ? (
        <p className="mb-3 rounded-lg border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
          {profile.sync_error}
        </p>
      ) : (
        <div className="space-y-3">
          <UsageBar label={primaryLabel} window={profile.primary_window} dollarsUsed={profile.primary_dollars_used} />
          <UsageBar
            label={secondaryLabel}
            window={profile.secondary_window}
            dollarsUsed={profile.secondary_dollars_used}
          />
          {profile.secondary_dollars_unused != null && profile.secondary_dollars_unused > 0 ? (
            <p className="text-[11px] text-muted">
              ~${profile.secondary_dollars_unused.toFixed(2)} of this week&apos;s included allowance unused so far.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function VendorUsageSection({ user }: { user: User | null }) {
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [data, setData] = useState<VendorUsagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncOs, setSyncOs] = useState<VendorUsageInstallOs>("mac");
  const [showCommand, setShowCommand] = useState(false);
  const [syncCopied, setSyncCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUnlocked(window.sessionStorage.getItem(UNLOCK_KEY) === "1");
    setSyncOs(detectVendorUsageInstallOs());
  }, []);

  const syncCommand = useMemo(() => vendorUsageSyncCommand(syncOs), [syncOs]);

  const load = useCallback(async () => {
    if (!user) {
      setData(null);
      setError("Sign in to load vendor usage.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken(false);
      const res = await fetch("/api/account/vendor-usage", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body as VendorUsagePayload);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (unlocked && user) void load();
  }, [unlocked, user, load]);

  const enableSyncAndPatch = useCallback(async () => {
    if (!user) throw new Error("Sign in to sync subscriptions.");
    const token = await user.getIdToken(false);
    const res = await fetch("/api/account/vendor-usage", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        claude_code: { enabled: true },
        codex: { enabled: true },
        cursor: { enabled: true }
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    setData(body as VendorUsagePayload);
  }, [user]);

  const handleSyncClick = useCallback(async () => {
    setSyncBusy(true);
    setError(null);
    setSyncCopied(false);
    try {
      await enableSyncAndPatch();
      await navigator.clipboard.writeText(syncCommand);
      setShowCommand(true);
      setSyncCopied(true);
      window.setTimeout(() => setSyncCopied(false), 3000);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSyncBusy(false);
    }
  }, [enableSyncAndPatch, syncCommand]);

  const profiles = useMemo(
    () => (data?.profiles ?? []).filter((p) => !p.sync_error),
    [data]
  );
  const lastSyncedMs = profiles.reduce((max, row) => Math.max(max, row.synced_at_ms || 0), 0);
  const hasCursor = profiles.some((p) => p.provider === "cursor");
  const hasCodex = profiles.some((p) => p.provider === "codex");
  const hasClaude = profiles.some((p) => p.provider === "claude_code");

  if (!unlocked) {
    return (
      <section className="mb-8 w-full rounded-2xl border border-line bg-cream p-4 shadow-card sm:p-5">
        <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">AI plan usage</h2>
        <p className="mt-2 text-sm text-muted">Enter the preview password to view Claude Code and Codex subscription quotas.</p>
        <form
          className="mt-4 flex max-w-sm flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordInput === VENDOR_USAGE_PASSWORD) {
              window.sessionStorage.setItem(UNLOCK_KEY, "1");
              setUnlocked(true);
              setPasswordError(null);
            } else {
              setPasswordError("Incorrect password.");
            }
          }}
        >
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Password"
            className="min-w-[10rem] flex-1 rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink"
          />
          <button type="submit" className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-cream hover:bg-neutral-800">
            Unlock
          </button>
        </form>
        {passwordError ? <p className="mt-2 text-xs text-red-700">{passwordError}</p> : null}
      </section>
    );
  }

  return (
    <section className="mb-8 w-full rounded-2xl border border-line bg-cream p-4 shadow-card sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">AI plan usage</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Claude Code, Codex, and Cursor subscription quotas from this computer. Separate from agent emails in your
            activity charts.
          </p>
          {lastSyncedMs > 0 ? (
            <p className="mt-1 text-xs text-faint">Last synced {formatSyncedAt(lastSyncedMs)}</p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream-dark disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={syncBusy || !user}
          onClick={() => void handleSyncClick()}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800 disabled:opacity-50"
        >
          {syncBusy ? "Preparing…" : syncCopied ? "Command copied" : "Sync subscriptions"}
        </button>
        <div className="flex gap-1">
          {(["mac", "windows"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSyncOs(id)}
              className={`rounded-md border px-2 py-1 text-[10px] font-medium ${
                syncOs === id ? "border-ink bg-ink text-cream" : "border-line text-muted hover:text-ink"
              }`}
            >
              {id === "mac" ? "Mac" : "Windows"}
            </button>
          ))}
        </div>
      </div>

      {syncCopied ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900">
          Command copied — paste in {syncOs === "mac" ? "Terminal" : "PowerShell"} on the Mac or PC where Claude Code,
          Codex, or Cursor is logged in, press Enter, then click <span className="font-medium">Refresh</span>.
        </div>
      ) : null}

      {showCommand ? <CopyBlock lines={[syncCommand]} label={syncOs === "mac" ? "Terminal" : "PowerShell"} /> : null}

      {error ? <p className="mb-4 mt-4 text-sm text-red-700">{error}</p> : null}

      {data?.overview && profiles.length > 0 ? (
        <div className="mb-5 mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-white/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Subscriptions</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{data.overview.profile_count}</p>
          </div>
          <div className="rounded-xl border border-line bg-white/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Plan total (catalog)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">${data.overview.total_plan_monthly_usd}/mo</p>
          </div>
          <div className="rounded-xl border border-line bg-white/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Weekly allowance used</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
              ~${data.overview.total_secondary_window_dollars_used.toFixed(0)}
            </p>
          </div>
        </div>
      ) : null}

      {profiles.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {profiles.map((profile) => (
            <ProfileCard key={`${profile.provider}-${profile.profile_id}`} profile={profile} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">
          No subscription data yet. Click <span className="font-medium text-ink">Sync subscriptions</span>, run the
          command on your computer, then Refresh.
        </p>
      )}

      {profiles.length > 0 && (!hasCursor || !hasCodex || !hasClaude) ? (
        <p className="mt-4 text-xs text-muted">
          {!hasClaude
            ? "Claude Code: skipped — no Anthropic subscription login on the syncing computer (only needed if you use Claude Code in Terminal). "
            : null}
          {!hasCursor ? "Cursor: open Cursor and sign in on that Mac, then sync again. " : null}
          {!hasCodex ? "Codex: sign in with ChatGPT (not API key) in the Codex app, then sync again. " : null}
        </p>
      ) : null}
    </section>
  );
}
