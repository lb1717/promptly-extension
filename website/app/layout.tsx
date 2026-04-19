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
  description: "Premium landing page for the Promptly Chrome extension.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "48x48" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" }
    ],
    shortcut: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
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
      <body className="min-h-screen overflow-x-hidden bg-black font-mono antialiased">{children}</body>
    </html>
  );
}
