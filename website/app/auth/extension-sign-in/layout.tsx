import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_TAB_TITLE } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: SITE_TAB_TITLE }
};

export default function ExtensionSignInLayout({ children }: { children: ReactNode }) {
  return children;
}
