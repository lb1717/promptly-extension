import type { ReactNode } from "react";

export function StepValidation({ items, compact }: { items: string[]; compact?: boolean }) {
  if (compact) {
    return (
      <div className="mt-2 rounded-md border border-emerald-500/20 bg-emerald-50/70 px-2.5 py-1.5">
        <p className="text-[10px] font-semibold leading-snug text-emerald-900">Success looks like:</p>
        <ul className="mt-0.5 list-inside list-disc text-[10px] leading-snug text-emerald-900/85">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-50/80 px-3 py-2.5">
      <p className="text-xs font-semibold text-emerald-900">Success looks like:</p>
      <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-emerald-900/85">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function StepNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-50/80 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
      {children}
    </div>
  );
}
