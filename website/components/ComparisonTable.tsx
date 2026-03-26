import { SectionHeader } from "@/components/ui/SectionHeader";
import { COMPARISON_ROWS } from "@/lib/constants";

function mark(value: "yes" | "partial" | "no") {
  if (value === "yes") return "✓";
  if (value === "partial") return "◐";
  return "✕";
}

export function ComparisonTable() {
  return (
    <section id="compare" className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Compare"
          title="The difference better prompts make"
          subtitle="Promptly vs. manual prompting across ChatGPT, Claude, and Gemini."
        />
        <div className="overflow-hidden rounded-2xl border border-violet-300/20 bg-white/[0.03]">
          <table className="w-full text-left text-sm">
            <thead className="bg-violet-500/15 text-violet-100">
              <tr>
                <th className="px-4 py-3">Capability</th>
                <th className="px-4 py-3 text-center text-white">Promptly</th>
                <th className="px-4 py-3 text-center">Without Promptly</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature} className="border-t border-violet-300/10">
                  <td className="px-4 py-3 text-violet-50">{row.feature}</td>
                  <td className="bg-violet-500/10 px-4 py-3 text-center text-base text-violet-100">
                    {mark(row.withPromptly)}
                  </td>
                  <td className="px-4 py-3 text-center text-violet-200/80">{mark(row.withoutPromptly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
