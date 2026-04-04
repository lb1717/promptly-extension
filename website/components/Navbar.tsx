import Link from "next/link";
import { NAV_LINKS, SITE } from "@/lib/constants";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-violet-300/15 bg-violetDark/65 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-sm font-semibold text-white hover:text-violet-100">
          {SITE.navBrand}
        </Link>
        <nav className="hidden items-center gap-7 sm:flex">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm text-violet-100/85 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/account"
            className="rounded-lg border border-violet-400/30 px-3 py-1.5 text-sm text-violet-100 hover:bg-violet-500/20 hover:text-white"
          >
            Account
          </Link>
        </nav>
      </div>
    </header>
  );
}
