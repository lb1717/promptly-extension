export const PROMPTLY_COMPANION_OPEN_URL = "promptly-companion://open";

/** Best-effort launch of the installed Promptly Companion desktop app from the browser. */
export function openPromptlyCompanion(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = PROMPTLY_COMPANION_OPEN_URL;
    document.body.appendChild(iframe);
    window.setTimeout(() => iframe.remove(), 1500);
  } catch {
    window.location.href = PROMPTLY_COMPANION_OPEN_URL;
  }
}
