import type { MetadataRoute } from "next";
import { DEFAULT_DESCRIPTION } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Promptly Labs",
    short_name: "Promptly",
    description: DEFAULT_DESCRIPTION,
    start_url: "/product",
    display: "standalone",
    background_color: "#fdfdfc",
    theme_color: "#fdfdfc",
    icons: [
      { src: "/favicon.png", sizes: "48x48", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}
