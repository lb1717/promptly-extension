import { signInWithCustomToken, signInWithPopup, type User } from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebaseClient";

async function restorePrimarySession(primaryToken: string) {
  const restore = await fetch("/api/account/extension-auth-link", {
    method: "POST",
    headers: { Authorization: `Bearer ${primaryToken}` }
  });
  const data = await restore.json().catch(() => ({}));
  if (!restore.ok || typeof data?.customToken !== "string") {
    throw new Error(typeof data?.error === "string" ? data.error : "Could not restore your Promptly session");
  }
  await signInWithCustomToken(getFirebaseAuth(), data.customToken);
}

export async function linkIdeGoogleAccount(primaryUser: User): Promise<{ email: string; uid: string }> {
  const primaryToken = await primaryUser.getIdToken();
  const cred = await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
  const linkedIdToken = await cred.user.getIdToken();
  const linkedEmail = cred.user.email || cred.user.uid;

  try {
    const res = await fetch("/api/account/ide-linked-accounts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${primaryToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ linkedIdToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : `Link failed (${res.status})`);
    }
    return { email: linkedEmail, uid: cred.user.uid };
  } finally {
    await restorePrimarySession(primaryToken);
  }
}

export async function unlinkIdeGoogleAccount(primaryUser: User, uid: string): Promise<void> {
  const token = await primaryUser.getIdToken();
  const res = await fetch("/api/account/ide-linked-accounts", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ uid })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `Unlink failed (${res.status})`);
  }
}
