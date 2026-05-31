import type { Metadata } from "next";
import { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Get Started with Promptly",
  description:
    "Install the Promptly browser extension and connect your account to improve AI prompts in one click inside ChatGPT, Claude, and Gemini.",
  path: "/get-started"
});

export default function GetStartedLayout({ children }: { children: ReactNode }) {
  return children;
}
