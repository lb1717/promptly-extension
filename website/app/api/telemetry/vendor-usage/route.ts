import { NextResponse } from "next/server";
import {
  buildPromptlyCorsHeaders,
  handlePromptlyPreflight,
  requireIdeTelemetryUser
} from "@/lib/server/promptlyBackend";
import {
  getVendorUsageSettings,
  persistVendorUsageSnapshots,
  storeVendorUsageTokens,
  type VendorUsageProfileSnapshot,
  type VendorUsageSyncDiagnostics
} from "@/lib/server/vendorUsage";
import { normalizeUtilizationPercent } from "@/lib/vendorPlanPricing";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return handlePromptlyPreflight(request);
}

function readSnapshot(raw: unknown): VendorUsageProfileSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const provider = row.provider;
  if (provider !== "claude_code" && provider !== "codex" && provider !== "cursor") return null;
  const profileId = String(row.profile_id || "").trim();
  if (!profileId) return null;
  const readWindow = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const w = value as Record<string, unknown>;
    if (typeof w.utilization !== "number" || !Number.isFinite(w.utilization)) return null;
    return {
      utilization: normalizeUtilizationPercent(w.utilization),
      resets_at: typeof w.resets_at === "string" ? w.resets_at : null,
      window_seconds: typeof w.window_seconds === "number" ? w.window_seconds : null
    };
  };
  return {
    provider,
    profile_id: profileId,
    profile_label: String(row.profile_label || "Profile").slice(0, 120),
    config_dir: typeof row.config_dir === "string" ? row.config_dir.slice(0, 512) : null,
    vendor_email: typeof row.vendor_email === "string" ? row.vendor_email.slice(0, 320) : null,
    plan_slug: typeof row.plan_slug === "string" ? row.plan_slug.slice(0, 64) : null,
    plan_display: typeof row.plan_display === "string" ? row.plan_display.slice(0, 120) : null,
    plan_organization_type:
      typeof row.plan_organization_type === "string" ? row.plan_organization_type.slice(0, 64) : null,
    primary_window: readWindow(row.primary_window),
    secondary_window: readWindow(row.secondary_window),
    sync_error: typeof row.sync_error === "string" ? row.sync_error.slice(0, 500) : null,
    synced_at_ms: typeof row.synced_at_ms === "number" ? row.synced_at_ms : Date.now()
  };
}

export async function GET(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const { user } = await requireIdeTelemetryUser(request);
    const settings = await getVendorUsageSettings(user.uid);
    return NextResponse.json({ ok: true, settings }, { status: 200, headers: buildPromptlyCorsHeaders(origin) });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401, headers: buildPromptlyCorsHeaders(origin) }
    );
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const { user } = await requireIdeTelemetryUser(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }
    const rawSnapshots = (body as { snapshots?: unknown }).snapshots;
    if (!Array.isArray(rawSnapshots)) {
      return NextResponse.json(
        { error: "snapshots array is required" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }
    const snapshots = rawSnapshots.map(readSnapshot).filter((row): row is VendorUsageProfileSnapshot => row !== null);
    const rawClear = (body as { clear_providers?: unknown }).clear_providers;
    const clearProviders = Array.isArray(rawClear)
      ? rawClear.filter(
          (value): value is "claude_code" | "codex" | "cursor" =>
            value === "claude_code" || value === "codex" || value === "cursor"
        )
      : [];
    const rawDiagnostics = (body as { sync_diagnostics?: unknown }).sync_diagnostics;
    const syncDiagnostics =
      rawDiagnostics && typeof rawDiagnostics === "object" && typeof (rawDiagnostics as { at_ms?: unknown }).at_ms === "number"
        ? (rawDiagnostics as VendorUsageSyncDiagnostics)
        : null;
    const rawTokens = (body as { vendor_tokens?: unknown }).vendor_tokens;
    let tokensStored = false;
    if (rawTokens) {
      tokensStored = await storeVendorUsageTokens(user.uid, rawTokens, {
        device_email: user.email || null
      });
    }
    const written = await persistVendorUsageSnapshots(user.uid, snapshots, clearProviders, syncDiagnostics);
    return NextResponse.json({ ok: true, written, tokens_stored: tokensStored }, { status: 200, headers: buildPromptlyCorsHeaders(origin) });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401, headers: buildPromptlyCorsHeaders(origin) }
    );
  }
}
