import { BENEFITS } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function Benefits() {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Benefits"
          title="Built for faster, stronger AI outcomes"
          subtitle="Promptly improves quality while reducing effort in everyday prompting."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-violet-300/20 bg-white/[0.04] p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.06]"
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
