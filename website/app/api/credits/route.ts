import { NextResponse } from "next/server";
import {
  buildPromptlyCorsHeaders,
  getCreditsForUser,
  handlePromptlyPreflight,
  requirePromptlyUser
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return handlePromptlyPreflight(request);
}

export async function GET(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    const auth = await requirePromptlyUser(request);
    const result = await getCreditsForUser(auth.user, request);
    return NextResponse.json(
      {
        ok: true,
        day: result.day,
        credits: result.credits
      },
      {
        status: 200,
        headers: buildPromptlyCorsHeaders(origin)
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      {
        status: 401,
        headers: buildPromptlyCorsHeaders(origin)
      }
    );
  }
}
