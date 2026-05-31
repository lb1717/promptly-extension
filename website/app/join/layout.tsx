import type { Metadata } from "next";
import { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Join",
  path: "/join",
  noIndex: true
});

export default function JoinLayout({ children }: { children: ReactNode }) {
  return children;
}
