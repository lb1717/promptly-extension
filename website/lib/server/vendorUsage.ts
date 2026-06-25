import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import {
  claudeUtilizationSeriesUsesRemainingSemantics,
  migrateClaudeUtilizationHistoryToUsed,
  normalizeClaudeStoredUtilizationToUsed,
  dollarsUnusedFromUtilization,
  dollarsUsedFromUtilization,
  normalizeUtilizationPercent,
  parseVendorResetsAtIso,
  resolveVendorPlanPricing
} from "@/lib/vendorPlanPricing";
import { fetchLiveVendorUsageSnapshots } from "@/lib/server/vendorUsageFetch";
import {
  canDecryptVendorTokensWithPrimaryKey,
  decryptVendorTokens,
  encryptVendorTokens,
  hasEncryptedVendorTokens,
  type StoredVendorTokens
} from "@/lib/server/vendorUsageSecrets";

export type VendorUsageProvider = "claude_code" | "codex" | "cursor";

export type VendorUsageWindow = {
  utilization: number;
  resets_at: string | null;
  window_seconds: number | null;
};

export type VendorUsageHistoryPoint = {
  at_ms: number;
  utilization: number;
};

export type VendorUsageWindowHistory = {
  primary: VendorUsageHistoryPoint[];
  secondary: VendorUsageHistoryPoint[];
};

export type VendorUsageProfileSnapshot = {
  provider: VendorUsageProvider;
  profile_id: string;
  profile_label: string;
  config_dir: string | null;
  vendor_email: string | null;
  plan_slug: string | null;
  plan_display: string | null;
  plan_organization_type?: string | null;
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

export type VendorUsageSyncDiagnostics = {
  at_ms: number;
  skipped: VendorUsageProvider[];
  skip_details: Partial<Record<VendorUsageProvider, string>>;
  claude_auth?: {
    token_available: boolean;
    failure: string | null;
    steps: Array<{ step: string; ok: boolean; detail: string }>;
  };
};

export type VendorUsageProfileView = VendorUsageProfileSnapshot & {
  pricing_key: string | null;
  plan_monthly_usd: number | null;
  primary_dollars_used: number | null;
  secondary_dollars_used: number | null;
  secondary_dollars_unused: number | null;
  usage_history: VendorUsageWindowHistory;
};

const USAGE_HISTORY_CAP = 720;
const USAGE_HISTORY_MIN_GAP_MS = 5 * 60 * 1000;

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

/** Stable Firestore profile id for the default Promptly Claude OAuth subscription. */
export const CLAUDE_SUBSCRIPTION_PROFILE_ID = hashVendorProfileId("claude_subscription");

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

function readHistoryPoint(raw: unknown): VendorUsageHistoryPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const at_ms = typeof row.at_ms === "number" && Number.isFinite(row.at_ms) ? row.at_ms : null;
  const utilization =
    typeof row.utilization === "number" && Number.isFinite(row.utilization) ? row.utilization : null;
  if (at_ms == null || utilization == null) return null;
  return { at_ms, utilization: normalizeUtilizationPercent(utilization) };
}

function readUsageHistory(raw: unknown): VendorUsageWindowHistory {
  if (!raw || typeof raw !== "object") {
    return { primary: [], secondary: [] };
  }
  const row = raw as Record<string, unknown>;
  const readSeries = (value: unknown): VendorUsageHistoryPoint[] => {
    if (!Array.isArray(value)) return [];
    return value.map(readHistoryPoint).filter((point): point is VendorUsageHistoryPoint => point !== null);
  };
  return {
    primary: readSeries(row.primary).slice(-USAGE_HISTORY_CAP),
    secondary: readSeries(row.secondary).slice(-USAGE_HISTORY_CAP)
  };
}

function claudeSeriesUsesRemainingSemantics(
  historySeries: VendorUsageHistoryPoint[],
  window: VendorUsageWindow | null
): boolean {
  if (historySeries.length > 0) {
    return claudeUtilizationSeriesUsesRemainingSemantics(historySeries);
  }
  if (!window) return true;
  // Window-only snapshots from live sync are already percent-used.
  return false;
}

