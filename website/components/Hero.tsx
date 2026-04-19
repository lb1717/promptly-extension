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
            <div className="group relative grid h-[78px] w-[78px] place-items-center rounded-2xl border border-white/70 bg-white/[0.02] p-2.5 transition-all duration-300 hover:bg-white/[0.08] hover:shadow-[0_0_28px_rgba(255,255,255,0.26)]">
              <img
                src="/images/promptly-product-icon.png"
                alt="Promptly logo"
                className="h-[54px] w-[54px] object-contain"
              />
            </div>
          </div>
          <h1 className="mb-4 text-4xl font-semibold leading-tight text-white sm:text-6xl">
            Write better prompts.
          </h1>
          <p className="mx-auto mb-5 max-w-2xl text-violet-100/80 sm:mb-6">
            Promptly improves your prompt in one click directly inside ChatGPT, Claude, and Gemini, so you get
            better and faster LLM outputs.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              href={SITE.chromeStoreUrl}
              className={ctaShouldShine ? "promptly-cta-shine relative overflow-hidden" : "relative overflow-hidden"}
            >
              Add Promptly to Chrome
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
