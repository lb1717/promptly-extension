import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Promptly Labs"
};

export default function ExtensionSignInLayout({ children }: { children: ReactNode }) {
  return children;
}
