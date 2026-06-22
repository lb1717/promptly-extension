import type { IdeToolId } from "@/components/integrations/integrationOs";

export type OnboardingProductSelection = {
  web: boolean;
  desktop_apps: boolean;
  claude_code: boolean;
  cursor: boolean;
  codex: boolean;
};

export const DEFAULT_ONBOARDING_PRODUCT_SELECTION: OnboardingProductSelection = {
  web: true,
  desktop_apps: true,
  claude_code: true,
  cursor: true,
  codex: true
};

export function hasAnyCodingAgent(selected: OnboardingProductSelection): boolean {
  return selected.claude_code || selected.cursor || selected.codex;
}

export function hasAnyOnboardingProduct(selected: OnboardingProductSelection): boolean {
  return selected.web || selected.desktop_apps || hasAnyCodingAgent(selected);
}

export function selectedCodingAgentIds(selected: OnboardingProductSelection): IdeToolId[] {
  const ids: IdeToolId[] = [];
  if (selected.claude_code) ids.push("claude_code");
  if (selected.cursor) ids.push("cursor");
  if (selected.codex) ids.push("codex");
  return ids;
}

export type OnboardingProductKey = keyof OnboardingProductSelection;

export const ONBOARDING_WEB_OPTION = {
  key: "web" as const,
  label: "Web Browser",
  description: "ChatGPT, Claude, and Gemini in Chrome or Edge"
};

export const ONBOARDING_DESKTOP_APPS_OPTION = {
  label: "Desktop Apps",
  description: "Claude Code, Cowork, Codex, Cursor, etc."
};

/** Desktop apps and coding agents share one install command — keep agent flags in sync. */
export function setDesktopAppsSelected(
  selected: OnboardingProductSelection,
  enabled: boolean
): OnboardingProductSelection {
  return {
    ...selected,
    desktop_apps: enabled,
    claude_code: enabled,
    cursor: enabled,
    codex: enabled
  };
}
