import { NextResponse } from "next/server";
import {
  buildPromptlyCorsHeaders,
  handlePromptlyPreflight,
  normalizeIdeActivityEventInput,
  persistIdeActivityEvents,
  requireIdeTelemetryUser
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return handlePromptlyPreflight(request);
}

export async function POST(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const { user } = await requireIdeTelemetryUser(request);
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }
    const rawEvents = (payload as { events?: unknown }).events;
    if (!Array.isArray(rawEvents)) {
      return NextResponse.json(
        { error: "events array is required" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }
    if (rawEvents.length > 25) {
      return NextResponse.json(
        { error: "At most 25 events per request" },
        { status: 400, headers: buildPromptlyCorsHeaders(origin) }
      );
    }

    let invalid = 0;
    const rows = [];
    for (const entry of rawEvents) {
      if (!entry || typeof entry !== "object") continue;
      const normalized = normalizeIdeActivityEventInput(entry as Record<string, unknown>);
      if (normalized) {
        rows.push(normalized);
      } else {
        invalid += 1;
      }
    }

    const written = await persistIdeActivityEvents(user, rows);
    return NextResponse.json(
      { ok: true, written, received: rawEvents.length, invalid_skipped: invalid },
      { status: 200, headers: buildPromptlyCorsHeaders(origin) }
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401, headers: buildPromptlyCorsHeaders(origin) }
    );
  }
}
