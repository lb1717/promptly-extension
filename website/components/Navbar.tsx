"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, SITE } from "@/lib/constants";

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/50 backdrop-blur-xl">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
        <Link
          href="/product"
          className="min-w-0 justify-self-start text-sm font-semibold text-white hover:text-violet-100"
        >
          {SITE.navBrand}
        </Link>
        <nav className="flex items-center justify-center gap-6 sm:gap-10">
          {NAV_LINKS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={
                  active
                    ? "whitespace-nowrap border-b-2 border-violet-200 pb-0.5 text-sm font-medium text-white"
                    : "whitespace-nowrap border-b-2 border-transparent pb-0.5 text-sm text-violet-100/85 hover:text-white"
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
            className="rounded-lg border border-violet-400/30 px-3 py-1.5 text-sm text-violet-100 hover:bg-violet-500/20 hover:text-white"
          >
            Account
          </Link>
        </div>
      </div>
    </header>
  );
}
