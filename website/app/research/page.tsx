import type { Metadata } from "next";
import { ResearchLabsPage } from "@/components/ResearchLabsPage";

export const metadata: Metadata = {
  title: "Promptly Research Labs",
  description:
    "Conceptual architecture, prompt optimisation research, and a heuristic demo for how Promptly can turn a raw prompt into a clearer instruction contract."
};

export default function ResearchPage() {
  return <ResearchLabsPage />;
}
