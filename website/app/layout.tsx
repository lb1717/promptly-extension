import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "Promptly | Better prompts, better results",
  description: "Premium landing page for the Promptly Chrome extension."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
