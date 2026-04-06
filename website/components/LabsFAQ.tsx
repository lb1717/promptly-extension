import { LABS_FAQ } from "@/lib/labsContent";

export function LabsFAQ() {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-10 text-center text-sm font-semibold uppercase tracking-[0.2em] text-violet-200/80">FAQ</h2>
        <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04] px-2 backdrop-blur-md sm:px-4">
          {LABS_FAQ.map((item) => (
            <details key={item.q} className="group px-3 py-1 sm:px-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-left font-medium text-white marker:hidden [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <span className="shrink-0 text-violet-300/80 transition group-open:rotate-180">▼</span>
              </summary>
              <p className="pb-4 pl-0.5 text-sm leading-relaxed text-violet-100/80">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
