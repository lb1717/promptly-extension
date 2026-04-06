import { SectionHeader } from "@/components/ui/SectionHeader";
import { COMPARISON_ROWS, type ComparisonMark } from "@/lib/constants";

function mark(value: ComparisonMark) {
  if (value === "yes") return "✓";
  if (value === "partial") return "◐";
  return "✕";
}

export type ComparisonTableProps = {
  sectionId?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  /** First comparison column (e.g. Promptly / Engineered prompts) */
  primaryLabel?: string;
  /** Second comparison column */
  secondaryLabel?: string;
  rows?: readonly { feature: string; primary: ComparisonMark; secondary: ComparisonMark }[];
};

const productRows = COMPARISON_ROWS.map((row) => ({
  feature: row.feature,
  primary: row.withPromptly,
  secondary: row.withoutPromptly
}));

export function ComparisonTable({
  sectionId = "compare",
  eyebrow = "Compare",
  title = "The difference better prompts make",
  subtitle = "Promptly vs. manual prompting across ChatGPT, Claude, and Gemini.",
  primaryLabel = "Promptly",
  secondaryLabel = "Without Promptly",
  rows = productRows
}: ComparisonTableProps) {
  return (
    <section id={sectionId} className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.06] text-violet-100 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3">Capability</th>
                <th className="px-4 py-3 text-center text-white">{primaryLabel}</th>
                <th className="px-4 py-3 text-center">{secondaryLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="border-t border-white/[0.06]">
                  <td className="px-4 py-3 text-violet-100/90">{row.feature}</td>
                  <td className="bg-violet-500/[0.08] px-4 py-3 text-center text-base text-violet-100 backdrop-blur-sm">
                    {mark(row.primary)}
                  </td>
                  <td className="px-4 py-3 text-center text-violet-200/80">{mark(row.secondary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
