"use client";

import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";
import { useEffect, useRef, useState } from "react";

export function Hero() {
  const [ctaShouldShine, setCtaShouldShine] = useState(false);
  const shineResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onDemoComplete = () => {
      setCtaShouldShine(false);
      if (shineResetTimerRef.current) {
        window.clearTimeout(shineResetTimerRef.current);
      }
      const triggerTimer = window.setTimeout(() => {
        setCtaShouldShine(true);
        shineResetTimerRef.current = window.setTimeout(() => setCtaShouldShine(false), 4200);
      }, 40);
      shineResetTimerRef.current = triggerTimer;
    };

    window.addEventListener("promptly-demo-animation-complete", onDemoComplete);
    return () => {
      window.removeEventListener("promptly-demo-animation-complete", onDemoComplete);
      if (shineResetTimerRef.current) {
        window.clearTimeout(shineResetTimerRef.current);
      }
    };
  }, []);

  return (
    <section className="relative overflow-hidden bg-transparent px-4 pb-4 pt-3 sm:pb-5 sm:pt-7">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-3 flex justify-center">
            <div className="group relative grid h-[78px] w-[78px] place-items-center rounded-2xl border border-line bg-cream p-2.5 transition-all duration-300 hover:shadow-card">
              <img
                src="/images/promptly-product-icon.png"
                alt="Promptly logo"
                className="h-[54px] w-[54px] object-contain"
              />
            </div>
          </div>
          <h1 className="mb-4 text-4xl font-semibold leading-tight text-ink sm:text-6xl">
            Prompts that match your intent.
          </h1>
          <p className="mx-auto mb-5 max-w-2xl text-muted sm:mb-6">
            Promptly rewrites your prompt in one click inside ChatGPT, Claude, and Gemini—clearer structure,
            tighter outputs, less wasted effort.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              href={SITE.getStartedPath}
              className={ctaShouldShine ? "promptly-cta-shine relative overflow-hidden" : "relative overflow-hidden"}
            >
              Get started
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
