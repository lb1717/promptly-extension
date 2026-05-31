import { ResearchLabsPage } from "@/components/ResearchLabsPage";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Prompt Optimisation Research & Heuristic Demo",
  description:
    "Conceptual architecture, prompt optimisation research, and a heuristic demo for how Promptly can turn a raw prompt into a clearer instruction contract.",
  path: "/research",
  keywords: [
    "prompt optimisation demo",
    "prompt engineering",
    "AI instruction contracts",
    "Promptly Labs research"
  ]
});

export default function ResearchPage() {
  return <ResearchLabsPage />;
}
