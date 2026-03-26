import { getAdminStats, requireAdminSession } from "@/lib/adminData";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || "14")));
  const data = await getAdminStats(days);
  return NextResponse.json(data, { status: 200 });
}
