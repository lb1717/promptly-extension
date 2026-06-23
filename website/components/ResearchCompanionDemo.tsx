"use client";

import { ChatGptLogo, ClaudeLogo } from "@/components/onboarding/AiServiceLogos";
import { AnimatePresence, motion } from "framer-motion";
import { DEMO_TIMING } from "@/lib/constants";
import { useEffect, useRef, useState, type ComponentType, type RefObject } from "react";

const ORIGINAL_PROMPT =
  "Fix my website UI margins, and the backend which fails to correctly get user's subscription status from the database";

const IMPROVED_PROMPT = `Troubleshoot my website frontend UI and backend connectivity.
- UI issue:
  - The user interface is not perfectly aligned with the intended margins.
  - Identify misalignments, and spacing inconsistencies.
- Backend issue:
  - Validate connections, and ORM mappings used to match users with subscriptions.
  - Diagnose issues in API endpoints.

- Output:
  - A report outlining identified issues and root causes.
  - Updated code applying relevant fixes and testing of that code.`;

type CompanionView = "draft" | "pasted";
type RecordingPhase = "idle" | "listening" | "transcribing";

const HOST_CAROUSEL_MS = 2600;

const HOST_APPS: Array<{
  label: string;
  watermarkLabel?: string;
  Logo: ComponentType<{ className?: string }>;
}> = [
  { label: "Claude Code", watermarkLabel: "Claude\nCode", Logo: ClaudeLogo },
  { label: "Claude Cowork", watermarkLabel: "Claude\nCowork", Logo: ClaudeLogo },
  { label: "ChatGPT", Logo: ChatGptLogo },
  { label: "Codex", Logo: CodexLogo }
];

function CodexLogo({ className }: { className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path
        fill="#10A37F"
        d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
      />
    </svg>
  );
}

