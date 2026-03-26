import { NAV_LINKS, SITE } from "@/lib/constants";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-violet-300/15 bg-violetDark/65 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/85 p-0.5 shadow-[0_6px_16px_rgba(2,6,23,0.25)]">
            <img src="/images/promptly-logo.png" alt="Promptly logo" className="h-full w-full object-contain" />
          </div>
          <span className="text-sm font-semibold text-white">{SITE.name}</span>
        </div>
        <nav className="hidden items-center gap-7 sm:flex">
          {NAV_LINKS.map((item) => (
            <a key={item.label} href={item.href} className="text-sm text-violet-100/85 hover:text-white">
              {item.label}
            </a>
          ))}
          <a
            href="/account"
            className="rounded-lg border border-violet-400/30 px-3 py-1.5 text-sm text-violet-100 hover:bg-violet-500/20 hover:text-white"
          >
            Account
          </a>
        </nav>
      </div>
    </header>
  );
}
