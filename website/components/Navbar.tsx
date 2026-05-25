"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, SITE } from "@/lib/constants";

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-page/90 backdrop-blur-xl">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-3 sm:grid-cols-[1fr_auto_1fr] sm:px-4">
        <Link
          href="/product"
          className="hidden min-w-0 justify-self-start text-sm font-semibold text-ink hover:text-muted sm:block"
        >
          {SITE.navBrand}
        </Link>
        <nav className="flex items-center justify-start gap-4 sm:justify-center sm:gap-10">
          {NAV_LINKS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={
                  active
                    ? "whitespace-nowrap border-b-2 border-ink pb-0.5 text-xs font-medium text-ink sm:text-sm"
                    : "whitespace-nowrap border-b-2 border-transparent pb-0.5 text-xs text-muted hover:text-ink sm:text-sm"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex justify-end">
          <Link
            href="/account"
            className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink hover:bg-cream-dark sm:px-3 sm:py-1.5 sm:text-sm"
          >
            Account
          </Link>
        </div>
      </div>
    </header>
  );
}
