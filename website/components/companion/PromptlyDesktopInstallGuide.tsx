"use client";

import { CopyBlock } from "@/components/integrations/integrationCopyBlock";
import { PROMPTLY_MAC_INSTALL_COMMAND } from "@/lib/companionDownload";
import type { CompanionDownloadInfo } from "@/lib/companionDownload";

export function PromptlyDesktopDownloadButtons({
  download,
  onMacClick,
  onWinClick
}: {
  download: CompanionDownloadInfo;
  onMacClick?: () => void;
  onWinClick?: () => void;
}) {
  const hasMac = Boolean(download.macUrl);
  const hasMacZip = Boolean(download.macZipUrl);
  const hasWin = Boolean(download.winUrl);

  if (!hasMac && !hasWin) {
    return (
      <p className="text-center text-sm text-muted">
        Installers are being prepared. Check back soon or see{" "}
        <a
          href="https://github.com/lb1717/promptly-extension/releases"
          className="font-medium text-ink underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub Releases
        </a>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
      {hasMac && download.macUrl ? (
        <a
          href={download.macUrl}
          onClick={() => onMacClick?.()}
          className="inline-flex items-center justify-center rounded-xl border border-ink bg-blue-800 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-900"
        >
          {download.macLabel || "Download for Mac"}
        </a>
      ) : null}
      {hasMacZip && download.macZipUrl ? (
        <a
          href={download.macZipUrl}
          className="inline-flex items-center justify-center rounded-xl border border-line bg-page px-6 py-3 text-sm font-semibold text-ink hover:bg-cream-dark"
        >
          {download.macZipLabel || "Download Mac ZIP"}
        </a>
      ) : null}
      {hasWin && download.winUrl ? (
        <a
          href={download.winUrl}
          onClick={() => onWinClick?.()}
          className="inline-flex items-center justify-center rounded-xl border border-line bg-page px-6 py-3 text-sm font-semibold text-ink hover:bg-cream-dark"
        >
          {download.winLabel || "Download for Windows"}
        </a>
      ) : null}
    </div>
  );
}

export function PromptlyMacInstallSteps({
  onCommandCopy,
  compact = false,
  downloadOnSamePage = true
}: {
  onCommandCopy?: () => void;
  compact?: boolean;
  downloadOnSamePage?: boolean;
}) {
  return (
    <section className={compact ? "mt-3 space-y-3 text-xs text-muted" : "mt-10 rounded-2xl border border-line bg-page p-5 text-sm text-muted"}>
      {!compact ? (
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink">Mac install</h2>
      ) : null}
      <ol className={`list-decimal space-y-3 pl-5 ${compact ? "" : "space-y-4"}`}>
        <li>
          {downloadOnSamePage ? (
            <>
              Download the <strong className="text-ink">.dmg</strong> above, open it, and drag{" "}
              <strong className="text-ink">Promptly</strong> to <strong className="text-ink">Applications</strong>.
            </>
          ) : (
            <>
              On the download page, get the Mac <strong className="text-ink">.dmg</strong>, open it, and drag{" "}
              <strong className="text-ink">Promptly</strong> to <strong className="text-ink">Applications</strong>.
            </>
          )}
        </li>
        <li>
          If macOS blocks the app — e.g. &ldquo;damaged&rdquo; or &ldquo;can&apos;t be opened&rdquo; — run this{" "}
          <strong className="text-ink">once</strong> in Terminal after moving Promptly to Applications, then open
          normally:
          <CopyBlock lines={[PROMPTLY_MAC_INSTALL_COMMAND]} label="Terminal" onCopy={onCommandCopy} />
        </li>
      </ol>
      {!compact ? (
        <p className="mt-4 text-xs">
          First launch only: if macOS still blocks the app, right-click it in Applications → Open → Open. After that,
          open normally.
        </p>
      ) : null}
    </section>
  );
}

export function PromptlyWindowsInstallSteps({
  compact = false,
  downloadOnSamePage = true
}: {
  compact?: boolean;
  downloadOnSamePage?: boolean;
}) {
  return (
    <section className={compact ? "mt-3 text-xs text-muted" : "mt-6 rounded-2xl border border-line bg-page p-5 text-sm text-muted"}>
      {!compact ? (
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink">Windows install</h2>
      ) : null}
      <p>
        {downloadOnSamePage ? (
          <>
            Download the <strong className="text-ink">.exe</strong> above and run the installer.
          </>
        ) : (
          <>On the download page, get the Windows installer and run it.</>
        )}{" "}
        If SmartScreen warns about an unrecognized app, choose <strong className="text-ink">More info</strong> →{" "}
        <strong className="text-ink">Run anyway</strong>, then open Promptly from the Start menu.
      </p>
    </section>
  );
}
