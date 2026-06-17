import type { IdeToolId } from "@/components/integrations/integrationOs";

export type OnboardingProductSelection = {
  web: boolean;
  claude_code: boolean;
  cursor: boolean;
  codex: boolean;
};

export const DEFAULT_ONBOARDING_PRODUCT_SELECTION: OnboardingProductSelection = {
  web: true,
  claude_code: true,
  cursor: true,
  codex: true
};

export function hasAnyCodingAgent(selected: OnboardingProductSelection): boolean {
  return selected.claude_code || selected.cursor || selected.codex;
}

export function hasAnyOnboardingProduct(selected: OnboardingProductSelection): boolean {
  return selected.web || hasAnyCodingAgent(selected);
}

export function selectedCodingAgentIds(selected: OnboardingProductSelection): IdeToolId[] {
  const ids: IdeToolId[] = [];
  if (selected.claude_code) ids.push("claude_code");
  if (selected.cursor) ids.push("cursor");
  if (selected.codex) ids.push("codex");
  return ids;
}

export type OnboardingProductKey = keyof OnboardingProductSelection;

export const ONBOARDING_PRODUCT_OPTIONS: Array<{
  key: OnboardingProductKey;
  label: string;
  description: string;
  accent?: string;
}> = [
  {
    key: "claude_code",
    label: "Claude Code",
    description: "Anthropic’s coding agent in your terminal",
    accent: "#e8956f"
  },
  {
    key: "codex",
    label: "Codex",
    description: "OpenAI Codex desktop app",
    accent: "#22c997"
  },
  {
    key: "web",
    label: "Web AI Browsers",
    description: "ChatGPT, Claude, and Gemini in Chrome or Edge"
  },
  {
    key: "cursor",
    label: "Cursor",
    description: "Cursor IDE agent",
    accent: "#9333ea"
  }
];
