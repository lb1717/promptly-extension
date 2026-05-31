import type { Metadata } from "next";

export const DEFAULT_DESCRIPTION =
  "Promptly is a browser extension that improves your AI prompts in one click inside ChatGPT, Claude, and Gemini. Get clearer intent, structured outputs, and less trial-and-error.";

export const DEFAULT_KEYWORDS = [
  "prompt optimization",
  "prompt improvement",
  "prompt engineering",
  "ChatGPT prompt helper",
  "Claude prompt optimizer",
  "Gemini prompt tool",
  "AI prompt extension",
  "browser extension for AI",
  "structured AI outputs",
  "Promptly Labs"
];

type SitemapChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

/** Public marketing pages included in the sitemap. */
export const PUBLIC_SITEMAP_ROUTES: Array<{ path: string; changeFrequency: SitemapChangeFrequency; priority: number }> =
  [
  { path: "/product", changeFrequency: "weekly", priority: 1 },
  { path: "/get-started", changeFrequency: "weekly", priority: 0.9 },
  { path: "/labs", changeFrequency: "monthly", priority: 0.8 },
  { path: "/research", changeFrequency: "monthly", priority: 0.75 },
  { path: "/papers", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 }
];

export function getSiteUrl(): string {
  return String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://promptly-labs.com").replace(
    /\/$/,
    ""
  );
}

export function absoluteUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalized}`;
}

export function buildPageMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  noIndex = false,
  keywords
}: {
  title: string;
  description?: string;
  path: string;
  noIndex?: boolean;
  keywords?: string[];
}): Metadata {
  const url = absoluteUrl(path);
  const ogImage = absoluteUrl("/icon-512.png");

  return {
    title,
    description,
    keywords: keywords ?? DEFAULT_KEYWORDS,
    alternates: {
      canonical: url
    },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 }
        },
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      siteName: "Promptly Labs",
      title,
      description,
      images: [{ url: ogImage, width: 512, height: 512, alt: "Promptly — AI prompt improvement extension" }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage]
    }
  };
}

export function rootMetadata(): Metadata {
  const verificationToken = String(process.env.GOOGLE_SITE_VERIFICATION || "").trim();

  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: "Promptly — One-Click Prompt Improvement for ChatGPT, Claude & Gemini",
      template: "%s | Promptly Labs"
    },
    description: DEFAULT_DESCRIPTION,
    keywords: DEFAULT_KEYWORDS,
    applicationName: "Promptly",
    authors: [{ name: "Promptly Labs", url: getSiteUrl() }],
    creator: "Promptly Labs",
    publisher: "Promptly Labs",
    category: "technology",
    ...(verificationToken ? { verification: { google: verificationToken } } : {}),
    icons: {
      icon: [
        { url: "/favicon.png", type: "image/png", sizes: "48x48" },
        { url: "/icon-512.png", type: "image/png", sizes: "512x512" }
      ],
      shortcut: [{ url: "/favicon.png", type: "image/png" }],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
    }
  };
}
