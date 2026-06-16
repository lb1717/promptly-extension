(() => {
  const MIN_SEGMENT_MS = 500;
  const MAX_SEGMENT_MS = 1_800_000;
  const HEARTBEAT_FLUSH_MS = 60_000;
  /** Pause reading-idle accumulation after this long without scroll/typing/pointer activity. */
  const READING_PRESENCE_MS = 90_000;

  /** @type {"reading_idle" | "drafting" | "waiting"} */
  let phase = "reading_idle";
  let phaseStartedMs = 0;
  let tabVisible = typeof document !== "undefined" ? document.visibilityState === "visible" : true;
  let windowFocused = typeof document !== "undefined" ? document.hasFocus() : true;
  let lastUserActivityMs = Date.now();
  let pendingWaiting = false;
  let destroyed = false;
  /** @type {string} */
  let activeService = "unknown";
  /** @type {((row: Record<string, unknown>) => void) | null} */
  let enqueueRow = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let heartbeatTimer = null;
  /** @type {(() => boolean) | null} */
  let isDraftSessionActive = null;

  function isTabVisible() {
    return tabVisible && !destroyed;
  }

  function noteUserActivity() {
    if (destroyed) return;
    lastUserActivityMs = Date.now();
    if (phase === "reading_idle" && isTabVisible() && windowFocused && !phaseStartedMs) {
      startSegment(Date.now());
      ensureHeartbeat();
    } else {
      ensureModelContinuity();
    }
  }

  /** Foreground tab + window focus; reading_idle also needs recent scroll/typing/pointer. */
  function isEngagementActive() {
    if (!isTabVisible() || !windowFocused) return false;
    if (phase !== "reading_idle") return true;
    return Date.now() - lastUserActivityMs <= READING_PRESENCE_MS;
  }

  function pauseReadingIdle() {
    if (phase !== "reading_idle" || !phaseStartedMs) return;
    flushCurrentSegment();
    clearSegment();
    stopHeartbeat();
  }

  /** @type {(() => { label: string; bucket: string }) | null} */
  let getModelMeta = null;
  /** @type {{ label: string; bucket: string } | null} */
  let segmentModelMeta = null;

  function readModelMeta() {
    if (typeof getModelMeta === "function") {
      try {
        const meta = getModelMeta();
        if (meta && typeof meta === "object") {
          const label = String(meta.label || "").trim().slice(0, 120);
          const bucket = String(meta.bucket || "unknown").trim().slice(0, 48) || "unknown";
          return { label, bucket };
        }
      } catch {
        /* ignore scrape errors */
      }
    }
    return { label: "", bucket: "unknown" };
  }

  function modelKey(meta) {
    return `${String(meta?.label || "")}::${String(meta?.bucket || "unknown")}`;
  }

  function startSegment(atMs = Date.now()) {
    phaseStartedMs = atMs;
    segmentModelMeta = readModelMeta();
  }

  function clearSegment() {
    phaseStartedMs = 0;
    segmentModelMeta = null;
  }

  function ensureModelContinuity() {
    if (!phaseStartedMs) return;
    const current = readModelMeta();
    const active = segmentModelMeta || current;
    if (modelKey(current) !== modelKey(active)) {
      flushCurrentSegment(Date.now());
      startSegment(Date.now());
    }
  }

  function flushCurrentSegment(endMs = Date.now()) {
    if (!enqueueRow || destroyed || !phaseStartedMs) {
      return;
    }
    const active = isEngagementActive();
    if (phase === "reading_idle" && !active) {
      endMs = Math.min(endMs, lastUserActivityMs);
    } else if (!active) {
      if (phase === "reading_idle") {
        clearSegment();
      }
      return;
    }
    const rawMs = Math.max(0, endMs - phaseStartedMs);
    if (rawMs < MIN_SEGMENT_MS) {
      startSegment(endMs);
      if (phase === "reading_idle" && !isEngagementActive()) {
        clearSegment();
      }
      return;
    }
    const durationMs = Math.min(MAX_SEGMENT_MS, rawMs);
    const modelMeta = segmentModelMeta || readModelMeta();
    enqueueRow({
      interaction_kind: "engagement_segment",
      engagement_category: phase,
      duration_ms: durationMs,
      service: activeService === "unknown" ? "unknown" : String(activeService),
      client_occurred_ms: endMs,
      ...(modelMeta.label
        ? {
            host_model_label: modelMeta.label,
            host_model_bucket: modelMeta.bucket
          }
        : modelMeta.bucket !== "unknown"
          ? { host_model_bucket: modelMeta.bucket }
          : {})
    });
    startSegment(endMs);
    if (phase === "reading_idle" && !isEngagementActive()) {
      clearSegment();
    }
  }

  function ensureHeartbeat() {
    if (heartbeatTimer || !isEngagementActive()) {
      return;
    }
    heartbeatTimer = globalThis.setInterval(() => {
      if (!isEngagementActive()) {
        if (phase === "reading_idle") {
          pauseReadingIdle();
        } else {
          stopHeartbeat();
        }
        return;
      }
      ensureModelContinuity();
      flushCurrentSegment();
    }, HEARTBEAT_FLUSH_MS);
  }

  function stopHeartbeat() {
    if (!heartbeatTimer) {
      return;
    }
    globalThis.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function setPhase(nextPhase, options = {}) {
    if (destroyed) {
      return;
    }
    const normalized = nextPhase === "drafting" || nextPhase === "waiting" ? nextPhase : "reading_idle";
    if (isTabVisible() && windowFocused) {
      if (phase !== normalized) {
        flushCurrentSegment();
        phase = normalized;
        if (normalized === "reading_idle") {
          clearSegment();
        } else {
          startSegment(Date.now());
        }
        lastUserActivityMs = Date.now();
      } else if (options.forceRestart) {
        flushCurrentSegment();
        if (normalized === "reading_idle") {
          clearSegment();
        } else {
          startSegment(Date.now());
        }
        lastUserActivityMs = Date.now();
      } else if (normalized !== "reading_idle" && !phaseStartedMs) {
        startSegment(Date.now());
        lastUserActivityMs = Date.now();
      }
      if (normalized !== "reading_idle") {
        ensureModelContinuity();
      }
      ensureHeartbeat();
    } else {
      phase = normalized;
      clearSegment();
    }
    if (normalized === "waiting") {
      pendingWaiting = true;
    } else if (normalized === "reading_idle") {
      pendingWaiting = false;
    }
  }

  function onTabVisible() {
    tabVisible = true;
    if (destroyed) {
      return;
    }
    let resumePhase = "reading_idle";
    if (pendingWaiting) {
      resumePhase = "waiting";
    } else if (typeof isDraftSessionActive === "function" && isDraftSessionActive()) {
      resumePhase = "drafting";
    }
    phase = resumePhase;
    lastUserActivityMs = Date.now();
    clearSegment();
    if (windowFocused) {
      ensureHeartbeat();
    }
  }

  function onTabHidden() {
    if (tabVisible) {
      flushCurrentSegment();
    }
    tabVisible = false;
    clearSegment();
    stopHeartbeat();
  }

  function onWindowFocus() {
    windowFocused = true;
    if (destroyed || !tabVisible) {
      return;
    }
    ensureHeartbeat();
  }

  function onWindowBlur() {
    windowFocused = false;
    if (phase === "reading_idle") {
      pauseReadingIdle();
    } else if (tabVisible) {
      flushCurrentSegment();
      clearSegment();
      stopHeartbeat();
    }
  }

  /**
   * @param {{ site: string, isDraftSessionActive?: () => boolean, getModelMeta?: () => { label: string, bucket: string } }} cfg
   * @param {(row: Record<string, unknown>) => void} enqueue
   */
  function install(cfg, enqueue) {
    destroyed = false;
    activeService = String(cfg?.site || "unknown");
    enqueueRow = typeof enqueue === "function" ? enqueue : null;
    isDraftSessionActive = typeof cfg?.isDraftSessionActive === "function" ? cfg.isDraftSessionActive : null;
    getModelMeta = typeof cfg?.getModelMeta === "function" ? cfg.getModelMeta : null;
    phase = "reading_idle";
    pendingWaiting = false;
    tabVisible = document.visibilityState === "visible";
    windowFocused = document.hasFocus();
    clearSegment();
    lastUserActivityMs = Date.now();
    if (tabVisible && windowFocused) {
      ensureHeartbeat();
    }
  }

  function teardown() {
    if (isTabVisible()) {
      flushCurrentSegment();
    }
    destroyed = true;
    stopHeartbeat();
    enqueueRow = null;
    isDraftSessionActive = null;
    getModelMeta = null;
    pendingWaiting = false;
    clearSegment();
  }

  function noteDraftingStarted() {
    setPhase("drafting");
    ensureModelContinuity();
  }

  function noteModelMayHaveChanged() {
    ensureModelContinuity();
  }

  function noteSendRecorded() {
    flushCurrentSegment();
    pendingWaiting = true;
    // Waiting screen time comes from host_response_latency_ms on the send row (avoids double-counting).
    phase = "reading_idle";
    clearSegment();
    stopHeartbeat();
  }

  function noteResponseComplete() {
    setPhase("reading_idle");
  }

  function noteDraftAborted() {
    if (phase === "drafting") {
      setPhase("reading_idle");
    }
  }

  window.PromptlyHostEngagementTracker = {
    install,
    teardown,
    onTabVisible,
    onTabHidden,
    onWindowFocus,
    onWindowBlur,
    noteUserActivity,
    noteDraftingStarted,
    noteModelMayHaveChanged,
    noteSendRecorded,
    noteResponseComplete,
    noteDraftAborted
  };
})();
