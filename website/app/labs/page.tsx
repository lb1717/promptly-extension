import { ResearchLabsPage } from "@/components/ResearchLabsPage";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Prompt Engineering Research & Architecture — Promptly Labs",
  description:
    "Research and conceptual architecture for prompt optimisation — not the Promptly browser extension. MIT and arXiv sources on instruction contracts and automatic prompt optimization.",
  path: "/labs",
  keywords: [
    "prompt engineering research",
    "prompt optimisation architecture",
    "instruction drift",
    "automatic prompt optimization",
    "MIT prompt engineering"
  ]
});

export default function LabsPage() {
  return <ResearchLabsPage variant="labs" />;
}