function migrateClaudeProfileUtilization(
  primary: VendorUsageWindow | null,
  secondary: VendorUsageWindow | null,
  history: VendorUsageWindowHistory,
  opts: { legacyWindowRepair?: boolean } = {}
): { primary: VendorUsageWindow | null; secondary: VendorUsageWindow | null; history: VendorUsageWindowHistory } {
  const primarySemantics = claudeSeriesUsesRemainingSemantics(history.primary, primary);
  const secondarySemantics = claudeSeriesUsesRemainingSemantics(history.secondary, secondary);
  const migratedHistory = {
    primary: migrateClaudeUtilizationHistoryToUsed(history.primary, primary?.window_seconds),
    secondary: migrateClaudeUtilizationHistoryToUsed(history.secondary, secondary?.window_seconds)
  };

  const windowUtilization = (
    window: VendorUsageWindow | null,
    migratedSeries: VendorUsageHistoryPoint[],
    usesRemainingSemantics: boolean
  ): VendorUsageWindow | null => {
    if (!window) return null;
    if (migratedSeries.length > 0) {
      return {
        ...window,
        utilization: migratedSeries[migratedSeries.length - 1]!.utilization
      };
    }
    if (opts.legacyWindowRepair && normalizeUtilizationPercent(window.utilization) >= 45) {
      return {
        ...window,
        utilization: normalizeClaudeStoredUtilizationToUsed(window.utilization, true)
      };
    }
    return {
      ...window,
      utilization: normalizeClaudeStoredUtilizationToUsed(window.utilization, usesRemainingSemantics)
    };
  };

  return {
    primary: windowUtilization(primary, migratedHistory.primary, primarySemantics),
    secondary: windowUtilization(secondary, migratedHistory.secondary, secondarySemantics),
    history: migratedHistory
  };
}

function usageHistoryChanged(
  before: VendorUsageWindowHistory,
  after: VendorUsageWindowHistory
): boolean {
  const sameSeries = (left: VendorUsageHistoryPoint[], right: VendorUsageHistoryPoint[]) =>
    left.length === right.length &&
    left.every(
      (point, index) =>
        point.at_ms === right[index]?.at_ms &&
        Math.abs(point.utilization - (right[index]?.utilization ?? NaN)) < 0.5
    );
  return !sameSeries(before.primary, after.primary) || !sameSeries(before.secondary, after.secondary);
}

function windowsChanged(
  beforePrimary: VendorUsageWindow | null,
  beforeSecondary: VendorUsageWindow | null,
  afterPrimary: VendorUsageWindow | null,
  afterSecondary: VendorUsageWindow | null
): boolean {
  const windowChanged = (before: VendorUsageWindow | null, after: VendorUsageWindow | null) => {
    if (!before && !after) return false;
    if (!before || !after) return true;
    return Math.abs(before.utilization - after.utilization) >= 0.5;
  };
  return windowChanged(beforePrimary, afterPrimary) || windowChanged(beforeSecondary, afterSecondary);
}

