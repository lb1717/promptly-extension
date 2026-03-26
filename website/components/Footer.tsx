import { SITE } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-violet-300/15 px-4 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/85 p-0.5 shadow-[0_6px_16px_rgba(2,6,23,0.25)]">
            <img src="/images/promptly-logo.png" alt="Promptly logo" className="h-full w-full object-contain" />
          </div>
          <p className="text-sm text-violet-100/80">
            {SITE.name} © {new Date().getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm text-violet-200/80">
          <a href="#" className="hover:text-white">
            Privacy
          </a>
          <a href="#" className="hover:text-white">
            Terms
          </a>
          <a href={SITE.chromeStoreUrl} className="hover:text-white">
            Chrome Store
          </a>
        </div>
      </div>
    </footer>
  );
}
