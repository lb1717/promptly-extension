import Link from "next/link";
import type { CompanionDownloadInfo } from "@/lib/companionDownload";

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
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Promptly Companion</h1>
        <p className="mt-2 text-sm text-muted sm:text-base">
          A floating desktop workshop — draft a prompt, improve it with Promptly, refine with feedback, then copy into
          any AI app.
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

      <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50/90 p-5 text-sm text-muted">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink">Mac install (follow every step)</h2>
        <p className="mb-3">
          Companion is not from the App Store yet, so macOS will block it the first time. That is expected — the app is
          safe. You only do this once.
        </p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            Download the <strong className="text-ink">.dmg</strong> above, open it, and drag{" "}
            <strong className="text-ink">Promptly Companion</strong> to <strong className="text-ink">Applications</strong>.
          </li>
          <li>
            Open <strong className="text-ink">Terminal</strong> and paste (fixes &ldquo;damaged&rdquo;):
            <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-page p-3 text-xs text-ink">
              xattr -cr &quot;/Applications/Promptly Companion.app&quot;
            </pre>
          </li>
          <li>
            <strong className="text-ink">Do not double-click the app yet.</strong> In Finder, go to{" "}
            <strong className="text-ink">Applications</strong>, <strong className="text-ink">right-click</strong>{" "}
            <strong className="text-ink">Promptly Companion</strong> → <strong className="text-ink">Open</strong> → click{" "}
            <strong className="text-ink">Open</strong> in the dialog.
            <p className="mt-2 text-xs">
              This fixes: &ldquo;can&apos;t be opened because Apple cannot check it for malicious software.&rdquo;
            </p>
          </li>
          <li>
            If you do not see a right-click Open option: open <strong className="text-ink">System Settings</strong> →{" "}
            <strong className="text-ink">Privacy &amp; Security</strong> → scroll down → click{" "}
            <strong className="text-ink">Open Anyway</strong> next to Promptly Companion.
          </li>
          <li>
            After it opens, go to <strong className="text-ink">⚙ Settings</strong> and confirm{" "}
            <strong className="text-ink">Version {download.version || "…"} · installed</strong>.
          </li>
        </ol>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-cream/80 p-5 text-sm text-muted">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink">Why does macOS block it?</h2>
        <p>
          Fully removing this step requires Apple&apos;s $99/year Developer Program to notarize the app. Without that,
          every Mac app downloaded from the web needs the one-time right-click Open above. After the first successful
          launch, you can open it normally.
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
            : "Windows builds with each companion release — refresh this page after a new release is published."}
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
