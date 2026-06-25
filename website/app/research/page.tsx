import { ResearchLabsPage } from "@/components/ResearchLabsPage";
import { ContentPageJsonLd } from "@/components/JsonLd";
import { RESEARCH_FAQS } from "@/lib/researchContent";
import { buildPageMetadata } from "@/lib/seo";

const RESEARCH_DESCRIPTION =
  "Research and conceptual architecture for prompt optimisation. MIT and arXiv sources on instruction contracts, automatic prompt optimization, and a heuristic demo.";

export const metadata = buildPageMetadata({
  title: "Prompt Engineering Research & Architecture — Promptly",
  description: RESEARCH_DESCRIPTION,
  path: "/research",
  keywords: [
    "prompt optimisation demo",
    "prompt engineering",
    "AI instruction contracts",
    "Promptly Labs research"
  ]
});

export default function ResearchPage() {
  return (
    <>
      <ContentPageJsonLd
        path="/research"
        name="Prompt Engineering Research & Architecture — Promptly"
        description={RESEARCH_DESCRIPTION}
        faqs={[...RESEARCH_FAQS]}
      />
      <ResearchLabsPage />
    </>
  );
}
