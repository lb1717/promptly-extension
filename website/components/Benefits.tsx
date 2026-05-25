import { BENEFITS, type BenefitItem } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/SectionHeader";

export type BenefitsProps = {
  sectionId?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  items?: readonly BenefitItem[];
};

export function Benefits({
  sectionId = "benefits",
  eyebrow = "Why Promptly",
  title = "Better prompts, less waste",
  subtitle = "Intent, efficiency, and structure—in one click across ChatGPT, Claude, and Gemini.",
  items = BENEFITS
}: BenefitsProps) {
  return (
    <section id={sectionId} className="border-t border-line px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-line bg-cream p-5 sm:p-6"
            >
              <h3 className="mb-2 text-lg font-semibold text-ink">{item.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
