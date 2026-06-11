import { SITE } from "@/lib/constants";

const EDGE_URL =
  SITE.edgeAddonsUrl ||
  SITE.browserExtensionTargets.find((t) => t.key === "edge")?.installUrl ||
  "https://microsoftedge.microsoft.com/addons/detail/promptly/kjmhecmpdjbcdpnifekoabjhchlphiof";

export function OnboardingBrowserExtensionInstall({
  extensionDetected,
  onStoreClick,
  stepNumber = 1
}: {
  extensionDetected?: boolean;
  onStoreClick?: () => void;
  stepNumber?: number;
}) {
  return (
    <div className="rounded-xl border border-line bg-cream-dark p-4">
      <p className="text-base font-semibold text-ink">
        {stepNumber}. Browser extension
      </p>
      <p className="mt-1 text-xs text-muted">
        For ChatGPT, Claude, and Gemini online in your browser.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <a
          href={SITE.chromeStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onStoreClick?.()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-neutral-800"
        >
          <span>Add to Chrome</span>
          <img src="/images/browser-chrome.png" alt="" aria-hidden className="h-5 w-5 shrink-0 object-contain" />
        </a>
        <a
          href={EDGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onStoreClick?.()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-neutral-800"
        >
          <span>Add to Edge</span>
          <img src="/images/browser-edge.png" alt="" aria-hidden className="h-5 w-5 shrink-0 object-contain" />
        </a>
      </div>
      {extensionDetected ? (
        <p className="mt-2 text-xs text-emerald-700">Extension detected — you&apos;re connected.</p>
      ) : null}
    </div>
  );
}
