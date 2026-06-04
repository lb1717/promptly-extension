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

  const heroCtaClass =
    "relative overflow-hidden px-8 py-4 text-base font-bold uppercase tracking-wide sm:px-10 sm:py-4 sm:text-lg";

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
          <h1 className="mb-4 mt-1 flex w-full justify-center font-semibold leading-tight text-ink">
            <span className="text-center text-[clamp(1.75rem,5vw,3.75rem)] sm:whitespace-nowrap">
              Improve and Track AI Use
            </span>
          </h1>
          <p className="mx-auto mb-5 max-w-2xl text-muted sm:mb-6">
            Promptly Labs is an extension that optimizes prompts and measures how efficiently you are using AI.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              href={SITE.getStartedPath}
              className={ctaShouldShine ? `promptly-cta-shine ${heroCtaClass}` : heroCtaClass}
            >
              GET STARTED
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
