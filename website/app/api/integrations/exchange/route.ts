import { NextResponse } from "next/server";
import { buildPromptlyCorsHeaders, exchangeIntegrationPairCode, normalizePromptlyIdeTool } from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("Origin");
  return new Response(null, {
    status: 204,
    headers: {
      ...buildPromptlyCorsHeaders(origin),
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }
    const code = String((payload as { code?: unknown }).code || "").trim();
    const tool = normalizePromptlyIdeTool((payload as { tool?: unknown }).tool);
    const deviceLabel =
      typeof (payload as { device_label?: unknown }).device_label === "string"
        ? (payload as { device_label: string }).device_label
        : typeof (payload as { deviceLabel?: unknown }).deviceLabel === "string"
          ? (payload as { deviceLabel: string }).deviceLabel
          : null;
    if (!tool) {
      return NextResponse.json(
        { error: "tool must be claude_code, cursor, or codex" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }
    const result = await exchangeIntegrationPairCode({ code, tool, deviceLabel });
    return NextResponse.json(
      {
        ok: true,
        device_token: result.deviceToken,
        uid: result.uid,
        email: result.email,
        tool: result.tool
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
