"use client";

import type { OsId } from "@/components/integrations/integrationOs";
import { AppleOsIcon, WindowsOsIcon } from "@/components/onboarding/OsToggleIcons";

const OS_OPTIONS: Array<{ id: OsId; label: string }> = [
  { id: "mac", label: "Mac" },
  { id: "windows", label: "Windows" }
];

export function OnboardingInstallOsToggle({
  os,
  onChange
}: {
  os: OsId;
  onChange: (os: OsId) => void;
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Operating system">
      {OS_OPTIONS.map(({ id, label }) => {
        const selected = os === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
              selected
                ? "border-ink bg-ink text-cream"
                : "border-line bg-cream text-ink hover:bg-cream-dark"
            }`}
          >
            {id === "mac" ? (
              <AppleOsIcon className="h-4 w-4 shrink-0" />
            ) : (
              <WindowsOsIcon className="h-4 w-4 shrink-0" />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
