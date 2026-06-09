import { NextResponse } from "next/server";
import {
  isPromptlyFirestoreQuotaError,
  linkIdeAccountForUser,
  readLinkedIdeAccounts,
  requireWebFirebaseUser,
  unlinkIdeAccountForUser
} from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const linked = await readLinkedIdeAccounts(user.uid);
    return NextResponse.json(
      {
        primary: { uid: user.uid, email: user.email },
        linked
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

export async function POST(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const body = await request.json().catch(() => ({}));
    const linkedIdToken = String(body?.linkedIdToken || body?.linked_id_token || "").trim();
    if (!linkedIdToken) {
      return NextResponse.json({ error: "Missing linkedIdToken" }, { status: 400 });
    }
    const linked = await linkIdeAccountForUser(user, linkedIdToken);
    return NextResponse.json(
      {
        ok: true,
        primary: { uid: user.uid, email: user.email },
        linked
      },
      { status: 200 }
    );
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const quota = isPromptlyFirestoreQuotaError(error);
    return NextResponse.json(
      { error: quota ? "Firestore quota exceeded. Try again in a few minutes." : message, quota_exceeded: quota },
      { status: quota ? 503 : 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const body = await request.json().catch(() => ({}));
    const target = String(body?.uid || body?.email || "").trim();
    if (!target) {
      return NextResponse.json({ error: "Missing uid or email" }, { status: 400 });
    }
    const linked = await unlinkIdeAccountForUser(user, target);
    return NextResponse.json(
      {
        ok: true,
        primary: { uid: user.uid, email: user.email },
        linked
      },
      { status: 200 }
    );
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
