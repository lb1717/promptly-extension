const CHROME_EXTENSION_ID = "mioebkaecngedfgedplfmcaaccooojpj";

export type BrowserExtensionTarget = {
  key: "chrome" | "edge" | "firefox" | "safari" | "chromium";
  name: string;
  extensionId: string;
  installUrl: string;
  primary?: boolean;
};

const RAW_BROWSER_EXTENSION_TARGETS: BrowserExtensionTarget[] = [
  {
    key: "chrome",
    name: "Google Chrome",
    extensionId: CHROME_EXTENSION_ID,
    installUrl: `https://chromewebstore.google.com/detail/promptly/${CHROME_EXTENSION_ID}`,
    primary: true
  },
  {
    key: "edge",
    name: "Microsoft Edge",
    extensionId: String(process.env.NEXT_PUBLIC_EDGE_EXTENSION_ID || "").trim(),
    installUrl: String(
      process.env.NEXT_PUBLIC_EDGE_ADDONS_URL ||
        "https://microsoftedge.microsoft.com/addons/detail/promptly/kjmhecmpdjbcdpnifekoabjhchlphiof"
    ).trim()
  },
  {
    key: "firefox",
    name: "Firefox",
    extensionId: "promptly@promptly-labs.com",
    installUrl: String(process.env.NEXT_PUBLIC_FIREFOX_ADDONS_URL || "").trim()
  },
  {
    key: "safari",
    name: "Safari",
    extensionId: String(process.env.NEXT_PUBLIC_SAFARI_EXTENSION_ID || "").trim(),
    installUrl: String(process.env.NEXT_PUBLIC_SAFARI_EXTENSION_URL || "").trim()
  }
];

export const BROWSER_EXTENSION_TARGETS = RAW_BROWSER_EXTENSION_TARGETS.filter(
  (target) => target.extensionId || target.primary
);

export const SITE = {
  name: "Promptly",
  navBrand: "Promptly Labs",
  /** Public general onboarding funnel (not sales invite links). */
  getStartedPath: "/get-started",
  /** Shareable desktop app download — always resolves the latest release. */
  companionPath: "/companion",
  /** Install-only desktop setup (get-started install step). */
  companionInstallPath: "/companion/install",
  chromeStoreUrl: `https://chromewebstore.google.com/detail/promptly/${CHROME_EXTENSION_ID}`,
  edgeAddonsUrl: String(
    process.env.NEXT_PUBLIC_EDGE_ADDONS_URL ||
      "https://microsoftedge.microsoft.com/addons/detail/promptly/kjmhecmpdjbcdpnifekoabjhchlphiof"
  ).trim(),
  /** Production Chrome extension ID — used to sync Firebase session from /account to the extension. */
  chromeExtensionId: CHROME_EXTENSION_ID,
  browserExtensionTargets: BROWSER_EXTENSION_TARGETS
};

export const NAV_LINKS = [
  { label: "Product", href: "/" },
  { label: "Research", href: "/research" }
];

export const DEMO_TIMING = {
  cursorAppearDelay: 0.4,
  moveDuration: 1.3,
  clickDuration: 0.22,
  disappearDelay: 0.45,
  loopDelay: 1.35,
  /** How long the finished “Prompt Improved” state stays visible before the demo replays. */
  doneScreenHoldMs: 10_000
};

export const BENEFITS = [
  {
    title: "Prompt intent",
    body: "Promptly sharpens what you mean so outputs track your goal—not a vague first guess."
  },
  {
    title: "Efficient prompts",
    body: "Rewritten for clarity and structure—the format LLMs read best—so you spend less on input and retries."
  },
  {
    title: "Structured outputs",
    body: "Clear output instructions steer the model toward what matters, not long unfocused text."
  },
  {
    title: "Write less, get more",
    body: "One click replaces minutes of manual prompt editing before every send."
  },
  {
    title: "Track prompt performance",
    body: "See prompt volume and AI use over time—for individuals and firms measuring efficiency."
  }
] as const;

export type BenefitItem = {
  title: string;
  body: string;
};

export const COMPARISON_ROWS = [
  { feature: "Better prompt clarity", withPromptly: "yes", withoutPromptly: "partial" },
  { feature: "Faster prompt writing", withPromptly: "yes", withoutPromptly: "partial" },
  { feature: "Structured outputs", withPromptly: "yes", withoutPromptly: "no" },
  { feature: "Less trial & error", withPromptly: "yes", withoutPromptly: "no" },
  { feature: "Cross-tool consistency", withPromptly: "yes", withoutPromptly: "partial" },
  { feature: "Works in ChatGPT / Claude / Gemini", withPromptly: "yes", withoutPromptly: "yes" }
] as const;

export type ComparisonMark = "yes" | "partial" | "no";
