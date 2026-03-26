import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";

export function FinalCTA() {
  return (
    <section className="px-4 pb-20 pt-10">
      <div className="mx-auto max-w-4xl rounded-3xl border border-violet-300/20 bg-gradient-to-r from-violet-600/25 to-fuchsia-500/20 p-8 text-center sm:p-12">
        <h2 className="mb-3 text-3xl font-semibold text-white sm:text-4xl">Start writing better prompts today</h2>
        <p className="mb-7 text-violet-100/85">Upgrade every prompt with one click and get more reliable AI outputs.</p>
        <Button href={SITE.chromeStoreUrl} className="px-7 py-3.5 text-base">
          Add Promptly to Chrome
        </Button>
      </div>
    </section>
  );
}