function HostAppCarousel({
  index,
  variant,
  compact = false
}: {
  index: number;
  variant: "title" | "watermark";
  compact?: boolean;
}) {
  const app = HOST_APPS[index % HOST_APPS.length];
  const Logo = app.Logo;
  const displayLabel = variant === "watermark" ? app.watermarkLabel ?? app.label : app.label;

  return (
    <div
      className={
        variant === "title"
          ? "relative flex h-full min-w-[8.5rem] items-center overflow-hidden"
          : compact
            ? "relative h-12 min-w-[9.5rem] w-full max-w-[14rem] overflow-hidden sm:h-14 sm:max-w-[16rem]"
            : "relative h-[3.75rem] min-w-[9.5rem] w-full max-w-[15rem] overflow-hidden sm:h-[4.75rem] sm:max-w-[17rem]"
      }
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={app.label}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
          className={
            variant === "title"
              ? "absolute inset-0 flex items-center"
              : "absolute inset-0 flex max-w-full items-center gap-1.5 sm:gap-2"
          }
        >
          <span
            className={
              variant === "title"
                ? "text-xs font-medium leading-none text-[#9ca3af]"
                : compact
                  ? "min-w-0 whitespace-pre-line text-lg font-semibold leading-[1.08] tracking-tight text-[#141820] sm:text-2xl"
                  : "min-w-0 whitespace-pre-line text-xl font-semibold leading-[1.08] tracking-tight text-[#141820] sm:text-3xl"
            }
          >
            {displayLabel}
          </span>
          {variant === "watermark" ? (
            <Logo
              className={
                compact ? "h-6 w-6 shrink-0 sm:h-7 sm:w-7" : "h-7 w-7 shrink-0 sm:h-8 sm:w-8"
              }
            />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function SendIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5M5 12l7-7 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V19H9v2h6v-2h-2v-1.08A7 7 0 0 0 19 11h-2Z"
      />
    </svg>
  );
}

function RecordingRipples() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {[0, 0.8, 1.6].map((delay) => (
        <span
          key={delay}
          className="absolute inset-0 animate-[researchRipple_2.4s_ease-out_infinite] rounded-full border-2 border-[rgba(220,53,69,0.45)]"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}

function PromptImproverHeader({ wordCount }: { wordCount: number }) {
  return (
    <div className="relative flex shrink-0 items-center border-b border-[#d8dce5] px-2 py-1">
      <img
        src="/images/promptly-logo.png"
        alt=""
        className="absolute left-2 h-3.5 w-3.5 shrink-0"
        draggable={false}
      />
      <div className="flex flex-1 items-center justify-center gap-1.5">
        <span className="text-[9px] font-semibold text-[#374151]">Prompt Improver</span>
        <span className="h-3 w-px shrink-0 bg-[#d8dce5]" aria-hidden="true" />
        <span className="text-[9px] font-medium text-[#6b7280]">{wordCount} words</span>
      </div>
    </div>
  );
}

function CompanionChrome({
  view,
  draftText,
  recordingPhase,
  improving,
  micPulse,
  stopPulse,
  improvePulse,
  showPastedBanner,
  micBtnRef,
  stopBtnRef,
  improveBtnRef
}: {
  view: CompanionView;
  draftText: string;
  recordingPhase: RecordingPhase;
  improving: boolean;
  micPulse: boolean;
  stopPulse: boolean;
  improvePulse: boolean;
  showPastedBanner: boolean;
  micBtnRef: RefObject<HTMLButtonElement>;
  stopBtnRef: RefObject<HTMLButtonElement>;
  improveBtnRef: RefObject<HTMLButtonElement>;
}) {
  const wordCount = draftText.trim().split(/\s+/).filter(Boolean).length;
  const showMicButton = recordingPhase === "idle" && !draftText && !improving && view === "draft";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[#d8dce5] bg-[#f4f5f7] shadow-[0_18px_40px_rgba(20,24,32,0.18)]">
      {view === "draft" ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col px-1.5 pt-1.5 pb-1.5">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#d8dce5] bg-white">
            <PromptImproverHeader wordCount={wordCount} />
            <div className="relative min-h-0 flex-1">
              <div
                className={`h-full overflow-hidden break-words px-2 py-1.5 text-[10px] leading-snug text-[#141820] ${showMicButton ? "pr-9" : ""}`}
              >
                {draftText}
                {recordingPhase === "idle" && !draftText ? (
                  <span className="text-[#6b7280]">Type your prompt here…</span>
                ) : null}
                {recordingPhase === "idle" && draftText && !improving ? (
                  <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[#6b7280]" />
                ) : null}
              </div>
              {showMicButton ? (
              <motion.button
                ref={micBtnRef}
                type="button"
                aria-hidden="true"
                animate={{ scale: micPulse ? [1, 0.88, 1] : 1 }}
                transition={{ duration: 0.22 }}
                className="absolute right-1.5 top-1.5 inline-flex h-[24px] w-[24px] items-center justify-center rounded-md border border-[#141820] bg-white text-[#6b7280]"
              >
                <MicIcon className="h-3.5 w-3.5" />
              </motion.button>
              ) : null}

              {recordingPhase !== "idle" ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 backdrop-blur-[2px]">
                  <div className="flex flex-col items-center gap-1">
                    <div className="relative h-10 w-10">
                      <RecordingRipples />
                      <motion.button
                        ref={stopBtnRef}
                        type="button"
                        aria-hidden="true"
                        animate={{ scale: stopPulse ? [1, 0.9, 1] : 1 }}
                        transition={{ duration: 0.22 }}
                        className="relative z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#dc3545] text-white shadow-[0_6px_18px_rgba(220,53,69,0.35)]"
                      >
                        <MicIcon className="h-5 w-5" />
                      </motion.button>
                    </div>
                    <p
                      className={`text-[9px] font-medium text-[#6b7280] ${
                        recordingPhase === "transcribing" ? "animate-pulse" : ""
                      }`}
                    >
                      {recordingPhase === "transcribing" ? "Transcribing…" : "Tap to stop recording"}
                    </p>
                  </div>
                </div>
              ) : null}

              {improving ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85">
                  <div className="relative h-8 w-8">
                    <span className="absolute inset-0 animate-spin rounded-full border-2 border-[#6d5ce8]/20 border-t-[#6d5ce8]" />
                  </div>
                </div>
              ) : null}
            </div>
            </div>
            <motion.button
              ref={improveBtnRef}
              type="button"
              aria-hidden="true"
              animate={{ scale: improvePulse ? [1, 0.96, 1] : 1 }}
              transition={{ duration: 0.22 }}
              className="mt-1.5 shrink-0 w-full rounded-md border border-[#141820] bg-[#6d5ce8] px-2 py-1.5 text-[11px] font-semibold text-white"
            >
              Improve
            </motion.button>
          </div>
        </>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col px-1.5 pt-1.5 pb-1.5">
          <AnimatePresence initial={false}>
            {showPastedBanner ? (
              <motion.div
                key="pasted-banner"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 6 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0 overflow-hidden rounded-md border border-[#86efac] bg-[#dcfce7] px-2 py-1 text-center text-[9px] font-semibold text-[#166534]"
              >
                Prompt Pasted
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#d8dce5] bg-white">
            <PromptImproverHeader wordCount={0} />
            <div className="relative min-h-0 flex-1">
              <div className="h-full overflow-hidden px-2 py-1.5 text-[10px] leading-snug text-[#6b7280]">
                Edit prompt further...
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="mt-1.5 shrink-0 w-full rounded-md border border-[#141820] bg-[#6d5ce8] px-2 py-1 text-[10px] font-semibold text-white"
          >
            Apply Feedback
          </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ResearchCompanionDemo() {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const micBtnRef = useRef<HTMLButtonElement | null>(null);
  const stopBtnRef = useRef<HTMLButtonElement | null>(null);
  const improveBtnRef = useRef<HTMLButtonElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const hasStartedRef = useRef(false);

  const [view, setView] = useState<CompanionView>("draft");
  const [draftText, setDraftText] = useState("");
  const [hostPrompt, setHostPrompt] = useState("");
  const [recordingPhase, setRecordingPhase] = useState<RecordingPhase>("idle");
  const [improving, setImproving] = useState(false);
  const [improvedRevealKey, setImprovedRevealKey] = useState(0);
  const [showCursor, setShowCursor] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [micPulse, setMicPulse] = useState(false);
  const [stopPulse, setStopPulse] = useState(false);
  const [improvePulse, setImprovePulse] = useState(false);
  const [showPastedBanner, setShowPastedBanner] = useState(false);
  const [hostCarouselIndex, setHostCarouselIndex] = useState(0);

  useEffect(() => {
    if (view !== "pasted") {
      setShowPastedBanner(false);
      return;
    }

    setShowPastedBanner(true);
    const id = window.setTimeout(() => setShowPastedBanner(false), 2000);
    return () => window.clearTimeout(id);
  }, [view, improvedRevealKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHostCarouselIndex((current) => (current + 1) % HOST_APPS.length);
    }, HOST_CAROUSEL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const clearTimers = () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
      timersRef.current = [];
    };

    const pushTimer = (fn: () => void, delay: number) => {
      const id = window.setTimeout(fn, delay);
      timersRef.current.push(id);
      return id;
    };

    const cursorAt = (target: HTMLElement | null, offsetX = 0, offsetY = 0) => {
      const scene = sceneRef.current;
      if (!scene || !target) return;
      const sceneRect = scene.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setCursorPos({
        x: targetRect.left - sceneRect.left + targetRect.width / 2 + offsetX,
        y: targetRect.top - sceneRect.top + targetRect.height / 2 + offsetY
      });
    };

    const resetScene = () => {
      setView("draft");
      setDraftText("");
      setHostPrompt("");
      setRecordingPhase("idle");
      setImproving(false);
      setImprovedRevealKey((prev) => prev + 1);
      setShowCursor(false);
      setMicPulse(false);
      setStopPulse(false);
      setImprovePulse(false);
      setShowPastedBanner(false);
    };

    const runCycle = () => {
      clearTimers();
      resetScene();
      let t = 400;

      pushTimer(() => {
        cursorAt(micBtnRef.current, 0, 4);
        setShowCursor(true);
      }, t);
      t += 900;

      pushTimer(() => {
        setMicPulse(true);
        setRecordingPhase("listening");
      }, t);
      t += 280;
      pushTimer(() => setMicPulse(false), t);
      t += 3000;

      pushTimer(() => {
        cursorAt(stopBtnRef.current, 0, 4);
      }, t);
      t += 900;

      pushTimer(() => {
        setStopPulse(true);
        setRecordingPhase("transcribing");
      }, t);
      t += 280;
      pushTimer(() => setStopPulse(false), t);
      t += 900;

      pushTimer(() => {
        setRecordingPhase("idle");
        setShowCursor(false);
      }, t);
      t += 200;

      const typingMs = 14;
      for (let i = 1; i <= ORIGINAL_PROMPT.length; i += 1) {
        const slice = ORIGINAL_PROMPT.slice(0, i);
        pushTimer(() => setDraftText(slice), t);
        t += typingMs;
      }
      t += 500;

      pushTimer(() => {
        cursorAt(improveBtnRef.current, 0, 2);
        setShowCursor(true);
      }, t);
      t += 900;

      pushTimer(() => {
        setImprovePulse(true);
        setImproving(true);
      }, t);
      t += 280;
      pushTimer(() => setImprovePulse(false), t);
      t += 1400;

      pushTimer(() => {
        setImproving(false);
        setView("pasted");
        setHostPrompt(IMPROVED_PROMPT);
        setShowCursor(false);
      }, t);
      t += DEMO_TIMING.doneScreenHoldMs;

      pushTimer(runCycle, t);
    };

    const startOnce = () => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;
      runCycle();
    };

    const observer = sceneRef.current
      ? new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              startOnce();
            }
          },
          { threshold: 0.2 }
        )
      : null;

    if (sceneRef.current && observer) {
      observer.observe(sceneRef.current);
    }

    return () => {
      observer?.disconnect();
      clearTimers();
    };
  }, []);

  return (
    <section id="companion-demo" className="scroll-mt-24 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div
          ref={sceneRef}
          className="research-companion-scene relative mx-auto flex h-[380px] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[#d8dce5] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.12)] sm:h-[420px]"
        >
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#e5e7eb] bg-[#fafafa] px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <div className="flex h-full min-w-0 flex-1 items-center">
              <HostAppCarousel index={hostCarouselIndex} variant="title" />
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            <div className="pointer-events-none absolute bottom-3 left-5 top-3 z-10 flex max-w-[calc(100%-236px)] items-center sm:left-8">
              <HostAppCarousel
                index={hostCarouselIndex}
                variant="watermark"
                compact={Boolean(hostPrompt)}
              />
            </div>
          </div>

          <div className="absolute right-3 top-3 z-30 w-[220px] max-w-[calc(100%-1.5rem)]">
            <motion.div
              animate={{ height: view === "pasted" ? 144 : 196 }}
              initial={false}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              className="w-full overflow-hidden rounded-lg"
            >
              <CompanionChrome
                view={view}
                draftText={draftText}
                recordingPhase={recordingPhase}
                improving={improving}
                micPulse={micPulse}
                stopPulse={stopPulse}
                improvePulse={improvePulse}
                showPastedBanner={showPastedBanner}
                micBtnRef={micBtnRef}
                stopBtnRef={stopBtnRef}
                improveBtnRef={improveBtnRef}
              />
            </motion.div>
          </div>

          <div className="shrink-0 border-t border-[#e5e7eb] bg-white px-4 py-3 sm:px-5">
            <motion.div
              layout
              initial={false}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              className={`flex gap-2 rounded-xl border border-[#d1d5db] bg-[#fafafa] pl-3 pr-1.5 shadow-inner transition-[min-height,padding] duration-300 ${
                hostPrompt
                  ? "min-h-[132px] items-stretch py-2.5 sm:min-h-[148px]"
                  : "h-11 items-center py-0 sm:h-12"
              }`}
            >
              <div className={`min-w-0 flex-1 ${hostPrompt ? "py-0.5" : "flex h-full items-center"}`}>
                {hostPrompt ? (
                  <motion.div
                    key={`host-prompt-${improvedRevealKey}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35 }}
                    className="max-h-[120px] overflow-hidden whitespace-pre-wrap text-[10px] leading-snug text-[#374151] sm:max-h-[136px] sm:text-[11px]"
                  >
                    {hostPrompt}
                  </motion.div>
                ) : (
                  <span className="block text-[11px] leading-none text-[#9ca3af]">Type prompt...</span>
                )}
              </div>
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#374151] text-white sm:h-9 sm:w-9 ${
                  hostPrompt ? "my-0.5 self-end" : "self-center"
                }`}
              >
                <SendIcon />
              </button>
            </motion.div>
          </div>

          {showCursor ? (
            <motion.img
              src="/images/mac-cursor.png"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-30 hidden h-[30px] w-[23px] sm:block"
              style={{ left: cursorPos.x - 2, top: cursorPos.y + 4 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.12 }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
