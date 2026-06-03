import Link from "next/link";
import { ACCOUNT_FAQ, ACCOUNT_TROUBLESHOOTING } from "@/lib/accountHelpContent";
import { SITE } from "@/lib/constants";

function HelpAccordion({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-line rounded-xl border border-line bg-cream-dark/60">
      {items.map((item) => (
        <details key={item.q} className="group px-3 py-0.5 sm:px-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-left text-sm font-medium text-ink marker:hidden [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <span className="shrink-0 text-xs text-faint transition group-open:rotate-180">▼</span>
          </summary>
          <p className="pb-3.5 text-sm leading-relaxed text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export function AccountHelpSection({
  className = "",
  showHeading = true
}: {
  className?: string;
  showHeading?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-line bg-cream p-5 backdrop-blur-md sm:p-6 ${className}`.trim()}
      aria-labelledby={showHeading ? "account-help-heading" : undefined}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        {showHeading ? (
          <div>
            <h2 id="account-help-heading" className="text-lg font-semibold tracking-tight text-ink">
              Help
            </h2>
            <p className="mt-1 text-sm text-muted">
              Quick answers and fixes if Promptly is not showing or not working in your browser.
            </p>
          </div>
        ) : null}
        <div className={`flex shrink-0 flex-wrap gap-2 text-xs ${showHeading ? "" : "sm:ml-auto"}`}>
          <Link
            href={SITE.getStartedPath}
            className="inline-flex items-center justify-center rounded-lg border border-line bg-cream-dark px-3 py-2 font-semibold text-ink hover:bg-cream"
          >
            Get started
          </Link>
          <a
            href={SITE.chromeStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-line px-3 py-2 font-medium text-muted hover:bg-cream-dark"
          >
            Chrome store
          </a>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">FAQ</h3>
          <div className="mt-3">
            <HelpAccordion items={ACCOUNT_FAQ} />
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">Troubleshooting</h3>
          <div className="mt-3">
            <HelpAccordion items={ACCOUNT_TROUBLESHOOTING} />
          </div>
        </div>
      </div>
    </section>
  );
}
