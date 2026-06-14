import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import {
  dollarsUnusedFromUtilization,
  dollarsUsedFromUtilization,
  resolveVendorPlanPricing
} from "@/lib/vendorPlanPricing";

export type VendorUsageProvider = "claude_code" | "codex" | "cursor";

export type VendorUsageWindow = {
  utilization: number;
  resets_at: string | null;
  window_seconds: number | null;
};

export type VendorUsageProfileSnapshot = {
  provider: VendorUsageProvider;
  profile_id: string;
  profile_label: string;
  config_dir: string | null;
  vendor_email: string | null;
  plan_slug: string | null;
  plan_display: string | null;
  primary_window: VendorUsageWindow | null;
  secondary_window: VendorUsageWindow | null;
  sync_error: string | null;
  synced_at_ms: number;
};

export type VendorUsageProviderSettings = {
  enabled: boolean;
  extra_profile_dirs: string[];
};

export type VendorUsageSettings = {
  claude_code: VendorUsageProviderSettings;
  codex: VendorUsageProviderSettings;
  cursor: VendorUsageProviderSettings;
};

export type VendorUsageProfileView = VendorUsageProfileSnapshot & {
  pricing_key: string | null;
  plan_monthly_usd: number | null;
  primary_dollars_used: number | null;
  secondary_dollars_used: number | null;
  secondary_dollars_unused: number | null;
};

const DEFAULT_SETTINGS: VendorUsageSettings = {
  claude_code: { enabled: false, extra_profile_dirs: [] },
  codex: { enabled: false, extra_profile_dirs: [] },
  cursor: { enabled: false, extra_profile_dirs: [] }
};

function settingsRef(uid: string) {
  return getFirebaseAdminDb().collection("users").doc(uid).collection("settings").doc("vendor_usage");
}

function profileRef(uid: string, docId: string) {
  return getFirebaseAdminDb().collection("users").doc(uid).collection("vendor_usage_profiles").doc(docId);
}

export function vendorUsageProfileDocId(provider: VendorUsageProvider, profileId: string): string {
  return `${provider}_${profileId}`;
}

export function hashVendorProfileId(configDir: string): string {
  return createHash("sha256").update(configDir).digest("hex").slice(0, 16);
}

function normalizeSettings(raw: unknown): VendorUsageSettings {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const readProvider = (key: VendorUsageProvider): VendorUsageProviderSettings => {
    const row = obj[key];
    if (!row || typeof row !== "object") return { ...DEFAULT_SETTINGS[key] };
    const r = row as Record<string, unknown>;
    const extra = Array.isArray(r.extra_profile_dirs)
      ? r.extra_profile_dirs.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    return {
      enabled: r.enabled === true,
      extra_profile_dirs: extra.slice(0, 12)
    };
  };
  return {
    claude_code: readProvider("claude_code"),
    codex: readProvider("codex"),
    cursor: readProvider("cursor")
  };
}

function readWindow(raw: unknown): VendorUsageWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const utilization = typeof row.utilization === "number" && Number.isFinite(row.utilization) ? row.utilization : null;
  if (utilization === null) return null;
  return {
    utilization: Math.max(0, Math.min(100, utilization)),
    resets_at: typeof row.resets_at === "string" ? row.resets_at : null,
    window_seconds:
      typeof row.window_seconds === "number" && Number.isFinite(row.window_seconds) ? row.window_seconds : null
  };
}

function enrichProfile(row: VendorUsageProfileSnapshot): VendorUsageProfileView {
  const vendor =
    row.provider === "claude_code" ? "anthropic" : row.provider === "codex" ? "openai" : "cursor";
  const pricing = resolveVendorPlanPricing(vendor, row.plan_slug, row.plan_display);
  const monthly = pricing?.monthlyUsd ?? null;
  return {
    ...row,
    pricing_key: pricing?.key ?? null,
    plan_monthly_usd: monthly,
    primary_dollars_used:
      monthly != null && row.primary_window
        ? dollarsUsedFromUtilization(monthly, row.primary_window.utilization, row.primary_window.window_seconds)
        : null,
    secondary_dollars_used:
      monthly != null && row.secondary_window
        ? dollarsUsedFromUtilization(monthly, row.secondary_window.utilization, row.secondary_window.window_seconds)
        : null,
    secondary_dollars_unused:
      monthly != null && row.secondary_window
        ? dollarsUnusedFromUtilization(monthly, row.secondary_window.utilization, row.secondary_window.window_seconds)
        : null
  };
}

export async function getVendorUsageSettings(uid: string): Promise<VendorUsageSettings> {
  const snap = await settingsRef(uid).get();
  if (!snap.exists) return DEFAULT_SETTINGS;
  return normalizeSettings(snap.data());
}

