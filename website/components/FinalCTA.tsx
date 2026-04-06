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
  title = "Start writing better prompts today",
  description = "Upgrade every prompt with one click and get more reliable AI outputs.",
  primaryHref = SITE.chromeStoreUrl,
  primaryLabel = "Add Promptly to Chrome",
  secondaryHref,
  secondaryLabel
}: FinalCTAProps) {
  return (
    <section className="px-4 pb-20 pt-10">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-center backdrop-blur-md sm:p-12">
        <h2 className="mb-3 text-3xl font-semibold text-white sm:text-4xl">{title}</h2>
        <p className="mb-7 text-violet-100/85">{description}</p>
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
