import { getPublicLaunchCampaignStatus } from "@/lib/server/launchCampaign";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getPublicLaunchCampaignStatus();
    return NextResponse.json({ ok: true, ...status }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error instanceof Error ? error.message : error) },
      { status: 500 }
    );
  }
}
