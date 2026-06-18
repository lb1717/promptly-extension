import Link from "next/link";
import type { CompanionDownloadInfo } from "@/lib/companionDownload";

type Props = {
  download: CompanionDownloadInfo;
};

export function CompanionDownloadClient({ download }: Props) {
  const hasMac = Boolean(download.macUrl);
  const hasWin = Boolean(download.winUrl);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-line bg-page p-2 shadow-card">
          <img src="/images/promptly-logo.png" alt="" className="h-full w-full object-contain" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Promptly Companion</h1>
        <p className="mt-2 text-sm text-muted sm:text-base">
          A floating desktop workshop — draft a prompt, improve it with Promptly, refine with feedback, then copy into
          any AI app.
        </p>
        {download.version ? (
          <p className="mt-2 text-xs text-muted">Version {download.version}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        {hasMac && download.macUrl ? (
          <a
            href={download.macUrl}
            download
            className="inline-flex items-center justify-center rounded-xl border border-ink bg-blue-800 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-900"
          >
            {download.macLabel || "Download for Mac"}
          </a>
        ) : null}
        {hasWin && download.winUrl ? (
          <a
            href={download.winUrl}
            download
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

      <section className="mt-10 rounded-2xl border border-line bg-cream/80 p-5 text-sm text-muted">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink">First-time install (Mac)</h2>
        <p className="mb-2">
          Companion is not from the App Store yet. macOS may say the app is from an unidentified developer — that is
          normal without Apple&apos;s paid developer program.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Open the .dmg and drag Promptly Companion to Applications.</li>
          <li>
            <strong className="text-ink">Right-click</strong> the app → <strong className="text-ink">Open</strong> →
            Open again. (Or System Settings → Privacy &amp; Security → Open Anyway.)
          </li>
        </ol>
        <p className="mt-4 text-xs">
          You do <em>not</em> need an Apple Developer account to download or use the app — signing only removes this
          extra step.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-page p-5 text-sm text-muted">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink">Windows</h2>
        <p>
          Windows installer builds via GitHub Releases when tagged (<code className="rounded bg-cream px-1">companion-v*</code>
          ). Mac is available now; Windows link appears here automatically once a release includes a{" "}
          <code className="rounded bg-cream px-1">.exe</code>.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-page p-5 text-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Connect your account</h2>
        <p className="text-muted">
          Pair an IDE integration first (Cursor, Claude Code, or Codex) — Companion reads your token automatically. Or
          open Settings in the app and paste a device token from{" "}
          <Link href="/integrations" className="font-medium text-ink underline">
            Integrations
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
