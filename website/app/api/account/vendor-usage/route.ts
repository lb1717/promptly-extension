import { NextResponse } from "next/server";
import {
  getVendorUsagePayload,
  refreshVendorUsageLive,
  updateVendorUsageSettings,
  type VendorUsageSettings
} from "@/lib/server/vendorUsage";
import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let user;
  try {
    ({ user } = await requireWebFirebaseUser(request));
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 401 });
  }
  try {
    const payload = await getVendorUsagePayload(user.uid, user.email || null);
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let user;
  try {
    ({ user } = await requireWebFirebaseUser(request));
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const patch = body as Partial<VendorUsageSettings>;
    await updateVendorUsageSettings(user.uid, patch);
    const payload = await getVendorUsagePayload(user.uid, user.email || null);
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let user;
  try {
    ({ user } = await requireWebFirebaseUser(request));
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const refresh = body && typeof body === "object" && (body as { refresh?: unknown }).refresh === true;
    let refreshResult: { refreshed: number; error?: string } | null = null;
    if (refresh) {
      refreshResult = await refreshVendorUsageLive(user.uid);
    }
    const payload = await getVendorUsagePayload(user.uid, user.email || null);
    return NextResponse.json({
      ok: true,
      ...payload,
      live_refresh: refreshResult
    });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 500 });
  }
}
