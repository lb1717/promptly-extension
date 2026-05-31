import type { Metadata } from "next";
import { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Account",
  path: "/account",
  noIndex: true
});

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
