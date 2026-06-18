import { getCompanionWindowsRedirectUrl } from "@/lib/companionDownload";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = await getCompanionWindowsRedirectUrl();
  if (!url) {
    return NextResponse.json({ error: "Windows installer not available" }, { status: 404 });
  }
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}
