import type { Metadata } from "next";
import { ResearchLabsPage } from "@/components/ResearchLabsPage";

export const metadata: Metadata = {
  title: "Promptly Research Labs",
  description:
    "Conceptual architecture and prompt optimisation research grounded in MIT and arXiv sources — how Promptly turns a raw prompt into a clearer instruction contract."
};

export default function LabsPage() {
  return <ResearchLabsPage variant="labs" />;
}