export async function updateVendorUsageSettings(
  uid: string,
  patch: Partial<VendorUsageSettings>
): Promise<VendorUsageSettings> {
  const current = await getVendorUsageSettings(uid);
  const next: VendorUsageSettings = {
    claude_code: { ...current.claude_code, ...(patch.claude_code ?? {}) },
    codex: { ...current.codex, ...(patch.codex ?? {}) },
    cursor: { ...current.cursor, ...(patch.cursor ?? {}) }
  };
  await settingsRef(uid).set(
    {
      ...next,
      updated_at: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  return next;
}

export async function clearVendorUsageProfiles(uid: string, providers: VendorUsageProvider[]): Promise<number> {
  if (!providers.length) return 0;
  const allowed = new Set(providers);
  const snap = await getFirebaseAdminDb().collection("users").doc(uid).collection("vendor_usage_profiles").get();
  const batch = getFirebaseAdminDb().batch();
  let deleted = 0;
  for (const doc of snap.docs) {
    const provider = doc.data().provider;
    if (provider === "claude_code" || provider === "codex" || provider === "cursor") {
      if (allowed.has(provider)) {
        batch.delete(doc.ref);
        deleted += 1;
      }
    }
  }
  if (deleted > 0) await batch.commit();
  return deleted;
}

export async function persistVendorUsageSnapshots(
  uid: string,
  snapshots: VendorUsageProfileSnapshot[],
  clearProviders: VendorUsageProvider[] = []
): Promise<number> {
  await clearVendorUsageProfiles(uid, clearProviders);
  if (!snapshots.length) return 0;
  const db = getFirebaseAdminDb();
  const batch = db.batch();
  let written = 0;
  for (const snap of snapshots.slice(0, 24)) {
    if (snap.provider !== "claude_code" && snap.provider !== "codex" && snap.provider !== "cursor") continue;
    if (!snap.profile_id || snap.sync_error) continue;
    const docId = vendorUsageProfileDocId(snap.provider, snap.profile_id);
    batch.set(
      profileRef(uid, docId),
      {
        ...snap,
        uid,
        updated_at: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    written += 1;
  }
  if (written > 0) {
    await batch.commit();
  }
  return written;
}

export async function listVendorUsageProfiles(uid: string): Promise<VendorUsageProfileView[]> {
  const snap = await getFirebaseAdminDb().collection("users").doc(uid).collection("vendor_usage_profiles").get();
  const rows: VendorUsageProfileSnapshot[] = [];
  for (const doc of snap.docs) {
    const raw = doc.data() as Record<string, unknown>;
    const provider = raw.provider;
    if (provider !== "claude_code" && provider !== "codex" && provider !== "cursor") continue;
    rows.push({
      provider,
      profile_id: String(raw.profile_id || ""),
      profile_label: String(raw.profile_label || "Profile"),
      config_dir: typeof raw.config_dir === "string" ? raw.config_dir : null,
      vendor_email: typeof raw.vendor_email === "string" ? raw.vendor_email : null,
      plan_slug: typeof raw.plan_slug === "string" ? raw.plan_slug : null,
      plan_display: typeof raw.plan_display === "string" ? raw.plan_display : null,
      primary_window: readWindow(raw.primary_window),
      secondary_window: readWindow(raw.secondary_window),
      sync_error: typeof raw.sync_error === "string" ? raw.sync_error : null,
      synced_at_ms: typeof raw.synced_at_ms === "number" ? raw.synced_at_ms : 0
    });
  }
  return rows
    .filter((row) => row.profile_id && !row.sync_error)
    .sort((a, b) => b.synced_at_ms - a.synced_at_ms || a.profile_label.localeCompare(b.profile_label))
    .map(enrichProfile);
}

export async function getVendorUsagePayload(uid: string) {
  const [settings, profiles] = await Promise.all([getVendorUsageSettings(uid), listVendorUsageProfiles(uid)]);
  const claudeProfiles = profiles.filter((p) => p.provider === "claude_code");
  const codexProfiles = profiles.filter((p) => p.provider === "codex");
  const cursorProfiles = profiles.filter((p) => p.provider === "cursor");
  const totalMonthlyUsd = profiles.reduce((sum, p) => sum + (p.plan_monthly_usd ?? 0), 0);
  const totalSecondaryUsed = profiles.reduce((sum, p) => sum + (p.secondary_dollars_used ?? 0), 0);
  const totalSecondaryUnused = profiles.reduce((sum, p) => sum + (p.secondary_dollars_unused ?? 0), 0);
  return {
    settings,
    profiles,
    claude_profiles: claudeProfiles,
    codex_profiles: codexProfiles,
    cursor_profiles: cursorProfiles,
    overview: {
      profile_count: profiles.length,
      total_plan_monthly_usd: totalMonthlyUsd,
      total_secondary_window_dollars_used: Math.round(totalSecondaryUsed * 100) / 100,
      total_secondary_window_dollars_unused: Math.round(totalSecondaryUnused * 100) / 100
    }
  };
}
