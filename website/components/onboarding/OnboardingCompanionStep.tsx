"use client";

import { openPromptlyCompanion } from "@/lib/openPromptlyCompanion";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export function OnboardingCompanionStep({ onFinish }: { onFinish: () => void }) {
  const [showDone, setShowDone] = useState(false);
  const [opened, setOpened] = useState(false);
  const openedRef = useRef(false);
  const leftWindowRef = useRef(false);

  useEffect(() => {
    const markLeft = () => {
      if (openedRef.current) {
        leftWindowRef.current = true;
      }
    };

    const markReturned = () => {
      if (openedRef.current && leftWindowRef.current) {
        setShowDone(true);
      }
    };

    window.addEventListener("blur", markLeft);
    window.addEventListener("focus", markReturned);
    const onVisibilityChange = () => {
      if (document.hidden) {
        markLeft();
      } else {
        markReturned();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("blur", markLeft);
      window.removeEventListener("focus", markReturned);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  function handleOpenCompanion() {
    openedRef.current = true;
    setOpened(true);
    void openPromptlyCompanion();
  }

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-neutral-900/45 backdrop-blur-md" aria-hidden />
      <div className="pointer-events-none fixed inset-0 z-[202] flex items-center justify-center p-4">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-line bg-cream p-8 text-center shadow-card">
          <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
            <Image
              src="/images/promptly-product-icon.png"
              alt="Promptly Labs"
              width={96}
              height={96}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <p className="mt-6 text-lg font-semibold text-ink">Open Promptly Labs</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Draft and improve prompts in the desktop app, then paste into any AI tool.
          </p>
          <div className="mt-6">
            {showDone ? (
              <button
                type="button"
                onClick={onFinish}
                className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenCompanion}
                className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
              >
                Open Promptly Labs
              </button>
            )}
          </div>
          {!showDone && opened ? (
            <p className="mt-3 text-xs text-faint">Switch to Promptly Labs, then return here to finish.</p>
          ) : null}
        </div>
      </div>
    </>
  );
}
