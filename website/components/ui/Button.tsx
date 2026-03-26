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
      ? "bg-violet-500 text-white shadow-[0_12px_35px_rgba(139,92,246,0.45)] hover:bg-violet-400"
      : "border border-violet-300/30 bg-white/5 text-violet-100 hover:bg-white/10";
  const classes = [base, tone, className].filter(Boolean).join(" ");

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
