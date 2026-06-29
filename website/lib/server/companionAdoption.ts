import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";

const USER_COLLECTION = "users";

export function readCompanionDesktopAdoptedAt(data: Record<string, unknown> | undefined): Date | null {
  const raw = data?.companionDesktopAdoptedAt;
  if (raw instanceof Timestamp) return raw.toDate();
  if (raw && typeof raw === "object" && "_seconds" in raw) {
    const seconds = Number((raw as { _seconds: number })._seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  return null;
}

export function hasCompanionDesktopAdopted(data: Record<string, unknown> | undefined): boolean {
  return readCompanionDesktopAdoptedAt(data) !== null;
}

/** First successful Companion app session — only /api/companion/* calls this. */
export async function markCompanionDesktopAdopted(uid: string): Promise<boolean> {
  const db = getFirebaseAdminDb();
  const ref = db.collection(USER_COLLECTION).doc(uid);
  let newlyMarked = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() || {}) as Record<string, unknown>;
    if (hasCompanionDesktopAdopted(data)) return;
    tx.set(
      ref,
      {
        companionDesktopAdoptedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    newlyMarked = true;
  });

  return newlyMarked;
}
