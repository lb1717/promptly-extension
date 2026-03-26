import {
  adminSetUserDailyTokenLimit,
  getAdminUserDetail,
  requireAdminSession
} from "@/lib/adminData";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: { userId: string } }) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = context.params;
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || "30")));
  const data = await getAdminUserDetail(decodeURIComponent(userId), days);
  if (!data.ok) {
    return NextResponse.json({ error: data.error || "Not found" }, { status: 404 });
  }
  return NextResponse.json(data, { status: 200 });
}

export async function PATCH(request: Request, context: { params: { userId: string } }) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = context.params;
  const body = await request.json().catch(() => null);
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).daily_token_limit : null;
  const next =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : NaN;
  try {
    const result = await adminSetUserDailyTokenLimit(decodeURIComponent(userId), next);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
