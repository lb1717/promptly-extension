import { NextResponse } from "next/server";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { markCompanionDesktopAdopted } from "@/lib/server/companionAdoption";
import {
  buildCompanionCorsHeaders,
  getCreditsForUser,
  handleCompanionPreflight,
  requirePromptlyOptimizeUser
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

const USER_COLLECTION = "users";

export async function OPTIONS(request: Request) {
  return handleCompanionPreflight(request);
}

export async function GET(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const auth = await requirePromptlyOptimizeUser(request);
    await markCompanionDesktopAdopted(auth.user.uid);
    const creditsResult = await getCreditsForUser(auth.user, request);
    const userSnap = await getFirebaseAdminDb().collection(USER_COLLECTION).doc(auth.user.uid).get();
    const userData = (userSnap.data() || {}) as Record<string, unknown>;
    const displayName = String(userData.displayName || "").trim() || null;

    return NextResponse.json(
      {
        ok: true,
        email: auth.user.email,
        displayName,
        plan: auth.user.plan,
        credits: creditsResult.credits,
        deviceTool: auth.deviceTool
      },
      {
        status: 200,
        headers: buildCompanionCorsHeaders(origin)
      }
    );
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = /missing or invalid x-promptly-client|missing firebase auth token|invalid/i.test(message)
      ? 401
      : 500;
    return NextResponse.json(
      { error: message },
      {
        status,
        headers: buildCompanionCorsHeaders(origin)
      }
    );
  }
}
