import { requireAdminSession } from "@/lib/adminData";
import { getAdminLaunchCampaignStatus, updateLaunchCampaign } from "@/lib/server/launchCampaign";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const status = await getAdminLaunchCampaignStatus();
    return NextResponse.json({ ok: true, ...status }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error instanceof Error ? error.message : error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const status = await updateLaunchCampaign({
      active: typeof body.active === "boolean" ? body.active : undefined,
      maxFreeAccounts: body.max_free_accounts != null ? Number(body.max_free_accounts) : undefined,
      claimedCount: body.claimed_count != null ? Number(body.claimed_count) : undefined
    });
    return NextResponse.json({ ok: true, ...status }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error instanceof Error ? error.message : error) },
      { status: 500 }
    );
  }
}
