"use client";

import Link from "next/link";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

const VENDOR_USAGE_PASSWORD = "oat123";
const UNLOCK_KEY = "promptly_vendor_usage_unlocked";

type UsageWindow = {
  utilization: number;
  resets_at: string | null;
  window_seconds: number | null;
};

type VendorProfile = {
  provider: "claude_code" | "codex";
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

type VendorUsageSettingsPatch = {
  claude_code?: Partial<VendorUsagePayload["settings"]["claude_code"]>;
  codex?: Partial<VendorUsagePayload["settings"]["codex"]>;
};

function ProfileCard({ profile }: { profile: VendorProfile }) {
  const providerLabel = profile.provider === "claude_code" ? "Claude Code" : "Codex";
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
          <UsageBar label="5-hour window" window={profile.primary_window} dollarsUsed={profile.primary_dollars_used} />
          <UsageBar
            label="Weekly window"
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
  const userEmail = user?.email ?? null;
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<VendorUsagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraClaudeDir, setExtraClaudeDir] = useState("");
  const [extraCodexDir, setExtraCodexDir] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUnlocked(window.sessionStorage.getItem(UNLOCK_KEY) === "1");
  }, []);

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

  const updateSettings = useCallback(
    async (patch: VendorUsageSettingsPatch) => {
      if (!user) {
        setError("Sign in to update vendor usage settings.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const token = await user.getIdToken(false);
        const res = await fetch("/api/account/vendor-usage", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(patch)
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        setData(body as VendorUsagePayload);
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        setSaving(false);
      }
    },
    [user]
  );

  const claudeProfiles = useMemo(
    () => (data?.profiles ?? []).filter((p) => p.provider === "claude_code"),
    [data]
  );
  const codexProfiles = useMemo(() => (data?.profiles ?? []).filter((p) => p.provider === "codex"), [data]);

  if (!unlocked) {
    return (
      <section className="mb-8 w-full rounded-2xl border border-line bg-cream p-4 shadow-card sm:p-5">
        <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">AI plan usage</h2>
        <p className="mt-2 text-sm text-muted">Enter the preview password to configure subscription usage sync.</p>
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-[0.22em] text-ink">AI plan usage</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            Real subscription quotas from Claude Code and Codex on the machine that syncs. This is separate from agent
            login emails in your activity charts — each card is one vendor subscription login.
          </p>
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

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}

      {data?.overview ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-white/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Subscriptions synced</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{data.overview.profile_count}</p>
          </div>
          <div className="rounded-xl border border-line bg-white/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Catalog plan total</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">${data.overview.total_plan_monthly_usd}/mo</p>
          </div>
          <div className="rounded-xl border border-line bg-white/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Weekly allowance used</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
              ~${data.overview.total_secondary_window_dollars_used.toFixed(0)}
            </p>
            <p className="text-[10px] text-muted">
              ~${data.overview.total_secondary_window_dollars_unused.toFixed(0)} unused (catalog est.)
            </p>
          </div>
        </div>
      ) : null}

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-violet-200/80 bg-violet-50/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Claude Code sync</h3>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={data?.settings.claude_code.enabled ?? false}
                disabled={saving}
                onChange={(e) => void updateSettings({ claude_code: { enabled: e.target.checked } })}
              />
              Enabled
            </label>
          </div>
          <p className="mb-3 text-[11px] text-muted">
            Discovers multiple profiles (~/.claude, ~/.claude-work, etc.) and syncs each Anthropic subscription.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={extraClaudeDir}
              onChange={(e) => setExtraClaudeDir(e.target.value)}
              placeholder="Extra profile path e.g. ~/.claude-personal"
              className="min-w-[12rem] flex-1 rounded-md border border-line bg-cream px-2 py-1 text-xs text-ink"
            />
            <button
              type="button"
              disabled={saving || !extraClaudeDir.trim()}
              onClick={() => {
                const dirs = [...(data?.settings.claude_code.extra_profile_dirs ?? []), extraClaudeDir.trim()];
                void updateSettings({ claude_code: { extra_profile_dirs: dirs } });
                setExtraClaudeDir("");
              }}
              className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-cream"
            >
              Add path
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-violet-200/80 bg-violet-50/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Codex sync</h3>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={data?.settings.codex.enabled ?? false}
                disabled={saving}
                onChange={(e) => void updateSettings({ codex: { enabled: e.target.checked } })}
              />
              Enabled
            </label>
          </div>
          <p className="mb-3 text-[11px] text-muted">Uses ChatGPT OAuth from ~/.codex/auth.json (not API-key mode).</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={extraCodexDir}
              onChange={(e) => setExtraCodexDir(e.target.value)}
              placeholder="Extra CODEX_HOME path"
              className="min-w-[12rem] flex-1 rounded-md border border-line bg-cream px-2 py-1 text-xs text-ink"
            />
            <button
              type="button"
              disabled={saving || !extraCodexDir.trim()}
              onClick={() => {
                const dirs = [...(data?.settings.codex.extra_profile_dirs ?? []), extraCodexDir.trim()];
                void updateSettings({ codex: { extra_profile_dirs: dirs } });
                setExtraCodexDir("");
              }}
              className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-cream"
            >
              Add path
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-line/70 bg-cream-dark/50 px-3 py-2 text-[11px] text-muted">
        After enabling sync, run{" "}
        <code className="rounded bg-white/80 px-1 py-0.5 text-ink">promptly-telemetry usage-sync --tool claude_code</code>{" "}
        or send a prompt — sync runs automatically every ~15 minutes from hooks on this computer
        {userEmail ? ` (${userEmail})` : ""}.
      </div>

      {!data?.settings.claude_code.enabled && !data?.settings.codex.enabled ? (
        <p className="text-sm text-muted">Turn on Claude Code and/or Codex sync above, then run usage-sync locally.</p>
      ) : null}

      {(claudeProfiles.length || codexProfiles.length) > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...claudeProfiles, ...codexProfiles].map((profile) => (
            <ProfileCard key={`${profile.provider}-${profile.profile_id}`} profile={profile} />
          ))}
        </div>
      ) : data?.settings.claude_code.enabled || data?.settings.codex.enabled ? (
        <p className="text-sm text-muted">
          No snapshots yet. Pair agents on{" "}
          <Link href="/integrations" className="underline hover:text-ink">
            integrations
          </Link>{" "}
          and run <code className="text-ink">promptly-telemetry usage-sync</code>.
        </p>
      ) : null}
    </section>
  );
}
