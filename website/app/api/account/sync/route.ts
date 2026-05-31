import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Create or update the Firestore user doc using Admin SDK (client writes are not permitted). */
export async function POST(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    return NextResponse.json({ ok: true, user }, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = message.toLowerCase().includes("auth") || message.includes("token") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
