import type { IdeToolId } from "@/components/integrations/integrationOs";

export const ONBOARDING_AGENT_LABELS: Record<IdeToolId, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  cursor: "Cursor"
};

const AGENT_ORDER: IdeToolId[] = ["claude_code", "codex", "cursor"];

export function sortSetupAgents(agents: IdeToolId[]): IdeToolId[] {
  return AGENT_ORDER.filter((id) => agents.includes(id));
}

export function formatSetupAgentList(agents: IdeToolId[]): string {
  const labels = sortSetupAgents(agents).map((id) => ONBOARDING_AGENT_LABELS[id]);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function canFinishOnboardingInstall(input: {
  wantsWeb: boolean;
  wantsCodingAgents: boolean;
  browserStoreClicked: boolean;
  codingAgentsSetupCopied: boolean;
}): boolean {
  const webOk = !input.wantsWeb || input.browserStoreClicked;
  const agentsOk = !input.wantsCodingAgents || input.codingAgentsSetupCopied;
  return webOk && agentsOk;
}

export function showBrowserTryLinksOnDone(browserStoreClicked: boolean): boolean {
  return browserStoreClicked;
}
