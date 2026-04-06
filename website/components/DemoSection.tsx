"use client";

import { DEMO_TIMING } from "@/lib/constants";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const ORIGINAL_PROMPT = "read this pdf and explain the arguments with evidence";
const IMPROVED_PROMPT =
  "Read the attached PDF and summarize the main arguments with supporting evidence. Use explicit quotes from the text and do not include any information not found in the document.";

const VIEWPORT_PAD = 2;

function isPromptBoxFullyVisible(el: HTMLElement | null): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  return (
    r.top >= -VIEWPORT_PAD &&
    r.left >= -VIEWPORT_PAD &&
    r.bottom <= vh + VIEWPORT_PAD &&
    r.right <= vw + VIEWPORT_PAD
  );
}

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
  const cyclesPlayedRef = useRef(0);
  const sessionCompleteRef = useRef(false);
  /** True after user has left the demo (debounced); first paint treats as "enter" so autoplay can run. */
  const reallyLeftRef = useRef(true);

  useEffect(() => {
    let leaveDebounceTimer: number | undefined;

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

    const resetToOpeningScene = () => {
      clearTimers();
      setIsAnimating(false);
      setPromptText("");
      setTabText("Promptly");
      setPausePulsing(false);
      setShowClickCursor(false);
      setTabShineActive(false);
      updateCursorTip();
    };

    const syncVisibility = () => {
      const el = promptBoxRef.current;
      const visible = isPromptBoxFullyVisible(el);

      if (visible) {
        window.clearTimeout(leaveDebounceTimer);
        if (reallyLeftRef.current && !sessionCompleteRef.current) {
          reallyLeftRef.current = false;
          cyclesPlayedRef.current = 0;
          clearTimers();
          runCycle();
        }
        return;
      }

      window.clearTimeout(leaveDebounceTimer);
      leaveDebounceTimer = window.setTimeout(() => {
        reallyLeftRef.current = true;
        sessionCompleteRef.current = false;
      }, 280);
    };

    const handleCycleComplete = () => {
      if (!isPromptBoxFullyVisible(promptBoxRef.current)) {
        resetToOpeningScene();
        return;
      }

      cyclesPlayedRef.current += 1;
      if (cyclesPlayedRef.current >= 4) {
        resetToOpeningScene();
        sessionCompleteRef.current = true;
        return;
      }

      runCycle();
    };

    const runCycle = () => {
      const el = promptBoxRef.current;
      if (!isPromptBoxFullyVisible(el)) {
        resetToOpeningScene();
        return;
      }

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
      const holdBeforeRestartMs = 5000;
      const cycleEndMs =
        improveAtMs +
        improvedRevealMs +
        DEMO_TIMING.disappearDelay * 1000 +
        DEMO_TIMING.loopDelay * 1000 +
        holdBeforeRestartMs;

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
        window.setTimeout(handleCycleComplete, cycleEndMs)
      );
    };

    const onScrollOrResize = () => {
      updateCursorTip();
      syncVisibility();
    };

    updateCursorTip();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, { passive: true });

    const el = promptBoxRef.current;
    const io =
      el &&
      new IntersectionObserver(
        () => {
          syncVisibility();
        },
        { root: null, threshold: [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1] }
      );
    if (el && io) io.observe(el);

    syncVisibility();

    return () => {
      window.clearTimeout(leaveDebounceTimer);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize);
      if (io && el) io.unobserve(el);
      io?.disconnect();
      clearTimers();
    };
  }, []);

  const showImproved = promptText === IMPROVED_PROMPT;
  const displayPromptText = promptText || (!isAnimating ? ORIGINAL_PROMPT : "");

  return (
    <section id="how-it-works" className="px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="relative mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] px-8 pb-8 pt-20 shadow-glow backdrop-blur-md">
          <div
            ref={promptBoxRef}
            className="relative mx-auto max-w-[980px] rounded-[26px] border border-slate-300/70 bg-white pl-5 pr-5 py-4 shadow-[0_12px_30px_rgba(2,6,23,0.12)]"
          >
            <div className="flex items-center gap-4">
              <p className="flex-1 pl-[10px] text-left text-[28px] leading-tight text-slate-800">
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
                  <span className="ml-1 inline-block h-7 w-[2px] animate-pulse bg-slate-500 align-middle" />
                ) : null}
              </p>
              <img
                src="/images/microphone.png"
                alt=""
                aria-hidden="true"
                className="h-6 w-6 object-contain grayscale opacity-70"
              />
              <motion.button
                ref={pauseButtonRef}
                className="grid h-11 w-11 place-items-center rounded-full bg-slate-950 text-white"
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
                className="pointer-events-none absolute z-20"
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
              className="absolute -top-[51px] right-[40px] flex h-[49px] w-[320px] items-center gap-3 overflow-hidden rounded-t-xl rounded-bl-none bg-gradient-to-r from-violet-700 to-violet-600 px-4 text-[14px] text-white shadow-[0_8px_25px_rgba(124,58,237,0.45)]"
            >
              {tabShineActive ? (
                <motion.span
                  className="pointer-events-none absolute inset-y-0 w-[46%] bg-gradient-to-r from-transparent via-white/45 to-transparent"
                  initial={{ x: "-140%" }}
                  animate={{ x: "220%" }}
                  transition={{ duration: 1.8, ease: "easeInOut" }}
                />
              ) : null}
              <span className="relative z-10 inline-flex h-full w-[210px] flex-none items-center overflow-hidden font-semibold leading-none">
                <span className="invisible whitespace-nowrap">Prompt Improved</span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={tabText}
                    className="absolute inset-x-0 top-[37%] inline-flex -translate-y-1/2 items-center gap-1 whitespace-nowrap"
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
              <span className="relative z-10 ml-auto pr-1 text-right text-white/80">Auto</span>
            </motion.div>
          </div>
        </div>

      </div>
    </section>
  );
}