async function persistClaudeUtilizationRepair(
  uid: string,
  docId: string,
  primary: VendorUsageWindow | null,
  secondary: VendorUsageWindow | null,
  history: VendorUsageWindowHistory
): Promise<void> {
  await profileRef(uid, docId).set(
    {
      primary_window: primary,
      secondary_window: secondary,
      usage_history: history,
      usage_history_corrected_v3: true,
      usage_history_corrected_v4: true,
      usage_history_corrected_v2: true,
      updated_at: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

function appendHistoryPoint(
  series: VendorUsageHistoryPoint[],
  utilization: number,
  at_ms: number
): VendorUsageHistoryPoint[] {
  const util = normalizeUtilizationPercent(utilization);
  const next = [...series];
  const last = next[next.length - 1];
  if (last && at_ms - last.at_ms < USAGE_HISTORY_MIN_GAP_MS && Math.abs(last.utilization - util) < 0.5) {
    next[next.length - 1] = { at_ms, utilization: util };
  } else {
    next.push({ at_ms, utilization: util });
  }
  return next.slice(-USAGE_HISTORY_CAP);
}

function mergeUsageHistory(
  existing: VendorUsageWindowHistory,
  snapshot: VendorUsageProfileSnapshot
): VendorUsageWindowHistory {
  const at_ms = snapshot.synced_at_ms || Date.now();
  return {
    primary: snapshot.primary_window
      ? appendHistoryPoint(existing.primary, snapshot.primary_window.utilization, at_ms)
      : existing.primary,
    secondary: snapshot.secondary_window
      ? appendHistoryPoint(existing.secondary, snapshot.secondary_window.utilization, at_ms)
      : existing.secondary
  };
}

function readWindow(raw: unknown): VendorUsageWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const utilization = typeof row.utilization === "number" && Number.isFinite(row.utilization) ? row.utilization : null;
  if (utilization === null) return null;
  return {
    utilization: normalizeUtilizationPercent(utilization),
    resets_at: parseVendorResetsAtIso(row.resets_at) ?? (typeof row.resets_at === "string" ? row.resets_at : null),
    window_seconds:
      typeof row.window_seconds === "number" && Number.isFinite(row.window_seconds) ? row.window_seconds : null
  };
}

function enrichProfile(
  row: VendorUsageProfileSnapshot,
  usage_history: VendorUsageWindowHistory = { primary: [], secondary: [] }
): VendorUsageProfileView {
  const vendor =
    row.provider === "claude_code" ? "anthropic" : row.provider === "codex" ? "openai" : "cursor";
  const orgType = row.plan_organization_type?.replace(/^claude_/, "") ?? null;
  const pricing = resolveVendorPlanPricing(
    vendor,
    row.plan_slug || orgType || row.plan_organization_type,
    row.plan_display
  );
  const monthly = pricing?.monthlyUsd ?? null;
  const planDisplay = row.plan_display || pricing?.displayName || null;
  const primaryWindow = row.primary_window;
  const secondaryWindow = row.secondary_window;
  const normalizedHistory = usage_history;
  return {
    ...row,
    primary_window: primaryWindow,
    secondary_window: secondaryWindow,
    plan_display: planDisplay,
    pricing_key: pricing?.key ?? null,
    plan_monthly_usd: monthly,
    primary_dollars_used:
      monthly != null && primaryWindow
        ? dollarsUsedFromUtilization(monthly, primaryWindow.utilization, primaryWindow.window_seconds)
        : null,
    secondary_dollars_used:
      monthly != null && secondaryWindow
        ? dollarsUsedFromUtilization(monthly, secondaryWindow.utilization, secondaryWindow.window_seconds)
        : null,
    secondary_dollars_unused:
      monthly != null && secondaryWindow
        ? dollarsUnusedFromUtilization(monthly, secondaryWindow.utilization, secondaryWindow.window_seconds)
        : null,
    usage_history: normalizedHistory
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

const MULTI_PROFILE_PROVIDERS = new Set<VendorUsageProvider>(["claude_code", "codex"]);

async function pruneUnlistedProfiles(
  uid: string,
  provider: VendorUsageProvider,
  keepDocIds: Set<string>
): Promise<void> {
  if (!MULTI_PROFILE_PROVIDERS.has(provider) || keepDocIds.size === 0) return;
  const prefix = `${provider}_`;
  const snap = await getFirebaseAdminDb().collection("users").doc(uid).collection("vendor_usage_profiles").get();
  const batch = getFirebaseAdminDb().batch();
  let pending = 0;
  for (const doc of snap.docs) {
    if (doc.id.startsWith(prefix) && !keepDocIds.has(doc.id)) {
      batch.delete(doc.ref);
      pending += 1;
    }
  }
  if (pending > 0) await batch.commit();
}

function profileViewScore(row: VendorUsageProfileView): number {
  return (
    (row.primary_window ? 4 : 0) +
    (row.secondary_window ? 2 : 0) +
    (row.synced_at_ms || 0) / 1e15
  );
}

function dedupeProfilesById(views: VendorUsageProfileView[]): VendorUsageProfileView[] {
  const best = new Map<string, VendorUsageProfileView>();
  for (const row of views) {
    const key = `${row.provider}:${row.profile_id}`;
    const prev = best.get(key);
    if (!prev || profileViewScore(row) > profileViewScore(prev)) {
      best.set(key, row);
    }
  }
  return [...best.values()];
}

function pickExistingProfileForLiveRefresh(
  existing: VendorUsageProfileView[],
  provider: VendorUsageProvider
): VendorUsageProfileView | undefined {
  const rows = existing.filter((row) => row.provider === provider);
  if (!rows.length) return undefined;
  if (provider === "claude_code") {
    return rows.find((row) => row.profile_id === CLAUDE_SUBSCRIPTION_PROFILE_ID) || rows[0];
  }
  if (provider === "codex") {
    return rows.find((row) => row.profile_label === "Default" || row.config_dir?.endsWith("/.codex")) || rows[0];
  }
  return rows[0];
}

function existingProfileIdsForLiveRefresh(
  existing: VendorUsageProfileView[]
): Partial<Record<VendorUsageProvider, string>> {
  const out: Partial<Record<VendorUsageProvider, string>> = {};
  for (const provider of ["claude_code", "codex", "cursor"] as const) {
    const row = pickExistingProfileForLiveRefresh(existing, provider);
    if (row) out[provider] = row.profile_id;
  }
  if (!out.claude_code) out.claude_code = CLAUDE_SUBSCRIPTION_PROFILE_ID;
  return out;
}

function existingProfilesForLiveRefresh(
  existing: VendorUsageProfileView[]
): Partial<Record<VendorUsageProvider, VendorUsageProfileSnapshot>> {
  const out: Partial<Record<VendorUsageProvider, VendorUsageProfileSnapshot>> = {};
  for (const provider of ["claude_code", "codex", "cursor"] as const) {
    const row = pickExistingProfileForLiveRefresh(existing, provider);
    if (row) out[provider] = row;
  }
  return out;
}

export async function persistVendorUsageSnapshots(
  uid: string,
  snapshots: VendorUsageProfileSnapshot[],
  clearProviders: VendorUsageProvider[] = [],
  syncDiagnostics: VendorUsageSyncDiagnostics | null = null,
  opts?: { prune_unlisted_profiles?: boolean }
): Promise<number> {
  await clearVendorUsageProfiles(uid, clearProviders);
  if (syncDiagnostics) {
    await settingsRef(uid).set(
      {
        last_sync_diagnostics: syncDiagnostics,
        last_sync_diagnostics_at: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }
  if (!snapshots.length) return 0;
  let written = 0;
  const keptDocIdsByProvider = new Map<VendorUsageProvider, Set<string>>();
  for (const provider of MULTI_PROFILE_PROVIDERS) {
    keptDocIdsByProvider.set(provider, new Set());
  }
  for (const incoming of snapshots.slice(0, 24)) {
    let snap = incoming;
    if (snap.provider !== "claude_code" && snap.provider !== "codex" && snap.provider !== "cursor") continue;
    if (!snap.profile_id || snap.sync_error) continue;
    const docId = vendorUsageProfileDocId(snap.provider, snap.profile_id);
    const existingSnap = await profileRef(uid, docId).get();
    const existingData = existingSnap.exists ? existingSnap.data() : null;
    const existingHistory = readUsageHistory(existingData?.usage_history);
    let usage_history = mergeUsageHistory(existingHistory, snap);
    if (snap.provider === "claude_code") {
      const migrated = migrateClaudeProfileUtilization(
        snap.primary_window,
        snap.secondary_window,
        usage_history,
        { legacyWindowRepair: existingData?.usage_history_corrected_v4 !== true }
      );
      usage_history = migrated.history;
      snap = {
        ...snap,
        primary_window: migrated.primary,
        secondary_window: migrated.secondary
      };
    }
    await profileRef(uid, docId).set(
      {
        ...snap,
        sync_error: null,
        usage_history,
        usage_history_corrected_v3:
          snap.provider === "claude_code" ? true : existingData?.usage_history_corrected_v3 === true,
        usage_history_corrected_v4:
          snap.provider === "claude_code" ? true : existingData?.usage_history_corrected_v4 === true,
        usage_history_corrected_v2:
          snap.provider === "claude_code" ? true : existingData?.usage_history_corrected_v2 === true,
        uid,
        updated_at: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    written += 1;
    keptDocIdsByProvider.get(snap.provider)?.add(docId);
  }
  if (opts?.prune_unlisted_profiles) {
    for (const provider of MULTI_PROFILE_PROVIDERS) {
      const keepIds = keptDocIdsByProvider.get(provider);
      if (keepIds?.size) {
        await pruneUnlistedProfiles(uid, provider, keepIds);
      }
    }
  }
  return written;
}

export async function listVendorUsageProfiles(uid: string): Promise<VendorUsageProfileView[]> {
  const snap = await getFirebaseAdminDb().collection("users").doc(uid).collection("vendor_usage_profiles").get();
  const views: VendorUsageProfileView[] = [];
  for (const doc of snap.docs) {
    const raw = doc.data() as Record<string, unknown>;
    const provider = raw.provider;
    if (provider !== "claude_code" && provider !== "codex" && provider !== "cursor") continue;
    if (!raw.profile_id) continue;
    const primary_window = readWindow(raw.primary_window);
    const secondary_window = readWindow(raw.secondary_window);
    const sync_error = typeof raw.sync_error === "string" ? raw.sync_error : null;
    if (sync_error && !primary_window && !secondary_window) continue;
    const synced_at_ms = typeof raw.synced_at_ms === "number" ? raw.synced_at_ms : 0;
    let usage_history = readUsageHistory(raw.usage_history);
    let normalizedPrimary = primary_window;
    let normalizedSecondary = secondary_window;
    if (provider === "claude_code") {
      const migrated = migrateClaudeProfileUtilization(primary_window, secondary_window, usage_history, {
        legacyWindowRepair: raw.usage_history_corrected_v4 !== true
      });
      normalizedPrimary = migrated.primary;
      normalizedSecondary = migrated.secondary;
      usage_history = migrated.history;

      const needsPersist =
        raw.usage_history_corrected_v4 !== true ||
        usageHistoryChanged(readUsageHistory(raw.usage_history), usage_history) ||
        windowsChanged(primary_window, secondary_window, normalizedPrimary, normalizedSecondary);
      if (needsPersist) {
        await persistClaudeUtilizationRepair(uid, doc.id, normalizedPrimary, normalizedSecondary, usage_history);
      }
    }
    views.push(
      enrichProfile(
        {
          provider,
          profile_id: String(raw.profile_id || ""),
          profile_label: String(raw.profile_label || "Profile"),
          config_dir: typeof raw.config_dir === "string" ? raw.config_dir : null,
          vendor_email: typeof raw.vendor_email === "string" ? raw.vendor_email : null,
          plan_slug: typeof raw.plan_slug === "string" ? raw.plan_slug : null,
          plan_display: typeof raw.plan_display === "string" ? raw.plan_display : null,
          plan_organization_type:
            typeof raw.plan_organization_type === "string" ? raw.plan_organization_type : null,
          primary_window: normalizedPrimary,
          secondary_window: normalizedSecondary,
          sync_error: normalizedPrimary || normalizedSecondary ? null : sync_error,
          synced_at_ms
        },
        usage_history
      )
    );
  }
  return dedupeProfilesById(views).sort(
    (a, b) =>
      PROVIDER_SORT.indexOf(a.provider) - PROVIDER_SORT.indexOf(b.provider) ||
      (a.vendor_email || a.profile_label || a.profile_id).localeCompare(
        b.vendor_email || b.profile_label || b.profile_id
      ) ||
      b.synced_at_ms - a.synced_at_ms
  );
}

const PROVIDER_SORT: VendorUsageProvider[] = ["claude_code", "codex", "cursor"];

export async function getVendorUsagePayload(uid: string, viewerEmail: string | null = null) {
  const [settingsSnap, profiles] = await Promise.all([
    settingsRef(uid).get(),
    listVendorUsageProfiles(uid)
  ]);
  const settings = normalizeSettings(settingsSnap.exists ? settingsSnap.data() : null);
  const tokenStatus = await getVendorUsageTokenStatus(uid);
  const storedTokens = tokenStatus.can_decrypt ? await getVendorUsageTokens(uid) : null;
  const rawDiagnostics = settingsSnap.exists ? settingsSnap.data()?.last_sync_diagnostics : null;
  const lastSyncDiagnostics =
    rawDiagnostics &&
    typeof rawDiagnostics === "object" &&
    typeof (rawDiagnostics as { at_ms?: unknown }).at_ms === "number"
      ? (rawDiagnostics as VendorUsageSyncDiagnostics)
      : null;
  const claudeProfiles = profiles.filter((p) => p.provider === "claude_code");
  const codexProfiles = profiles.filter((p) => p.provider === "codex");
  const cursorProfiles = profiles.filter((p) => p.provider === "cursor");
  const totalMonthlyUsd = profiles.reduce((sum, p) => sum + (p.plan_monthly_usd ?? 0), 0);
  const totalSecondaryUsed = profiles.reduce((sum, p) => sum + (p.secondary_dollars_used ?? 0), 0);
  const totalSecondaryUnused = profiles.reduce((sum, p) => sum + (p.secondary_dollars_unused ?? 0), 0);
  const normalizedViewerEmail = (viewerEmail || "").trim().toLowerCase();
  const tokenDeviceEmail = (tokenStatus.device_email || "").trim().toLowerCase();
  const account_email_mismatch =
    Boolean(normalizedViewerEmail && tokenDeviceEmail) && normalizedViewerEmail !== tokenDeviceEmail;
  return {
    settings,
    profiles,
    can_live_refresh: tokenStatus.can_decrypt,
    has_claude_tokens: Boolean(storedTokens?.claude_code?.access_token),
    vendor_tokens_updated_at_ms: tokenStatus.updated_at_ms || null,
    vendor_tokens_device_email: tokenStatus.device_email,
    account_email_mismatch,
    live_refresh_hint: !tokenStatus.can_decrypt
      ? tokenStatus.has_blob
        ? "Live refresh tokens could not be read. Re-run the sync command from Terminal."
        : profiles.length > 0
          ? "Re-run the sync command once with plugin v1.5.4+ to enable live Refresh."
          : "Run the sync command from Terminal to connect subscriptions."
      : account_email_mismatch
        ? `Terminal sync used ${tokenStatus.device_email}. Sign in here with that same email, or run fix-account to merge accounts.`
        : null,
    last_sync_diagnostics: lastSyncDiagnostics,
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

function sanitizeStoredVendorTokens(raw: unknown): StoredVendorTokens | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const out: StoredVendorTokens = {};
  const claude = row.claude_code;
  if (claude && typeof claude === "object") {
    const c = claude as Record<string, unknown>;
    const access = typeof c.access_token === "string" ? c.access_token.trim() : "";
    if (access.length > 20) {
      out.claude_code = {
        access_token: access,
        refresh_token: typeof c.refresh_token === "string" ? c.refresh_token : null
      };
    }
  }
  const codex = row.codex;
  if (codex && typeof codex === "object") {
    const c = codex as Record<string, unknown>;
    const access = typeof c.access_token === "string" ? c.access_token.trim() : "";
    if (access.length > 20) {
      out.codex = {
        access_token: access,
        account_id: typeof c.account_id === "string" ? c.account_id : null
      };
    }
  }
  const cursor = row.cursor;
  if (cursor && typeof cursor === "object") {
    const c = cursor as Record<string, unknown>;
    const access = typeof c.access_token === "string" ? c.access_token.trim() : "";
    if (access.length > 20) {
      out.cursor = {
        access_token: access,
        plan_slug: typeof c.plan_slug === "string" ? c.plan_slug : null,
        email: typeof c.email === "string" ? c.email : null
      };
    }
  }
  return Object.keys(out).length ? out : null;
}

export async function storeVendorUsageTokens(
  uid: string,
  rawTokens: unknown,
  meta: { device_email?: string | null } = {}
): Promise<boolean> {
  const tokens = sanitizeStoredVendorTokens(rawTokens);
  if (!tokens) return false;
  const current = await getVendorUsageSettings(uid);
  await settingsRef(uid).set(
    {
      encrypted_vendor_tokens: encryptVendorTokens(tokens),
      vendor_tokens_updated_at: FieldValue.serverTimestamp(),
      vendor_tokens_device_email:
        typeof meta.device_email === "string" && meta.device_email.includes("@")
          ? meta.device_email.trim().slice(0, 320)
          : null,
      claude_code: { ...current.claude_code, enabled: true },
      codex: { ...current.codex, enabled: true },
      cursor: { ...current.cursor, enabled: true }
    },
    { merge: true }
  );
  return true;
}

export async function getVendorUsageTokenStatus(uid: string): Promise<{
  has_blob: boolean;
  can_decrypt: boolean;
  updated_at_ms: number;
  device_email: string | null;
}> {
  const snap = await settingsRef(uid).get();
  const data = snap.exists ? snap.data() : null;
  const blob = typeof data?.encrypted_vendor_tokens === "string" ? data.encrypted_vendor_tokens : null;
  const updatedRaw = data?.vendor_tokens_updated_at;
  const updated_at_ms =
    updatedRaw && typeof updatedRaw === "object" && "toMillis" in updatedRaw
      ? Number((updatedRaw as { toMillis: () => number }).toMillis())
      : typeof updatedRaw === "number"
        ? updatedRaw
        : 0;
  return {
    has_blob: hasEncryptedVendorTokens(blob),
    can_decrypt: Boolean(decryptVendorTokens(blob)),
    updated_at_ms,
    device_email: typeof data?.vendor_tokens_device_email === "string" ? data.vendor_tokens_device_email : null
  };
}

export async function getVendorUsageTokens(uid: string): Promise<StoredVendorTokens | null> {
  const snap = await settingsRef(uid).get();
  if (!snap.exists) return null;
  const data = snap.data();
  const blob = data?.encrypted_vendor_tokens;
  if (typeof blob !== "string") return null;
  const tokens = decryptVendorTokens(blob);
  if (!tokens) return null;
  if (!canDecryptVendorTokensWithPrimaryKey(blob)) {
    await storeVendorUsageTokens(uid, tokens, {
      device_email: typeof data?.vendor_tokens_device_email === "string" ? data.vendor_tokens_device_email : null
    });
  }
  return tokens;
}

function snapshotSucceeded(row: VendorUsageProfileSnapshot | null | undefined): row is VendorUsageProfileSnapshot {
  return Boolean(row && !row.sync_error);
}

/** Fill missing provider snapshots from encrypted tokens (same path as live Refresh). */
export async function mergeSnapshotsFromStoredTokens(
  uid: string,
  snapshots: VendorUsageProfileSnapshot[],
  tokens: StoredVendorTokens | null
): Promise<VendorUsageProfileSnapshot[]> {
  if (!tokens) return snapshots;
  const succeededIds = new Set(
    snapshots.filter((row) => snapshotSucceeded(row)).map((row) => `${row.provider}:${row.profile_id}`)
  );
  const missing: VendorUsageProvider[] = [];
  if (tokens.claude_code?.access_token && !snapshots.some((row) => snapshotSucceeded(row) && row.provider === "claude_code" && row.profile_id === CLAUDE_SUBSCRIPTION_PROFILE_ID)) {
    missing.push("claude_code");
  }
  if (tokens.codex?.access_token && !snapshots.some((row) => snapshotSucceeded(row) && row.provider === "codex")) {
    missing.push("codex");
  }
  if (tokens.cursor?.access_token && !snapshots.some((row) => snapshotSucceeded(row) && row.provider === "cursor")) {
    missing.push("cursor");
  }
  if (!missing.length) return snapshots;

  const existing = await listVendorUsageProfiles(uid);
  const existingIds = existingProfileIdsForLiveRefresh(existing);
  const existingProfiles = existingProfilesForLiveRefresh(existing);

  const live = await fetchLiveVendorUsageSnapshots(tokens, existingIds, existingProfiles);
  const out = [...snapshots];
  for (const row of live) {
    const key = `${row.provider}:${row.profile_id}`;
    if (snapshotSucceeded(row) && !succeededIds.has(key)) {
      out.push(row);
      succeededIds.add(key);
    }
  }
  return out;
}

export async function refreshVendorUsageLive(uid: string): Promise<{ refreshed: number; error?: string }> {
  const tokenStatus = await getVendorUsageTokenStatus(uid);
  if (!tokenStatus.has_blob) {
    return { refreshed: 0, error: "no_tokens" };
  }
  const tokens = await getVendorUsageTokens(uid);
  if (!tokens) {
    return { refreshed: 0, error: tokenStatus.has_blob ? "tokens_unreadable" : "no_tokens" };
  }
  const existing = await listVendorUsageProfiles(uid);
  const existingIds = existingProfileIdsForLiveRefresh(existing);
  const existingProfiles = existingProfilesForLiveRefresh(existing);
  const snapshots = await fetchLiveVendorUsageSnapshots(tokens, existingIds, existingProfiles);
  if (!snapshots.length) {
    return { refreshed: 0, error: "fetch_failed" };
  }
  await persistVendorUsageSnapshots(uid, snapshots, [], {
    at_ms: Date.now(),
    skipped: [],
    skip_details: {}
  });
  return { refreshed: snapshots.length };
}
