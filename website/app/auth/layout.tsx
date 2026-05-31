import type { Metadata } from "next";
import { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Sign In",
  path: "/auth",
  noIndex: true
});

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
