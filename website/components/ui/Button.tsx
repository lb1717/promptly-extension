import Link from "next/link";
import { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
};

export function Button({ href, children, variant = "primary", className }: Props) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-all";
  const tone =
    variant === "primary"
      ? "bg-ink text-cream shadow-card hover:bg-neutral-800"
      : "border border-line bg-cream text-ink hover:bg-cream-dark";
  const classes = [base, tone, className].filter(Boolean).join(" ");

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
