import type { IdeToolId, OsId } from "@/components/integrations/integrationOs";
import { hasAnyCodingAgent, type OnboardingProductSelection } from "@/lib/onboardingProducts";

export type OnboardingInstallSegment = "coding_agents" | "web" | "desktop_apps";

export function activeOnboardingInstallSegments(
  selection: OnboardingProductSelection
): OnboardingInstallSegment[] {
  const segments: OnboardingInstallSegment[] = [];
  if (hasAnyCodingAgent(selection)) segments.push("coding_agents");
  if (selection.web) segments.push("web");
  if (selection.desktop_apps) segments.push("desktop_apps");
  return segments;
}

export function onboardingInstallStepNumber(
  segments: OnboardingInstallSegment[],
  segment: OnboardingInstallSegment
): number {
  const index = segments.indexOf(segment);
  return index >= 0 ? index + 1 : 1;
}

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
  wantsDesktopApps: boolean;
  installOs: OsId;
  browserStoreClicked: boolean;
  codingAgentsSetupCopied: boolean;
  desktopAppsCommandCopied: boolean;
  desktopAppsDownloadClicked: boolean;
}): boolean {
  const webOk = !input.wantsWeb || input.browserStoreClicked;
  const agentsOk = !input.wantsCodingAgents || input.codingAgentsSetupCopied;
  const desktopOk =
    !input.wantsDesktopApps ||
    (input.installOs === "windows"
      ? input.desktopAppsDownloadClicked
      : input.desktopAppsCommandCopied);
  return webOk && agentsOk && desktopOk;
}

export function showBrowserTryLinksOnDone(browserStoreClicked: boolean): boolean {
  return browserStoreClicked;
}
