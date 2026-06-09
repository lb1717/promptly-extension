import { NextResponse } from "next/server";
import {
  buildPromptlyCorsHeaders,
  consolidateIdeStatsToUser,
  requireIdeTelemetryUser
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("Origin");
  return new Response(null, {
    status: 204,
    headers: {
      ...buildPromptlyCorsHeaders(origin),
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-promptly-client"
    }
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const auth = await requireIdeTelemetryUser(request);
    const payload = await request.json().catch(() => ({}));
    const sourceUids = Array.isArray((payload as { source_uids?: unknown }).source_uids)
      ? ((payload as { source_uids: unknown[] }).source_uids.map((uid) => String(uid || "").trim()).filter(Boolean))
      : [];

    const result = await consolidateIdeStatsToUser(auth.user, sourceUids);
    return NextResponse.json(
      {
        ok: true,
        target_uid: auth.user.uid,
        target_email: auth.user.email,
        ...result
      },
      { status: 200, headers: buildPromptlyCorsHeaders(origin) }
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 400, headers: buildPromptlyCorsHeaders(origin) }
    );
  }
}
