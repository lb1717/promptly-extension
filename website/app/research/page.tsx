import { ResearchLabsPage } from "@/components/ResearchLabsPage";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Prompt Engineering Research & Architecture — Promptly",
  description:
    "Research and conceptual architecture for prompt optimisation. MIT and arXiv sources on instruction contracts, automatic prompt optimization, and a heuristic demo.",
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
