"use client";

import {
  isCodingAgentsGroupSelected,
  ONBOARDING_CODING_AGENTS_OPTION,
  ONBOARDING_DESKTOP_APPS_OPTION,
  ONBOARDING_WEB_OPTION,
  setCodingAgentsGroupSelected,
  type OnboardingProductSelection
} from "@/lib/onboardingProducts";

function SelectionRow({
  checked,
  onChange,
  label,
  description
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
        checked ? "border-ink bg-cream-dark shadow-sm" : "border-line bg-cream hover:bg-cream-dark/60"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded border-line text-ink focus:ring-ink"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}

export function GetStartedAiSelection({
  value,
  onChange
}: {
  value: OnboardingProductSelection;
  onChange: (next: OnboardingProductSelection) => void;
}) {
  const codingAgentsChecked = isCodingAgentsGroupSelected(value);

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-muted">
        You can always add more from <span className="font-medium text-ink">Account → Integrations</span> later.
      </p>
      <div className="space-y-2">
        <SelectionRow
          checked={value.desktop_apps}
          onChange={(checked) => onChange({ ...value, desktop_apps: checked })}
          label={ONBOARDING_DESKTOP_APPS_OPTION.label}
          description={ONBOARDING_DESKTOP_APPS_OPTION.description}
        />
        <SelectionRow
          checked={value.web}
          onChange={(checked) => onChange({ ...value, web: checked })}
          label={ONBOARDING_WEB_OPTION.label}
          description={ONBOARDING_WEB_OPTION.description}
        />
        <SelectionRow
          checked={codingAgentsChecked}
          onChange={(checked) => onChange(setCodingAgentsGroupSelected(value, checked))}
          label={ONBOARDING_CODING_AGENTS_OPTION.label}
          description={ONBOARDING_CODING_AGENTS_OPTION.description}
        />
      </div>
    </div>
  );
}
