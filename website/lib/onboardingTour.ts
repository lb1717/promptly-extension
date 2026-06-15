import { formatSetupAgentList } from "@/lib/onboardingInstallProgress";
import type { IdeToolId } from "@/components/integrations/integrationOs";

export type OnboardingTourStep =
  | "account-nav"
  | "statistics-filters"
  | "account-settings-tab"
  | "account-section"
  | "account-token-usage"
  | "statistics-tab"
  | "complete";

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
export const ONBOARDING_AWAITING_TUTORIAL_KEY = "promptly_onboarding_awaiting_tutorial";
export const ONBOARDING_TOUR_EVENT = "promptly-onboarding-tour";

export const ONBOARDING_TOUR_TARGETS: Record<Exclude<OnboardingTourStep, "complete">, string> = {
  "account-nav": '[data-onboarding-tour="account-nav"]',
  "statistics-filters": '[data-onboarding-tour="statistics-filters"]',
  "account-settings-tab": '[data-onboarding-tour="account-settings-tab"]',
  "account-section": '[data-onboarding-tour="account-section"]',
  "account-token-usage": '[data-onboarding-tour="account-token-usage"]',
  "statistics-tab": '[data-onboarding-tour="statistics-tab"]'
};

/** Steps while the Account Settings tab should be visible. */
export const ONBOARDING_TOUR_ACCOUNT_STEPS: OnboardingTourStep[] = [
  "account-settings-tab",
  "account-section",
  "account-token-usage",
  "statistics-tab"
];

/** Steps while the Statistics tab should be visible. */
export const ONBOARDING_TOUR_STATISTICS_STEPS: OnboardingTourStep[] = ["statistics-filters", "complete"];

export function isOnboardingTourAccountPage(pathname: string): boolean {
  return pathname === "/account" || pathname === "/account/";
}

export function isOnboardingTourStatisticsPage(pathname: string): boolean {
  return (
    pathname === "/account" ||
    pathname === "/account/" ||
    pathname === "/account/statistics" ||
    pathname.startsWith("/account/statistics/")
  );
}

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
  clearAwaitingTutorial();
  writeOnboardingTour({ active: true, step: "account-nav", setup });
}

export function setAwaitingTutorial(setup: OnboardingTourSetup) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ONBOARDING_AWAITING_TUTORIAL_KEY, JSON.stringify(setup));
  window.dispatchEvent(new CustomEvent(ONBOARDING_TOUR_EVENT));
}

export function readAwaitingTutorial(): OnboardingTourSetup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ONBOARDING_AWAITING_TUTORIAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingTourSetup;
    if (typeof parsed?.web !== "boolean" || typeof parsed?.codingAgents !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAwaitingTutorial() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ONBOARDING_AWAITING_TUTORIAL_KEY);
  window.dispatchEvent(new CustomEvent(ONBOARDING_TOUR_EVENT));
}

export function beginOnboardingTutorial(setup: OnboardingTourSetup) {
  startOnboardingTour(setup);
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
