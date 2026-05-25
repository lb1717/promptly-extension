export const SITE = {
  name: "Promptly",
  navBrand: "Promptly Labs",
  chromeStoreUrl: "https://chromewebstore.google.com/detail/promptly/cljggdddakpcdflbnkmpebldloekcbff",
  /** Production Chrome extension ID — used to sync Firebase session from /account to the extension. */
  chromeExtensionId: "cljggdddakpcdflbnkmpebldloekcbff"
};

export const NAV_LINKS = [
  { label: "Product", href: "/product" },
  { label: "Labs", href: "/labs" }
];

export const DEMO_TIMING = {
  cursorAppearDelay: 0.4,
  moveDuration: 1.3,
  clickDuration: 0.22,
  disappearDelay: 0.45,
  loopDelay: 1.35
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
