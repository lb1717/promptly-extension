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
        <div className="overflow-hidden rounded-2xl border border-line bg-cream">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream-dark text-muted">
              <tr>
                <th className="px-4 py-3">Capability</th>
                <th className="px-4 py-3 text-center text-ink">{primaryLabel}</th>
                <th className="px-4 py-3 text-center">{secondaryLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="border-t border-line">
                  <td className="px-4 py-3 text-muted">{row.feature}</td>
                  <td className="bg-cream-dark px-4 py-3 text-center text-base text-ink">
                    {mark(row.primary)}
                  </td>
                  <td className="px-4 py-3 text-center text-faint">{mark(row.secondary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
