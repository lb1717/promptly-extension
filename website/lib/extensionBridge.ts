"use client";

import { BROWSER_EXTENSION_TARGETS } from "@/lib/constants";

type ExternalRuntime = {
  sendMessage?: (
    extensionId: string,
    message: unknown,
    responseCallback?: (response?: unknown) => void
  ) => unknown;
  lastError?: { message?: string };
};

type RuntimeSource = {
  runtime: ExternalRuntime;
  promiseStyle: boolean;
};

function getRuntimeSource(): RuntimeSource | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as Window & {
    chrome?: { runtime?: ExternalRuntime };
    browser?: { runtime?: ExternalRuntime };
  };
  if (typeof w.chrome?.runtime?.sendMessage === "function") {
    return { runtime: w.chrome.runtime, promiseStyle: false };
  }
  if (typeof w.browser?.runtime?.sendMessage === "function") {
    return { runtime: w.browser.runtime, promiseStyle: true };
  }
  return null;
}

export function getStoredPromptlyExtensionId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return String(window.sessionStorage.getItem("promptly_extension_id") || "").trim();
  } catch {
    return "";
  }
}

export function rememberPromptlyExtensionId(extensionId: string) {
  const cleanId = String(extensionId || "").trim();
  if (!cleanId || typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem("promptly_extension_id", cleanId);
  } catch {
    /* ignore storage failures */
  }
}

export function getPromptlyExtensionCandidateIds(preferredId?: string): string[] {
  const seen = new Set<string>();
  const ids = [
    preferredId,
    getStoredPromptlyExtensionId(),
    ...BROWSER_EXTENSION_TARGETS.map((target) => target.extensionId)
  ];
  return ids
    .map((id) => String(id || "").trim())
    .filter((id) => {
      if (!id || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
}

export async function sendPromptlyExtensionMessage(extensionId: string, message: unknown) {
  const source = getRuntimeSource();
  if (!source?.runtime?.sendMessage) {
    throw new Error("Browser extension API unavailable");
  }

  if (source.promiseStyle) {
    return source.runtime.sendMessage(extensionId, message);
  }

  return new Promise<unknown>((resolve, reject) => {
    source.runtime.sendMessage?.(extensionId, message, (response?: unknown) => {
      const err = source.runtime.lastError;
      if (err?.message) {
        reject(new Error(err.message));
        return;
      }
      resolve(response);
    });
  });
}

export async function sendPromptlyExtensionMessageToCandidates(
  candidateIds: string[],
  message: unknown
) {
  const errors: string[] = [];
  for (const extensionId of candidateIds) {
    try {
      const response = await sendPromptlyExtensionMessage(extensionId, message);
      rememberPromptlyExtensionId(extensionId);
      return { extensionId, response };
    } catch (error) {
      errors.push(`${extensionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors[0] || "Promptly extension not reachable");
}

type ExtensionSessionUser = {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  email: string | null;
  uid: string;
};

/** Push Firebase session to the installed extension (returns false if extension not reachable). */
export async function syncWebsiteSessionToExtension(user: ExtensionSessionUser): Promise<boolean> {
  const candidateIds = getPromptlyExtensionCandidateIds();
  if (!candidateIds.length) {
    return false;
  }
  try {
    const idToken = await user.getIdToken(true);
    const { response } = await sendPromptlyExtensionMessageToCandidates(candidateIds, {
      type: "PROMPTLY_WEBSITE_SESSION_SYNC",
      idToken,
      email: user.email || "",
      uid: user.uid,
      expiresAtSec: Math.floor(Date.now() / 1000) + 3300
    });
    const r = response as { ok?: boolean } | undefined;
    return r?.ok !== false;
  } catch {
    return false;
  }
}
