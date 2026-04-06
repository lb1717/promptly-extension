"use client";

import { useEffect, useState } from "react";

function parseOAuthStateParam() {
  const search = typeof window !== "undefined" ? window.location.search || "" : "";
  const hash = typeof window !== "undefined" ? window.location.hash || "" : "";
  const fragment = hash.replace(/^#/, "");
  const fromHash = new URLSearchParams(fragment);
  let state = fromHash.get("state") || "";
  if (!state && search) {
    state = new URLSearchParams(search.replace(/^\?/, "")).get("state") || "";
  }
  const lastPipe = state.lastIndexOf("|");
  const extId = lastPipe >= 0 ? state.slice(lastPipe + 1).trim() : "";
  return { extId, search, hash };
}

export default function ExtensionGoogleOAuthPage() {
  const [note, setNote] = useState("Completing sign-in…");

  useEffect(() => {
    const { extId, search, hash } = parseOAuthStateParam();
    if (!extId) {
      setNote("Missing sign-in state. Close this tab and use Sign in from Promptly on the chat page.");
      return;
    }

    const w = typeof window !== "undefined" ? window : undefined;
    type ExtSend = (extensionId: string, message: unknown, cb?: () => void) => void;
    const send = (w as unknown as { chrome?: { runtime?: { sendMessage?: ExtSend } } })?.chrome?.runtime
      ?.sendMessage;
    if (typeof send !== "function") {
      setNote(
        "This page must open from Google sign-in in the Promptly popup. Close the tab and try Sign in again."
      );
      return;
    }

    send(
      extId,
      { type: "PROMPTLY_OAUTH_BRIDGE", search, hash },
      () => {
        try {
          window.close();
        } catch {
          setNote("You can close this tab.");
        }
      }
    );
  }, []);

  return (
    <main className="min-h-screen bg-transparent text-ink flex items-center justify-center p-6">
      <p className="text-center text-sm opacity-90 max-w-sm">{note}</p>
    </main>
  );
}
