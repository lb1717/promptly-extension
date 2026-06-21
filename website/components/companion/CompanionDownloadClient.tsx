import Link from "next/link";
import {
  PromptlyDesktopDownloadButtons,
  PromptlyMacInstallSteps,
  PromptlyWindowsInstallSteps
} from "@/components/companion/PromptlyDesktopInstallGuide";
import type { CompanionDownloadInfo } from "@/lib/companionDownload";
import { SITE } from "@/lib/constants";

type Props = {
  download: CompanionDownloadInfo;
};

export function CompanionDownloadClient({ download }: Props) {
  const hasMac = Boolean(download.macUrl || download.macZipUrl);
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
          <p className="mt-2 text-xs text-muted">Latest version {download.version}</p>
        ) : null}
        <p className="mt-3 text-xs text-faint">
          Share this page — downloads always point at the newest release.
        </p>
      </div>

      <PromptlyDesktopDownloadButtons download={download} />

      {hasMac ? <PromptlyMacInstallSteps /> : null}
      {hasWin ? <PromptlyWindowsInstallSteps /> : null}

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

      <section className="mt-6 rounded-2xl border border-line bg-cream-dark p-5 text-sm text-muted">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink">New to Promptly?</h2>
        <p>
          For browser extensions, coding agents, and billing setup, start at{" "}
          <Link href={SITE.getStartedPath} className="font-medium text-ink underline">
            Get started
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
