import { SITE } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-line bg-cream px-4 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-page p-0.5 shadow-card">
            <img src="/images/promptly-logo.png" alt="Promptly logo" className="h-full w-full object-contain" />
          </div>
          <p className="text-sm text-muted">
            {SITE.name} © {new Date().getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm text-muted">
          <a href="/privacy" className="hover:text-ink">
            Privacy
          </a>
          <a href="#" className="hover:text-ink">
            Terms
          </a>
          <a href={SITE.chromeStoreUrl} className="hover:text-ink">
            Extension Store
          </a>
        </div>
      </div>
    </footer>
  );
}
