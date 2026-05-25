import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";

export type FinalCTAProps = {
  title?: string;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function FinalCTA({
  title = "Better prompts, one click",
  description = "Install Promptly and improve every prompt before you send—no prompt engineering required.",
  primaryHref = SITE.chromeStoreUrl,
  primaryLabel = "Add Promptly to Chrome",
  secondaryHref,
  secondaryLabel
}: FinalCTAProps) {
  return (
    <section className="px-4 pb-20 pt-10">
      <div className="mx-auto max-w-4xl rounded-3xl border border-line bg-cream p-8 text-center shadow-card sm:p-12">
        <h2 className="mb-3 text-3xl font-semibold text-ink sm:text-4xl">{title}</h2>
        <p className="mb-7 text-muted">{description}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button href={primaryHref} className="px-7 py-3.5 text-base">
            {primaryLabel}
          </Button>
          {secondaryHref && secondaryLabel ? (
            <Button href={secondaryHref} variant="ghost">
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
