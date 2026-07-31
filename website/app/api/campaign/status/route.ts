import { getPublicLaunchCampaignStatus } from "@/lib/server/launchCampaign";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0"
};

export async function GET() {
  try {
    const status = await getPublicLaunchCampaignStatus();
    return NextResponse.json({ ok: true, ...status }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error instanceof Error ? error.message : error) },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
