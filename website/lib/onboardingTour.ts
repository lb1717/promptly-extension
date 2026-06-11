import { formatSetupAgentList } from "@/lib/onboardingInstallProgress";
import type { IdeToolId } from "@/components/integrations/integrationOs";

export type OnboardingTourStep = "account-nav" | "account-section" | "statistics-link" | "complete";

export type OnboardingTourSetup = {
  web: boolean;
  codingAgents: boolean;
  setupAgents?: IdeToolId[];
};

export type OnboardingTourState = {
  active: boolean;
  step: OnboardingTourStep;
  setup: OnboardingTourSetup;
};

export const ONBOARDING_TOUR_STORAGE_KEY = "promptly_onboarding_tour";
export const ONBOARDING_TOUR_EVENT = "promptly-onboarding-tour";

export const ONBOARDING_TOUR_TARGETS: Record<Exclude<OnboardingTourStep, "complete">, string> = {
  "account-nav": '[data-onboarding-tour="account-nav"]',
  "account-section": '[data-onboarding-tour="account-section"]',
  "statistics-link": '[data-onboarding-tour="statistics-link"]'
};

export function readOnboardingTour(): OnboardingTourState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ONBOARDING_TOUR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingTourState;
    if (!parsed?.active || !parsed.step || !parsed.setup) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOnboardingTour(state: OnboardingTourState | null) {
  if (typeof window === "undefined") return;
  if (!state) {
    sessionStorage.removeItem(ONBOARDING_TOUR_STORAGE_KEY);
  } else {
    sessionStorage.setItem(ONBOARDING_TOUR_STORAGE_KEY, JSON.stringify(state));
  }
  window.dispatchEvent(new CustomEvent(ONBOARDING_TOUR_EVENT));
}

export function startOnboardingTour(setup: OnboardingTourSetup) {
  writeOnboardingTour({ active: true, step: "account-nav", setup });
}

export function advanceOnboardingTour(step: OnboardingTourStep) {
  const current = readOnboardingTour();
  if (!current?.active) return;
  writeOnboardingTour({ ...current, step });
}

export function endOnboardingTour() {
  writeOnboardingTour(null);
}

export function onboardingTourPromptTarget(setup: OnboardingTourSetup): string {
  const { web, codingAgents, setupAgents = [] } = setup;
  const agentList = formatSetupAgentList(setupAgents);

  if (web && codingAgents) {
    return agentList
      ? `your browser and ${agentList}`
      : "your browser and coding agents";
  }
  if (web) return "ChatGPT, Claude, or Gemini in your browser";
  if (codingAgents) return agentList || "your coding agents";
  return "your AI tools";
}
