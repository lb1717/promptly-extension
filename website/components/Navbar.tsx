"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationDot } from "@/components/ui/NotificationDot";
import { NAV_LINKS, SITE } from "@/lib/constants";
import { useCompanionAdoptionPromo } from "@/lib/useCompanionAdoptionPromo";

export function Navbar() {
  const pathname = usePathname();
  const onAccountPage = pathname === "/account" || pathname.startsWith("/account/");
  const { showNotificationDot } = useCompanionAdoptionPromo();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-page/90 backdrop-blur-xl">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-3 sm:grid-cols-[1fr_auto_1fr] sm:px-4">
        <Link
          href="/"
          className="hidden min-w-0 items-center gap-1.5 justify-self-start text-sm font-semibold text-ink hover:text-muted sm:flex"
        >
          <img
            src="/images/promptly-logo.png"
            alt=""
            aria-hidden
            className="h-[1em] w-auto shrink-0 object-contain"
          />
          {SITE.navBrand}
        </Link>
        <nav className="flex items-center justify-start gap-4 sm:justify-center sm:gap-10">
          {NAV_LINKS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
            data-onboarding-tour="account-nav"
            className={`relative inline-flex items-center ${
              onAccountPage
                ? "rounded-lg border border-line px-2.5 py-1 text-xs text-ink hover:bg-cream-dark sm:px-3 sm:py-1.5 sm:text-sm"
                : "rounded-lg border border-ink bg-blue-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-900 sm:px-3 sm:py-1.5 sm:text-sm"
            }`}
          >
            My Account
            {showNotificationDot ? (
              <NotificationDot corner className={onAccountPage ? "ring-page" : "ring-blue-800"} />
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
