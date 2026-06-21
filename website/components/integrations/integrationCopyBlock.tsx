"use client";

import { useCallback, useState } from "react";

async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to legacy copy */
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function CopyBlock({
  lines,
  label,
  onCopy
}: {
  lines: string[];
  label?: string;
  onCopy?: () => void;
}) {
  const text = lines.join("\n");
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    const ok = await writeClipboardText(text);
    if (!ok) {
      setCopied(false);
      return;
    }
    setCopied(true);
    onCopy?.();
    window.setTimeout(() => setCopied(false), 2000);
  }, [text, onCopy]);

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
