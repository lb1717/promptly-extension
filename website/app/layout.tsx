import "./globals.css";
import type { Viewport } from "next";
import { Noto_Sans_Mono } from "next/font/google";
import { ReactNode } from "react";
import { SiteJsonLd } from "@/components/JsonLd";
import { OnboardingTourHost } from "@/components/onboarding/OnboardingTourHost";
import { rootMetadata } from "@/lib/seo";

const notoSansMono = Noto_Sans_Mono({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  variable: "--font-noto-sans-mono",
  display: "swap",
  preload: true,
  adjustFontFallback: true,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"]
});

export const metadata = rootMetadata();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fdfdfc",
  colorScheme: "light"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={notoSansMono.variable}>
      <body className="min-h-screen overflow-x-hidden bg-page font-mono text-ink antialiased">
        <SiteJsonLd />
        {children}
        <OnboardingTourHost />
      </body>
    </html>
  );
}
