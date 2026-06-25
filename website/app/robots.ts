import type { MetadataRoute } from "next";
import { absoluteUrl, getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/account/", "/auth/", "/api/", "/join/", "/integrations"]
      }
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: getSiteUrl().replace(/^https?:\/\//, "")
  };
}
