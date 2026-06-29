import { NextResponse } from "next/server";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { readCompanionDesktopAdoptedAt, hasCompanionDesktopAdopted } from "@/lib/server/companionAdoption";
import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const snap = await getFirebaseAdminDb().collection("users").doc(user.uid).get();
    const data = (snap.data() || {}) as Record<string, unknown>;
    const adoptedAt = readCompanionDesktopAdoptedAt(data);

    return NextResponse.json({
      ok: true,
      adopted: hasCompanionDesktopAdopted(data),
      adoptedAt: adoptedAt?.toISOString() ?? null
    });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = message.toLowerCase().includes("auth") || message.includes("token") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
