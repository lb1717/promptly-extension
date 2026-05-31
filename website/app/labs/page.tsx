import { ResearchLabsPage } from "@/components/ResearchLabsPage";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Prompt Engineering Research & Architecture",
  description:
    "Conceptual architecture and prompt optimisation research grounded in MIT and arXiv sources — how Promptly turns a raw prompt into a clearer instruction contract.",
  path: "/labs",
  keywords: [
    "prompt engineering research",
    "prompt optimisation",
    "instruction drift",
    "automatic prompt optimization",
    "Promptly Labs"
  ]
});

export default function LabsPage() {
  return <ResearchLabsPage variant="labs" />;
}
