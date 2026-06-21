import Link from "next/link";
import type { CompanionDownloadInfo } from "@/lib/companionDownload";
import { PROMPTLY_MAC_INSTALL_COMMAND } from "@/lib/companionDownload";

type Props = {
  download: CompanionDownloadInfo;
};

export function CompanionDownloadClient({ download }: Props) {
  const hasMac = Boolean(download.macUrl);
  const hasMacZip = Boolean(download.macZipUrl);
  const hasWin = Boolean(download.winUrl);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-line bg-page p-2 shadow-card">
          <img src="/images/promptly-logo.png" alt="" className="h-full w-full object-contain" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Promptly</h1>
        <p className="mt-2 text-sm text-muted sm:text-base">
          The desktop app — draft a prompt, improve it with Promptly, refine with feedback, then paste into any AI app.
        </p>
        {download.version ? (
          <p className="mt-2 text-xs text-muted">Version {download.version}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        {hasMac && download.macUrl ? (
          <a
            href={download.macUrl}
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
            className="inline-flex items-center justify-center rounded-xl border border-line bg-page px-6 py-3 text-sm font-semibold text-ink hover:bg-cream-dark"
          >
            {download.winLabel || "Download for Windows"}
          </a>
        ) : null}
      </div>

      {!hasMac && !hasWin ? (
        <p className="mt-6 text-center text-sm text-muted">
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
      ) : null}

      <section className="mt-10 rounded-2xl border border-line bg-page p-5 text-sm text-muted">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink">Mac install</h2>
        <ol className="list-decimal space-y-4 pl-5">
          <li>
            Download the <strong className="text-ink">.dmg</strong> above, open it, and drag{" "}
            <strong className="text-ink">Promptly</strong> to <strong className="text-ink">Applications</strong>.
          </li>
          <li>
            If macOS blocks the app — e.g. &ldquo;damaged&rdquo; or &ldquo;can&apos;t be opened&rdquo; — open{" "}
            <strong className="text-ink">Terminal</strong> and paste this command:
            <pre className="mt-2 select-all overflow-x-auto rounded-lg border border-line bg-cream p-3 font-mono text-xs leading-relaxed text-ink">
              {PROMPTLY_MAC_INSTALL_COMMAND}
            </pre>
          </li>
        </ol>
        <p className="mt-4 text-xs">
          First launch only: if macOS still blocks the app, right-click it in Applications → Open → Open. After that,
          open normally.
        </p>
      </section>

      {hasMac || hasWin ? (
        <section className="mt-6 rounded-2xl border border-line bg-page p-5 text-sm text-muted">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink">Latest build checklist</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Top bar: <strong className="text-ink">▁</strong> collapse, <strong className="text-ink">×</strong> close
            </li>
            <li>Mic buttons on the draft and follow-up boxes</li>
            <li>
              <strong className="text-ink">Paste</strong> next to Copy after you click Improve
            </li>
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-line bg-page p-5 text-sm text-muted">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink">Windows</h2>
        <p>
          {hasWin
            ? "Windows installer is available above."
            : "Windows builds with each release — refresh this page after a new build is published."}
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-page p-5 text-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Connect your account</h2>
        <p className="text-muted">
          Pair an IDE integration first (Cursor, Claude Code, or Codex) — Promptly reads your token automatically. Or
          open Settings in the app and paste a device token from{" "}
          <Link href="/auth/companion" className="font-medium text-ink underline">
            Connect in browser
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
