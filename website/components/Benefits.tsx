import { BENEFITS } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/SectionHeader";

export type BenefitItem = { title: string; body: string };

export type BenefitsProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  items?: readonly BenefitItem[];
};

export function Benefits({
  eyebrow = "Benefits",
  title = "Built for faster, stronger AI outcomes",
  subtitle = "Promptly improves quality while reducing effort in everyday prompting.",
  items = BENEFITS
}: BenefitsProps) {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/[0.055]"
            >
              <h3 className="mb-2 text-lg font-semibold text-white">{item.title}</h3>
              <p className="text-sm text-violet-100/80">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
