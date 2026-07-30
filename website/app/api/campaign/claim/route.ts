import { claimLaunchCampaignPro } from "@/lib/server/launchCampaign";
import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const result = await claimLaunchCampaignPro(user.uid);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status =
      message.toLowerCase().includes("auth") || message.includes("token")
        ? 401
        : message.includes("no longer available") || message.includes("claimed")
          ? 409
          : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
