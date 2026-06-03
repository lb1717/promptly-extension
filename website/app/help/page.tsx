import Link from "next/link";
import { AmbientBackground } from "@/components/AmbientBackground";
import { AccountHelpSection } from "@/components/account/AccountHelpSection";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { SITE } from "@/lib/constants";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Help",
  description:
    "FAQ and troubleshooting for Promptly — install the extension, fix missing UI, and get support for ChatGPT, Claude, and Gemini.",
  path: "/help"
});

export default function HelpPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground variant="static" />
      <div className="relative z-10">
        <Navbar />
        <article className="mx-auto w-full max-w-5xl px-4 pb-20 pt-10 sm:pt-14">
          <p className="text-sm font-medium text-faint">
            <Link href="/product" className="text-muted hover:text-ink">
              Product
            </Link>
            <span className="mx-2 opacity-60">/</span>
            Help
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Help</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Quick answers and fixes if {SITE.name} is not showing or not working in your browser.
          </p>

          <div className="mt-10">
            <AccountHelpSection showHeading={false} />
          </div>
        </article>
        <Footer />
      </div>
    </main>
  );
}
