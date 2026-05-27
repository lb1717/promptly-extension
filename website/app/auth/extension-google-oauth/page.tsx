"use client";

import { useEffect, useState } from "react";
import { sendPromptlyExtensionMessage } from "@/lib/extensionBridge";

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

    void sendPromptlyExtensionMessage(extId, { type: "PROMPTLY_OAUTH_BRIDGE", search, hash })
      .then(() => {
        try {
          window.close();
        } catch {
          setNote("You can close this tab.");
        }
      })
      .catch(() => {
        setNote(
          "This page must open from Promptly's browser extension sign-in popup. Close the tab and try Sign in again."
        );
      });
  }, []);

  return (
    <main className="min-h-screen bg-transparent text-ink flex items-center justify-center p-6">
      <p className="text-center text-sm opacity-90 max-w-sm">{note}</p>
    </main>
  );
}
