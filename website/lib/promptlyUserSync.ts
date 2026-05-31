import { User } from "firebase/auth";

export async function syncPromptlyUserDoc(currentUser: User): Promise<void> {
  const token = await currentUser.getIdToken();
  const res = await fetch("/api/account/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `Account sync failed (${res.status})`);
  }
}
