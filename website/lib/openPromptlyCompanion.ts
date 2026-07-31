export const PROMPTLY_DESKTOP_OPEN_PORT = 38472;

export const PROMPTLY_DESKTOP_OPEN_URLS = ["promptly-labs://open", "promptly-companion://open"] as const;

function triggerCustomProtocol(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Best-effort launch or focus of the installed Promptly Labs desktop app from the browser. */
export async function openPromptlyCompanion(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 500);
    const res = await fetch(`http://127.0.0.1:${PROMPTLY_DESKTOP_OPEN_PORT}/open`, {
      method: "GET",
      signal: controller.signal,
      mode: "cors"
    });
    window.clearTimeout(timeout);
    if (res.ok) {
      return true;
    }
  } catch {
    /* App not running or older build without the local open server. */
  }

  for (const url of PROMPTLY_DESKTOP_OPEN_URLS) {
    triggerCustomProtocol(url);
  }

  return false;
}
