import { NextResponse } from "next/server";
import {
  createIntegrationPairCode,
  normalizePromptlyIdeTool,
  requireWebFirebaseUser
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const payload = await request.json().catch(() => ({}));
    const tool = normalizePromptlyIdeTool((payload as { tool?: unknown }).tool);
    if (!tool) {
      return NextResponse.json({ error: "tool must be claude_code, cursor, or codex" }, { status: 400 });
    }
    const result = await createIntegrationPairCode(user, tool);
    return NextResponse.json({ ok: true, ...result, tool }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401 }
    );
  }
}
