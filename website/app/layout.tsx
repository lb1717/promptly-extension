import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_Mono } from "next/font/google";
import { ReactNode } from "react";

const notoSansMono = Noto_Sans_Mono({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  variable: "--font-noto-sans-mono",
  display: "swap",
  preload: true,
  adjustFontFallback: true,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"]
});

export const metadata: Metadata = {
  title: "Promptly | Better prompts, better results",
  description: "Premium landing page for the Promptly Chrome extension."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d081b",
  colorScheme: "dark"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={notoSansMono.variable}>
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
