import type { User } from "firebase/auth";
import {
  googleAuthCallbackPathForIdeLink,
  PROMPTLY_IDE_LINK_DONE,
  PROMPTLY_IDE_LINK_ERROR
} from "@/lib/firebaseGoogleAuth";

const IDE_LINK_TIMEOUT_MS = 10 * 60 * 1000;

export async function linkIdeGoogleAccount(primaryUser: User): Promise<{ email: string; uid: string }> {
  const primaryToken = await primaryUser.getIdToken();

  const linkedIdToken = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      fn();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === PROMPTLY_IDE_LINK_DONE && typeof data.linkedIdToken === "string") {
        finish(() => resolve(data.linkedIdToken));
      }
      if (data.type === PROMPTLY_IDE_LINK_ERROR) {
        finish(() =>
          reject(new Error(typeof data.message === "string" ? data.message : "Could not verify that account."))
        );
      }
    };

    window.addEventListener("message", onMessage);
    const timeoutId = window.setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            "Link timed out. Finish signing in on the other tab, or close it and try again."
          )
        )
      );
    }, IDE_LINK_TIMEOUT_MS);

    const url = googleAuthCallbackPathForIdeLink();
    const opened = window.open(url, "_blank");
    if (!opened) {
      finish(() =>
        reject(
          new Error(
            "Pop-up blocked. Allow pop-ups for promptly-labs.com, then click Link again."
          )
        )
      );
    }
  });

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

  const linked = Array.isArray(data?.linked) ? data.linked : [];
  const latest = linked.length > 0 ? linked[linked.length - 1] : null;
  return {
    email: typeof latest?.email === "string" ? latest.email : "Linked account",
    uid: typeof latest?.uid === "string" ? latest.uid : ""
  };
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
