import { getCompanionMacRedirectUrl } from "@/lib/companionDownload";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = await getCompanionMacRedirectUrl();
  if (!url) {
    return NextResponse.json({ error: "Mac installer not available" }, { status: 404 });
  }
  return NextResponse.redirect(url, 302);
}
