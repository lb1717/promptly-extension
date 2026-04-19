"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const ORIGINAL_PROMPT = "read this pdf and explain the arguments with evidence";
const IMPROVED_PROMPT =
  "Read the attached PDF and summarize the main arguments with supporting evidence. Use explicit quotes from the text and do not include any extraneous information.";

export function DemoSection() {
  const [promptText, setPromptText] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [tabText, setTabText] = useState("Promptly");
  const [pausePulsing, setPausePulsing] = useState(false);
  const [showClickCursor, setShowClickCursor] = useState(false);
  const [cursorTip, setCursorTip] = useState({ x: 0, y: 0 });
  const [tabShineActive, setTabShineActive] = useState(false);
  const [improvedRevealKey, setImprovedRevealKey] = useState(0);
  const timersRef = useRef<number[]>([]);
  const promptBoxRef = useRef<HTMLDivElement | null>(null);
  const pauseButtonRef = useRef<HTMLButtonElement | null>(null);
  const hasStartedOnceRef = useRef(false);

  useEffect(() => {
    let visibilityObserver: IntersectionObserver | null = null;

    const updateCursorTip = () => {
      const promptBox = promptBoxRef.current;
      const pauseButton = pauseButtonRef.current;
      if (!promptBox || !pauseButton) {
        return;
      }
      const promptRect = promptBox.getBoundingClientRect();
      const buttonRect = pauseButton.getBoundingClientRect();
      setCursorTip({
        x: buttonRect.left - promptRect.left + buttonRect.width / 2,
        y: buttonRect.top - promptRect.top + buttonRect.height / 2
      });
    };

    const clearTimers = () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
      timersRef.current = [];
    };

    const runCycle = () => {
      clearTimers();
      setIsAnimating(true);
      setImprovedRevealKey((prev) => prev + 1);
      setPromptText("");
      setTabText("Promptly");
      setPausePulsing(false);
      setShowClickCursor(false);
      setTabShineActive(false);
      updateCursorTip();

      const typingMsPerChar = 46;
      const pauseAfterText = "read this pdf ";
      const pauseAfterIndex = pauseAfterText.length;
      let hasInsertedPause = false;
      let typedElapsedMs = 0;
      for (let i = 1; i <= ORIGINAL_PROMPT.length; i += 1) {
        typedElapsedMs += typingMsPerChar;
        if (!hasInsertedPause && i === pauseAfterIndex) {
          typedElapsedMs += 700;
          hasInsertedPause = true;
        }
        const sliceLength = i;
        const timer = window.setTimeout(() => {
          setPromptText(ORIGINAL_PROMPT.slice(0, sliceLength));
        }, typedElapsedMs);
        timersRef.current.push(timer);
      }
      const typedDoneMs = typedElapsedMs;
      const pulseStartMs = typedDoneMs + 120;
      const pulseAtMs = pulseStartMs + 500;
      const pulseEndMs = pulseAtMs + 280;
      const shineStartMs = pulseEndMs + 120;
      const shineDurationMs = 1800;
      const shineEndMs = shineStartMs + shineDurationMs;
      const postShineBufferMs = 280;
      const improveAtMs = shineEndMs + postShineBufferMs;
      const improvedRevealMs = 600;
      const postRevealBufferMs = 160;
      const promptImprovedLabelAtMs = improveAtMs + improvedRevealMs + postRevealBufferMs;

      timersRef.current.push(
        window.setTimeout(() => {
          updateCursorTip();
          setShowClickCursor(true);
        }, pulseStartMs),
        window.setTimeout(() => setPausePulsing(true), pulseAtMs),
        window.setTimeout(() => setPausePulsing(false), pulseEndMs),
        window.setTimeout(() => setShowClickCursor(false), pulseEndMs + 40),
        window.setTimeout(() => setTabText("Improving Prompt"), shineStartMs),
        window.setTimeout(() => setTabShineActive(true), shineStartMs),
        window.setTimeout(() => setTabShineActive(false), shineEndMs),
        window.setTimeout(() => setPromptText(IMPROVED_PROMPT), improveAtMs),
        window.setTimeout(() => setTabText("Prompt Improved"), promptImprovedLabelAtMs),
        window.setTimeout(() => {
          setIsAnimating(false);
          window.dispatchEvent(new CustomEvent("promptly-demo-animation-complete"));
        }, promptImprovedLabelAtMs + 100)
      );
    };

    const isPromptBoxInViewport = () => {
      const el = promptBoxRef.current;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.bottom >= 0 && r.top <= window.innerHeight && r.right >= 0 && r.left <= window.innerWidth;
    };

    const startAnimationOnce = () => {
      if (hasStartedOnceRef.current) return;
      hasStartedOnceRef.current = true;
      updateCursorTip();
      runCycle();
      window.removeEventListener("scroll", checkVisibilityAndStart);
      visibilityObserver?.disconnect();
      visibilityObserver = null;
    };

    const checkVisibilityAndStart = () => {
      if (isPromptBoxInViewport()) {
        startAnimationOnce();
      }
    };

    const onResize = () => {
      updateCursorTip();
      checkVisibilityAndStart();
    };

    updateCursorTip();
    window.addEventListener("resize", onResize);

    if (!hasStartedOnceRef.current && promptBoxRef.current) {
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting || entry.intersectionRatio > 0) {
              startAnimationOnce();
              break;
            }
          }
        },
        { threshold: [0, 0.01, 0.1] }
      );
      visibilityObserver.observe(promptBoxRef.current);
      window.addEventListener("scroll", checkVisibilityAndStart, { passive: true });
      const initialCheckTimer = window.setTimeout(checkVisibilityAndStart, 120);
      timersRef.current.push(initialCheckTimer);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", checkVisibilityAndStart);
      visibilityObserver?.disconnect();
      clearTimers();
    };
  }, []);

  const showImproved = promptText === IMPROVED_PROMPT;
  const displayPromptText = promptText || (!isAnimating ? ORIGINAL_PROMPT : "");

  return (
    <section id="how-it-works" className="overflow-x-hidden px-3 pb-5 pt-4 sm:px-4 sm:pb-8 sm:pt-8">
      <div className="mx-auto max-w-6xl">
        <div className="relative mx-auto max-w-5xl rounded-2xl border border-white/10 bg-white/[0.04] px-3 pb-4 pt-14 shadow-glow backdrop-blur-md sm:rounded-3xl sm:px-8 sm:pb-8 sm:pt-20">
          <div
            ref={promptBoxRef}
            className="relative mx-auto max-w-[980px] rounded-[18px] border border-slate-300/70 bg-white px-3 py-3 shadow-[0_12px_30px_rgba(2,6,23,0.12)] sm:rounded-[26px] sm:px-5 sm:py-4"
          >
            <div className="flex items-center gap-2 sm:gap-4">
              <p className="flex-1 pl-1 text-left text-[13px] leading-snug text-slate-800 sm:pl-[10px] sm:text-[24px] sm:leading-tight">
                {showImproved ? (
                  <motion.span
                    key={`improved-inline-${improvedRevealKey}`}
                    className="block w-full"
                    initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
                    animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  >
                    {IMPROVED_PROMPT}
                  </motion.span>
                ) : (
                  displayPromptText
                )}
                {!showImproved && promptText.length > 0 ? (
                  <span className="ml-1 inline-block h-4 w-[1.5px] animate-pulse bg-slate-500 align-middle sm:h-7 sm:w-[2px]" />
                ) : null}
              </p>
              <img
                src="/images/microphone.png"
                alt=""
                aria-hidden="true"
                className="h-4 w-4 object-contain grayscale opacity-70 sm:h-6 sm:w-6"
              />
              <motion.button
                ref={pauseButtonRef}
                className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-white sm:h-11 sm:w-11"
                aria-hidden="true"
                animate={{
                  scale: pausePulsing ? [1, 0.72, 1] : 1
                }}
                transition={{ duration: 0.28, ease: "easeInOut" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 6v11"
                    stroke="#ffffff"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8.4 9.6 12 6l3.6 3.6"
                    stroke="#ffffff"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.button>
            </div>

            {showClickCursor ? (
              <motion.div
                className="pointer-events-none absolute z-20 hidden sm:block"
                style={{ left: `${cursorTip.x - 2}px`, top: `${cursorTip.y + 5}px` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
              >
                <img src="/images/mac-cursor.png" alt="" aria-hidden="true" className="h-[38px] w-[29px]" />
              </motion.div>
            ) : null}

            <motion.div
              className="absolute -top-10 right-2 flex h-9 w-[180px] items-center gap-1.5 overflow-hidden rounded-t-lg rounded-bl-none bg-gradient-to-r from-violet-700 to-violet-600 px-2 text-[10px] text-white shadow-[0_8px_25px_rgba(124,58,237,0.45)] sm:-top-[51px] sm:right-[40px] sm:h-[49px] sm:w-[320px] sm:gap-3 sm:rounded-t-xl sm:px-4 sm:text-[14px]"
            >
              {tabShineActive ? (
                <motion.span
                  className="pointer-events-none absolute inset-y-0 w-[46%] bg-gradient-to-r from-transparent via-white/45 to-transparent"
                  initial={{ x: "-140%" }}
                  animate={{ x: "220%" }}
                  transition={{ duration: 1.8, ease: "easeInOut" }}
                />
              ) : null}
              <span className="relative z-10 inline-flex h-full w-[120px] flex-none items-center overflow-hidden font-semibold leading-none sm:w-[210px]">
                <span className="invisible whitespace-nowrap">Prompt Improved</span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={tabText}
                    className="absolute inset-x-0 top-[40%] inline-flex -translate-y-1/2 items-center gap-1 whitespace-nowrap sm:top-[37%]"
                    initial={{ y: 22, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -22, opacity: 0 }}
                    transition={{ duration: 0.26, ease: "easeInOut" }}
                  >
                    <span>{tabText}</span>
                    {tabText === "Prompt Improved" ? (
                      <img
                        src="/images/green-check.png"
                        alt=""
                        aria-hidden="true"
                        className="h-3.5 w-3.5 rounded-[3px] object-contain"
                      />
                    ) : null}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="relative z-10 ml-auto pr-0 text-right text-white/80 sm:pr-1">Auto</span>
            </motion.div>
          </div>
        </div>

      </div>
    </section>
  );
}
