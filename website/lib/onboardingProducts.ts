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
  desktop_apps: false,
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
  label: "Web AI Browsers",
  description: "ChatGPT, Claude, and Gemini in Chrome or Edge"
};

export const ONBOARDING_CODING_AGENTS_OPTION = {
  label: "Claude Code, Codex & Cursor",
  description: "Coding agents in terminal or desktop"
};

export const ONBOARDING_DESKTOP_APPS_OPTION = {
  label: "Claude/ChatGPT Desktop Apps",
  description: "Claude Cowork, ChatGPT Desktop Chat etc."
};

export function isCodingAgentsGroupSelected(selected: OnboardingProductSelection): boolean {
  return hasAnyCodingAgent(selected);
}

export function setCodingAgentsGroupSelected(
  selected: OnboardingProductSelection,
  enabled: boolean
): OnboardingProductSelection {
  return {
    ...selected,
    claude_code: enabled,
    cursor: enabled,
    codex: enabled
  };
}
