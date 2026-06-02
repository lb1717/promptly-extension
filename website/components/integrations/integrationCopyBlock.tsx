"use client";

import { useCallback, useState } from "react";

export function CopyBlock({ lines, label }: { lines: string[]; label?: string }) {
  const text = lines.join("\n");
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [text]);

  return (
    <div className="relative mt-2 overflow-hidden rounded-xl border border-line bg-ink">
      {label ? (
        <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
          {label}
        </div>
      ) : null}
      <pre className="overflow-x-auto whitespace-pre-wrap p-3 pr-20 font-mono text-xs leading-relaxed text-cream">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="absolute right-2 top-2 rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-cream hover:bg-white/20"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
