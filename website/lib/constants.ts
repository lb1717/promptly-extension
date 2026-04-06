export const SITE = {
  name: "Promptly",
  navBrand: "Promptly Labs",
  chromeStoreUrl: "https://chromewebstore.google.com/detail/promptly/cljggdddakpcdflbnkmpebldloekcbff"
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
    title: "Better outputs instantly",
    body: "Promptly rewrites vague instructions into clear, actionable prompts before you hit send."
  },
  {
    title: "Save time on every prompt",
    body: "Reduce trial-and-error loops and get closer to useful output on the first response."
  },
  {
    title: "Works across top AI tools",
    body: "Use one consistent prompt-quality workflow inside ChatGPT, Claude, and Gemini."
  },
  {
    title: "No learning curve",
    body: "One click improves structure, intent clarity, and output format with no setup burden."
  },
  {
    title: "Consistency at scale",
    body: "Keep team outputs aligned by standardizing prompt quality across workflows."
  },
  {
    title: "Write less, get more",
    body: "Promptly transforms short ideas into high-quality instruction sets with better constraints."
  }
];

export const COMPARISON_ROWS = [
  { feature: "Better prompt clarity", withPromptly: "yes", withoutPromptly: "partial" },
  { feature: "Faster prompt writing", withPromptly: "yes", withoutPromptly: "partial" },
  { feature: "Structured outputs", withPromptly: "yes", withoutPromptly: "no" },
  { feature: "Less trial & error", withPromptly: "yes", withoutPromptly: "no" },
  { feature: "Cross-tool consistency", withPromptly: "yes", withoutPromptly: "partial" },
  { feature: "Works in ChatGPT / Claude / Gemini", withPromptly: "yes", withoutPromptly: "yes" }
] as const;

export type ComparisonMark = "yes" | "partial" | "no";
