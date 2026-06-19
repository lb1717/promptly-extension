import { NextResponse } from "next/server";
import {
  buildCompanionCorsHeaders,
  handleCompanionPreflight,
  requirePromptlyOptimizeUser,
  transcribeCompanionAudio
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

export async function OPTIONS(request: Request) {
  return handleCompanionPreflight(request);
}

export async function POST(request: Request) {
  const origin = request.headers.get("Origin");
  try {
    await requirePromptlyOptimizeUser(request);
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { error: "Expected multipart form data with an audio field" },
        { status: 400, headers: buildCompanionCorsHeaders(origin) }
      );
    }

    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json(
        { error: "audio file is required" },
        { status: 400, headers: buildCompanionCorsHeaders(origin) }
      );
    }
    if (audio.size < 1) {
      return NextResponse.json(
        { error: "audio file is empty" },
        { status: 400, headers: buildCompanionCorsHeaders(origin) }
      );
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "audio file is too large" },
        { status: 413, headers: buildCompanionCorsHeaders(origin) }
      );
    }

    const bytes = new Uint8Array(await audio.arrayBuffer());
    const result = await transcribeCompanionAudio(bytes, audio.type || "audio/webm");

    return NextResponse.json(
      { text: result.text, model: result.model },
      { headers: buildCompanionCorsHeaders(origin) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed";
    const status = /auth|unauthorized|forbidden/i.test(message)
      ? 401
      : /required|empty|too large|exceeds/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status, headers: buildCompanionCorsHeaders(origin) });
  }
}
