import Link from "next/link";
import { NotificationDot } from "@/components/ui/NotificationDot";
import { SITE } from "@/lib/constants";

export function CompanionDesktopPromoBanner({ className = "" }: { className?: string }) {
  return (
    <Link
      href={SITE.companionInstallPath}
      className={`relative block overflow-hidden rounded-2xl bg-blue-800 px-4 py-4 text-white shadow-card transition hover:bg-blue-900 sm:px-5 sm:py-5 ${className}`.trim()}
    >
      <NotificationDot className="absolute right-3 top-3 ring-blue-800" />
      <p className="pr-6 text-sm font-semibold sm:text-base">Try out Promptly on Desktop</p>
      <p className="mt-1 max-w-2xl text-xs text-blue-100 sm:text-sm">
        Download the desktop app to draft prompts, improve in one click, and paste into any AI tool.
      </p>
    </Link>
  );
}
