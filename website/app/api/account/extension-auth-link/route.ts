import { NextResponse } from "next/server";
import { getFirebaseAdminAuth } from "@/lib/server/firebaseAdmin";
import { requireWebFirebaseUser } from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const customToken = await getFirebaseAdminAuth().createCustomToken(user.uid, {
      ext_handoff: true
    });
    return NextResponse.json({ ok: true, customToken });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401 }
    );
  }
}
