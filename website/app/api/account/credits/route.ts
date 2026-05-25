import { NextResponse } from "next/server";
import { getCreditsForUser, requireWebFirebaseUser } from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const result = await getCreditsForUser(user, request);
    return NextResponse.json(
      {
        ok: true,
        day: result.day,
        credits: result.credits
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401 }
    );
  }
}
