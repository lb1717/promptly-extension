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
  title: "Promptly Labs",
  description:
    "One-click prompt improvement inside ChatGPT, Claude, and Gemini—clearer intent, structured outputs, and usage tracking.",
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
  themeColor: "#fdfdfc",
  colorScheme: "light"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={notoSansMono.variable}>
      <body className="min-h-screen overflow-x-hidden bg-page font-mono text-ink antialiased">{children}</body>
    </html>
  );
}
