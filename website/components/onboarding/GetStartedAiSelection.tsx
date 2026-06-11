"use client";

import {
  ONBOARDING_PRODUCT_OPTIONS,
  type OnboardingProductSelection
} from "@/lib/onboardingProducts";

export function GetStartedAiSelection({
  value,
  onChange
}: {
  value: OnboardingProductSelection;
  onChange: (next: OnboardingProductSelection) => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-muted">
        You can always add more from <span className="font-medium text-ink">Account → Integrations</span> later.
      </p>
      <div className="space-y-2">
        {ONBOARDING_PRODUCT_OPTIONS.map((option) => {
          const checked = value[option.key];
          return (
            <label
              key={option.key}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                checked ? "border-ink bg-cream-dark shadow-sm" : "border-line bg-cream hover:bg-cream-dark/60"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange({ ...value, [option.key]: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-ink focus:ring-ink"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  {option.accent ? (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: option.accent }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="font-semibold text-ink">{option.label}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
