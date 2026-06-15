(() => {
  const MIN_SEGMENT_MS = 500;
  const MAX_SEGMENT_MS = 1_800_000;
  const HEARTBEAT_FLUSH_MS = 60_000;

  /** @type {"reading_idle" | "drafting" | "waiting"} */
  let phase = "reading_idle";
  let phaseStartedMs = 0;
  let tabVisible = typeof document !== "undefined" ? document.visibilityState === "visible" : true;
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

  function flushCurrentSegment() {
    if (!enqueueRow || destroyed || !phaseStartedMs) {
      return;
    }
    const now = Date.now();
    const rawMs = Math.max(0, now - phaseStartedMs);
    if (rawMs < MIN_SEGMENT_MS) {
      phaseStartedMs = now;
      return;
    }
    const durationMs = Math.min(MAX_SEGMENT_MS, rawMs);
    enqueueRow({
      interaction_kind: "engagement_segment",
      engagement_category: phase,
      duration_ms: durationMs,
      service: activeService === "unknown" ? "unknown" : String(activeService),
      client_occurred_ms: now
    });
    phaseStartedMs = now;
  }

  function ensureHeartbeat() {
    if (heartbeatTimer || !isTabVisible()) {
      return;
    }
    heartbeatTimer = globalThis.setInterval(() => {
      if (!isTabVisible()) {
        stopHeartbeat();
        return;
      }
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
    if (isTabVisible()) {
      if (phase !== normalized) {
        flushCurrentSegment();
        phase = normalized;
        phaseStartedMs = Date.now();
      } else if (options.forceRestart) {
        flushCurrentSegment();
        phaseStartedMs = Date.now();
      }
      ensureHeartbeat();
    } else {
      phase = normalized;
      phaseStartedMs = 0;
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
    phaseStartedMs = Date.now();
    ensureHeartbeat();
  }

  function onTabHidden() {
    if (tabVisible) {
      flushCurrentSegment();
    }
    tabVisible = false;
    phaseStartedMs = 0;
    stopHeartbeat();
  }

  /**
   * @param {{ site: string, isDraftSessionActive?: () => boolean }} cfg
   * @param {(row: Record<string, unknown>) => void} enqueue
   */
  function install(cfg, enqueue) {
    destroyed = false;
    activeService = String(cfg?.site || "unknown");
    enqueueRow = typeof enqueue === "function" ? enqueue : null;
    isDraftSessionActive = typeof cfg?.isDraftSessionActive === "function" ? cfg.isDraftSessionActive : null;
    phase = "reading_idle";
    pendingWaiting = false;
    tabVisible = document.visibilityState === "visible";
    phaseStartedMs = tabVisible ? Date.now() : 0;
    if (tabVisible) {
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
    pendingWaiting = false;
    phaseStartedMs = 0;
  }

  function noteDraftingStarted() {
    setPhase("drafting");
  }

  function noteSendRecorded() {
    flushCurrentSegment();
    pendingWaiting = true;
    // Waiting screen time comes from host_response_latency_ms on the send row (avoids double-counting).
    phase = "reading_idle";
    phaseStartedMs = 0;
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
    noteDraftingStarted,
    noteSendRecorded,
    noteResponseComplete,
    noteDraftAborted
  };
})();
