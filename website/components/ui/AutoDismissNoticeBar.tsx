"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** How long the bar stays fully visible before fading out. */
  dismissAfterMs?: number;
  className?: string;
  innerClassName?: string;
};

const COLLAPSE_MS = 520;

/**
 * Full-width notice that fades out and collapses so content below animates upward.
 */
export function AutoDismissNoticeBar({
  children,
  dismissAfterMs = 2000,
  className = "",
  innerClassName = "rounded-xl border border-line bg-cream-dark px-4 py-3 text-xs leading-relaxed text-muted"
}: Props) {
  const [dismissing, setDismissing] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const showTimer = window.setTimeout(() => setDismissing(true), dismissAfterMs);
    return () => window.clearTimeout(showTimer);
  }, [dismissAfterMs]);

  useEffect(() => {
    if (!dismissing) {
      return;
    }
    const hideTimer = window.setTimeout(() => setHidden(true), COLLAPSE_MS + 40);
    return () => window.clearTimeout(hideTimer);
  }, [dismissing]);

  if (hidden) {
    return null;
  }

  return (
    <div
      className={`grid overflow-hidden transition-[grid-template-rows,margin-bottom,opacity] duration-[520ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${
        dismissing ? "mb-0 grid-rows-[0fr] opacity-0" : "mb-6 grid-rows-[1fr] opacity-100"
      } ${className}`}
      aria-live="polite"
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={`transition-[transform,opacity] duration-[520ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${
            dismissing ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100"
          }`}
        >
          <div className={innerClassName}>{children}</div>
        </div>
      </div>
    </div>
  );
}
