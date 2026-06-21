"use client";

import type { OsId } from "@/components/integrations/integrationOs";

export function OnboardingInstallOsToggle({
  os,
  onChange
}: {
  os: OsId;
  onChange: (os: OsId) => void;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="Operating system">
      {(["mac", "windows"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
            os === id ? "border-ink bg-ink text-cream" : "border-line text-muted hover:text-ink"
          }`}
        >
          {id === "mac" ? "Mac" : "Windows"}
        </button>
      ))}
    </div>
  );
}
