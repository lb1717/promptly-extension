(() => {
  const DEBOUNCE_SEND_MS = 750;

  /** How long to idle after keystrokes before taking a composer sample. */
  const COMPOSER_INPUT_DEBOUNCE_MS = 2200;
  /** Prevent flooding Firestore — one compose sample intent at least this far apart (timer may fire sooner but we throttle). */
  const MIN_GAP_BETWEEN_COMPOSE_SAMPLES_MS = 7000;
  /** Gaps longer than this break active typing accumulation (user stepped away). */
  const DRAFT_IDLE_BREAK_MS = 45_000;
  const DRAFT_MAX_MS = 7_200_000;
  const MAX_CONCURRENT_RESPONSE_WATCHES = 4;
  const WATCH_HEARTBEAT_MS = 4000;

  function slugBucket(label) {
    const s = String(label || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return s || "unknown";
  }

  /**
   * Native host “send prompt” cues (distinct from Promptly Improve/Auto interceptors).
   * Walks upward from the hit target through shadow-safe composed paths elsewhere.
   */
  function looksLikeExcludedSendNeighbor(tid, aria, blob) {
    const t = String(tid || "").toLowerCase();
    if (
      t.includes("stop") ||
      t.includes("regenerate") ||
      /composer-speech|speech-submit|voice|mic|listen|attach|upload|feedback|share/i.test(t) ||
      t.includes("file-input") ||
      t.includes("ellipsis")
    ) {
      return true;
    }
    const a = String(aria || "").toLowerCase();
    if (/\bstop\b/.test(a) && /\bgenerating|response\b/.test(a)) {
      return true;
    }
    if (/listen to (this )?response|voice mode|speech mode/i.test(blob)) {
      return true;
    }
    return false;
  }

  function isLikelySendButton(el) {
    if (!(el instanceof Element)) {
      return false;
    }
    /** @type {Element | null} */
    let n = el;
    for (let depth = 0; depth < 28 && n; depth += 1) {
      const tag = String(n.tagName || "").toUpperCase();
      const tidRaw = String(n.getAttribute("data-testid") || "");
      const tid = tidRaw.toLowerCase();
      const aria = String(n.getAttribute("aria-label") || "").toLowerCase();
      const title = String(n.getAttribute("title") || "").toLowerCase();
      const cls = typeof n.className === "string" ? n.className.toLowerCase() : "";
      const blob = `${tidRaw} ${aria} ${title} ${cls}`;
      if (looksLikeExcludedSendNeighbor(tidRaw, aria, blob)) {
        n = n.parentElement;
        continue;
      }
      if (tag === "BUTTON") {
        const bt = String(n.type || "submit").toLowerCase();
        if (bt === "submit") {
          return true;
        }
      }
      if (tid && (tid.includes("send") || tid.includes("submit"))) {
        return true;
      }
      if (/\b(send|submit message)\b/i.test(aria) || /\bsend\b/i.test(title)) {
        return true;
      }
      if (/\bstreaming-submit\b|\bsend-message\b|\bcomposer-submit\b/i.test(blob)) {
        return true;
      }
      const role = String(n.getAttribute("role") || "").toLowerCase();
      if ((role === "button" || tag === "BUTTON") && /\bsend\b/i.test(blob)) {
        return true;
      }

      n = n.parentElement;
    }
    const host = el.closest("button,[role='button']");
    if (!host || looksLikeExcludedSendNeighbor(host.getAttribute("data-testid") || "", "", String(host.textContent || ""))) {
      return false;
    }
    const signals = [
      host.getAttribute("aria-label"),
      host.getAttribute("data-testid"),
      host.textContent || "",
      host.className || ""
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return /\b(send|submit|streaming-submit)\b/.test(signals);
  }

  /** Deepest actionable send control hit by this gesture (composedPath preserves shadow roots). */
  function findLikelySendInComposedPath(ev) {
    if (!ev || typeof ev.composedPath !== "function") {
      const t = ev && ev.target instanceof Element ? ev.target : null;
      return t && isLikelySendButton(t) ? t : null;
    }
    const path = ev.composedPath();
    for (let i = 0; i < path.length && i < 64; i++) {
      const node = path[i];
      if (node instanceof Element && isLikelySendButton(node)) {
        return node;
      }
    }
    return null;
  }

  function pickPromptTarget(getter) {
    try {
      const t = getter();
      return t && t.isConnected ? t : null;
    } catch (_e) {
      return null;
    }
  }

  /** Promptly's tracked composer, or best-effort discovery (ChatGPT often has no `currentTarget` until focus heuristics catch up). */
  function resolveComposerRoot(cfg) {
    const t = pickPromptTarget(cfg.getPromptTarget);
    if (t && t.isConnected) {
      return t;
    }
    try {
      const a = window.PromptlySiteAdapters;
      if (a && typeof a.getPromptElement === "function") {
        const pe = a.getPromptElement(null);
        if (pe && pe.isConnected) {
          return pe;
        }
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  }

  function eventPathContainsComposer(ev, composer) {
    if (!composer || !ev) return false;
    const path =
      typeof ev.composedPath === "function"
        ? ev.composedPath()
        : ev.target instanceof Node
          ? [ev.target]
          : [];
    for (const n of path) {
      if (n instanceof Node && (n === composer || composer.contains(n))) return true;
    }
    let t = /** @type {unknown} */ (ev.target);
    if (t instanceof Text) {
      t = t.parentElement;
    }
    return t instanceof Element && !!(t === composer || composer.contains(t));
  }

  let installedHere = false;
  let lastSendAt = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let flushTimer = null;
  /** @type {Array<Record<string, unknown>>} */
  let queue = [];
  let recentComposerSnapshot = { chars: 0, words: 0, at: 0 };
  let lastComposeTelemetryAt = 0;
  let flushFailures = 0;

  /** @type {ReturnType<typeof setTimeout>|null} */
  let composeDebounceTimer = null;

  /** Wall + active typing time for the current composer draft (until send or composer cleared). */
  let draftSession = {
    startedMs: null,
    lastActiveMs: null,
    activeTypingMs: 0
  };

  /** @type {Array<{ watch: { flush: () => void, cancel: () => void, getHeartbeat?: () => unknown }, sendRow: Record<string, unknown> }>} */
  let pendingResponseWatches = [];

  /** @type {ReturnType<typeof setInterval>|null} */
  let watchHeartbeatTimer = null;

  function resetDraftSession() {
    draftSession = { startedMs: null, lastActiveMs: null, activeTypingMs: 0 };
  }

  function noteDraftComposerActivity() {
    const now = Date.now();
    if (!draftSession.startedMs) {
      draftSession.startedMs = now;
      draftSession.lastActiveMs = now;
      return;
    }
    if (draftSession.lastActiveMs) {
      const gap = now - draftSession.lastActiveMs;
      if (gap > 0 && gap <= DRAFT_IDLE_BREAK_MS) {
        draftSession.activeTypingMs += gap;
      }
    }
    draftSession.lastActiveMs = now;
  }

  function readDraftSnapshot() {
    const now = Date.now();
    let draftDurationMs = null;
    let draftActiveMs = null;
    if (draftSession.startedMs) {
      draftDurationMs = Math.min(DRAFT_MAX_MS, Math.max(0, now - draftSession.startedMs));
    }
    let active = draftSession.activeTypingMs;
    if (draftSession.lastActiveMs) {
      const gap = now - draftSession.lastActiveMs;
      if (gap > 0 && gap <= DRAFT_IDLE_BREAK_MS) {
        active += gap;
      }
    }
    if (active > 0) {
      draftActiveMs = Math.min(DRAFT_MAX_MS, Math.floor(active));
    }
    return { draft_duration_ms: draftDurationMs, draft_active_ms: draftActiveMs };
  }

  function consumeDraftMetrics() {
    const now = Date.now();
    if (draftSession.startedMs && draftSession.lastActiveMs) {
      const tailGap = now - draftSession.lastActiveMs;
      if (tailGap > 0 && tailGap <= DRAFT_IDLE_BREAK_MS) {
        draftSession.activeTypingMs += tailGap;
      }
    }

    let draftDurationMs = null;
    let draftActiveMs = null;
    if (draftSession.startedMs) {
      draftDurationMs = Math.min(DRAFT_MAX_MS, Math.max(0, now - draftSession.startedMs));
    }
    if (draftSession.activeTypingMs > 0) {
      draftActiveMs = Math.min(DRAFT_MAX_MS, Math.floor(draftSession.activeTypingMs));
    }
    resetDraftSession();
    return { draft_duration_ms: draftDurationMs, draft_active_ms: draftActiveMs };
  }

  function maybeClearDraftIfComposerEmpty(cfg) {
    let text = "";
    try {
      text = String(cfg.readComposer() || "").trim();
    } catch (_e) {
      text = "";
    }
    if (!text.length && draftSession.startedMs) {
      resetDraftSession();
    }
  }

  function syncPendingWatchesToBackground() {
    if (!pendingResponseWatches.length) {
      return;
    }
    try {
      const watches = pendingResponseWatches
        .map((entry) => (typeof entry.watch.getHeartbeat === "function" ? entry.watch.getHeartbeat() : null))
        .filter(Boolean);
      chrome.runtime.sendMessage({ type: "PROMPTLY_HOST_WATCH_SYNC", watches }, () => {
        void chrome.runtime.lastError;
      });
    } catch (_e) {
      /* ignore */
    }
  }

  function ensureWatchHeartbeat() {
    if (watchHeartbeatTimer) {
      return;
    }
    watchHeartbeatTimer = globalThis.setInterval(() => {
      syncPendingWatchesToBackground();
    }, WATCH_HEARTBEAT_MS);
  }

  function stopWatchHeartbeatIfIdle() {
    if (pendingResponseWatches.length || !watchHeartbeatTimer) {
      return;
    }
    globalThis.clearInterval(watchHeartbeatTimer);
    watchHeartbeatTimer = null;
    try {
      chrome.runtime.sendMessage({ type: "PROMPTLY_HOST_WATCH_SYNC", watches: [] }, () => {
        void chrome.runtime.lastError;
      });
    } catch (_e) {
      /* ignore */
    }
  }

  function enqueueRow(row) {
    queue.push(row);
    if (queue.length > 35) {
      queue.splice(0, queue.length - 30);
    }
    if (!flushTimer) {
      flushTimer = globalThis.setTimeout(flushQueued, 2500);
    }
  }

  function flushQueued() {
    flushTimer = null;
    const batch = queue.splice(0, 24);
    if (!batch.length) return;

    try {
      chrome.runtime.sendMessage({ type: "PROMPTLY_HOST_ACTIVITY_BATCH", events: batch }, (resp) => {
        const errMsg = chrome.runtime.lastError ? String(chrome.runtime.lastError.message || "") : "";
        if (errMsg) {
          flushFailures += 1;
          if (flushFailures <= 4) {
            batch.forEach((r) => queue.unshift(r));
            flushTimer = globalThis.setTimeout(flushQueued, 3000 + flushFailures * 1500);
          }
          return;
        }
        if (!resp || resp.ok !== true) {
          const em = typeof resp?.error === "string" ? resp.error.toLowerCase() : "";
          const authLike = /sign in|401|missing firebase|not signed|auth/i.test(em);
          if (!authLike && flushFailures <= 6) {
            flushFailures += 1;
            batch.forEach((r) => queue.unshift(r));
            flushTimer = globalThis.setTimeout(flushQueued, 5000);
          }
          return;
        }
        flushFailures = 0;
      });
    } catch (_e) {
      batch.forEach((r) => queue.unshift(r));
      flushTimer = globalThis.setTimeout(flushQueued, 5000);
    }
  }

  function scrapeModelMeta(site) {
    let meta = { label: "", bucket: "unknown" };
    try {
      if (typeof window.PromptlyHostTelemetry?.scrapeHostModelLabel === "function") {
        const scraped = String(window.PromptlyHostTelemetry.scrapeHostModelLabel(site) || "").trim();
        meta = { label: scraped.slice(0, 120), bucket: slugBucket(scraped) };
      }
    } catch (_e) {
      meta = { label: "", bucket: "unknown" };
    }
    return meta;
  }

  /**
   * @param {{ site: string, readComposer: () => string, destroyed: boolean }} cfg
   */
  function enqueueComposerTypingSample(cfg) {
    if (cfg.destroyed) return;
    const now = Date.now();
    if (now - lastComposeTelemetryAt < MIN_GAP_BETWEEN_COMPOSE_SAMPLES_MS) {
      return;
    }

    let text = "";
    try {
      text = String(cfg.readComposer() || "").trim();
    } catch (_e) {
      text = "";
    }
    const chars = Math.min(12000, text.length);
    if (!chars) return;

    lastComposeTelemetryAt = now;
    const wordsRough = text.split(/\s+/).filter(Boolean).length;
    const meta = scrapeModelMeta(cfg.site);
    const draftSnap = readDraftSnapshot();
    enqueueRow({
      interaction_kind: "composer_input",
      service: cfg.site === "unknown" ? "unknown" : String(cfg.site),
      composer_char_estimate: chars,
      composer_word_estimate: Math.min(12000, wordsRough),
      ...(meta.label ? { host_model_label: meta.label.slice(0, 120), host_model_bucket: meta.bucket.slice(0, 48) } : {}),
      draft_duration_ms: draftSnap.draft_duration_ms,
      draft_active_ms: draftSnap.draft_active_ms,
      host_response_latency_ms: null,
      assistant_output_char_estimate: null,
      time_to_first_stream_activity_ms: null,
      stream_visual_active_ms: null,
      client_occurred_ms: now
    });
  }

  function finalizePendingResponseWatches(reason) {
    const pending = pendingResponseWatches.splice(0);
    for (const entry of pending) {
      if (reason === "flush" && typeof entry.watch.flush === "function") {
        entry.watch.flush();
      } else if (typeof entry.watch.cancel === "function") {
        entry.watch.cancel();
      }
    }
    stopWatchHeartbeatIfIdle();
  }

  function completeSendRow(sendRow, latencyMetrics) {
    enqueueRow({
      ...sendRow,
      host_response_latency_ms: latencyMetrics.host_response_latency_ms ?? null,
      assistant_output_char_estimate: latencyMetrics.assistant_output_char_estimate ?? null,
      time_to_first_stream_activity_ms: latencyMetrics.time_to_first_stream_activity_ms ?? null,
      stream_visual_active_ms: latencyMetrics.stream_visual_active_ms ?? null
    });
  }

  function startResponseWatchForSend(cfg, sendRow) {
    const createWatch = window.PromptlyHostResponseWatcher?.createWatch;
    if (typeof createWatch !== "function") {
      completeSendRow(sendRow, {});
      return;
    }

    if (pendingResponseWatches.length >= MAX_CONCURRENT_RESPONSE_WATCHES) {
      finalizePendingResponseWatches("flush");
    }

    const sendAtMs = Number(sendRow.client_occurred_ms) || Date.now();
    const watch = createWatch({
      site: cfg.site,
      sendAtMs,
      onComplete(metrics) {
        pendingResponseWatches = pendingResponseWatches.filter((entry) => entry.watch !== watch);
        completeSendRow(sendRow, metrics);
        stopWatchHeartbeatIfIdle();
      }
    });

    pendingResponseWatches.push({ watch, sendRow });
    ensureWatchHeartbeat();
    syncPendingWatchesToBackground();
  }

  /**
   * @param clickedSendConfirmed true when gesture hit recognizable Send/submit (pointer snapshot fallback).
   */
  function recordNativePromptSend(cfg, clickedSendConfirmed) {
    if (cfg.destroyed) return false;

    let text = "";
    try {
      text = String(cfg.readComposer() || "").trim();
    } catch (_e) {
      text = "";
    }
    let chars = Math.min(12000, text.length);
    let wordsRough = chars ? text.split(/\s+/).filter(Boolean).length : 0;

    if (
      clickedSendConfirmed &&
      !chars &&
      recentComposerSnapshot.chars > 0 &&
      Date.now() - recentComposerSnapshot.at < 6000
    ) {
      chars = Math.min(12000, recentComposerSnapshot.chars);
      wordsRough = recentComposerSnapshot.words || Math.max(1, Math.min(12000, Math.ceil(chars / 6)));
    }

    if (!chars) {
      return false;
    }

    const nowMs = Date.now();
    if (nowMs - lastSendAt < DEBOUNCE_SEND_MS) {
      return true;
    }
    lastSendAt = nowMs;

    const meta = scrapeModelMeta(cfg.site);
    const draft = consumeDraftMetrics();

    const sendRow = {
      interaction_kind: "send",
      service: cfg.site === "unknown" ? "unknown" : String(cfg.site),
      composer_char_estimate: chars,
      composer_word_estimate: Math.min(12000, wordsRough),
      ...(meta.label
        ? { host_model_label: meta.label.slice(0, 120), host_model_bucket: meta.bucket.slice(0, 48) }
        : {}),
      draft_duration_ms: draft.draft_duration_ms,
      draft_active_ms: draft.draft_active_ms,
      client_occurred_ms: nowMs
    };

    startResponseWatchForSend(cfg, sendRow);
    return true;
  }

  /** @param {{ site: string, getPromptTarget: () => Element|null, readComposer: () => string }} configuration */
  function install(configuration) {
    // Runs in whichever frame Promptly mounts (often top; some surfaces embed the composer in a same-origin iframe).
    if (installedHere || typeof configuration.readComposer !== "function") {
      return () => {};
    }
    installedHere = true;

    const cfg = {
      destroyed: false,
      site: String(configuration.site || "unknown"),
      getPromptTarget: typeof configuration.getPromptTarget === "function" ? configuration.getPromptTarget : () => null,
      readComposer: configuration.readComposer
    };

    function onEarlySendIntent(ev) {
      if (ev?.isTrusted !== true || cfg.destroyed) return;
      if (typeof ev.button === "number" && ev.button !== 0) {
        return;
      }
      const sendHit =
        typeof ev.composedPath === "function"
          ? findLikelySendInComposedPath(ev)
          : ev.target instanceof Element && isLikelySendButton(ev.target)
            ? ev.target
            : null;
      if (!sendHit) {
        return;
      }
      let snap = "";
      try {
        snap = String(cfg.readComposer() || "").trim();
      } catch (_e) {
        snap = "";
      }
      const n = Math.min(12000, snap.length);
      if (n > 0) {
        recentComposerSnapshot = {
          chars: n,
          words: snap.split(/\s+/).filter(Boolean).length,
          at: Date.now()
        };
      }
    }

    function onComposerInputLike(ev) {
      if (!ev?.isTrusted || cfg.destroyed) return;
      if (typeof ev.isComposing === "boolean" && ev.isComposing) return;
      const composer = resolveComposerRoot(cfg);
      if (!composer) return;
      if (!(ev instanceof InputEvent) && !(ev instanceof KeyboardEvent)) return;
      if (!eventPathContainsComposer(ev, composer)) return;

      noteDraftComposerActivity();

      globalThis.clearTimeout(composeDebounceTimer);
      composeDebounceTimer = globalThis.setTimeout(() => {
        composeDebounceTimer = null;
        maybeClearDraftIfComposerEmpty(cfg);
        enqueueComposerTypingSample(cfg);
      }, COMPOSER_INPUT_DEBOUNCE_MS);
    }

    function onCaptureClick(ev) {
      if (ev?.isTrusted !== true || cfg.destroyed) return;
      const sendHit = findLikelySendInComposedPath(ev);
      if (!sendHit) {
        return;
      }
      void recordNativePromptSend(cfg, true);
    }

    function onCaptureSubmit(ev) {
      if (ev?.isTrusted !== true || cfg.destroyed || !(ev.target instanceof HTMLFormElement)) return;
      const composer = resolveComposerRoot(cfg);
      if (!composer || !ev.target.contains(composer)) return;
      const sub = ev.submitter instanceof Element ? ev.submitter : ev.target.querySelector('button[type="submit"]');
      if (!(sub instanceof Element && isLikelySendButton(sub))) return;
      void recordNativePromptSend(cfg, true);
    }

    function onCaptureKey(ev) {
      if (cfg.destroyed || ev?.isTrusted !== true || ev.key !== "Enter") return;
      if (ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey || ev.isComposing) return;
      const root = resolveComposerRoot(cfg);
      const el = ev.target instanceof Node ? ev.target : null;
      const inComposer = !!(root && el && (root === el || root.contains(el)));
      if (!inComposer) {
        return;
      }
      void recordNativePromptSend(cfg, false);
    }

    function onPageHide() {
      globalThis.clearTimeout(composeDebounceTimer);
      composeDebounceTimer = null;
      finalizePendingResponseWatches("flush");
      flushQueued();
    }

    function onTabHidden() {
      flushQueued();
      syncPendingWatchesToBackground();
    }

    window.addEventListener("pointerdown", onEarlySendIntent, true);
    window.addEventListener("mousedown", onEarlySendIntent, true);
    window.addEventListener("click", onCaptureClick, true);
    window.addEventListener("submit", onCaptureSubmit, true);
    window.addEventListener("keydown", onCaptureKey, true);

    document.addEventListener("input", onComposerInputLike, true);
    document.addEventListener("keyup", onComposerInputLike, true);

    window.addEventListener("pagehide", onPageHide, false);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        onTabHidden();
      }
    });

    window.addEventListener(
      "pageshow",
      (ev) => {
        if (ev.persisted) {
          syncPendingWatchesToBackground();
        }
      },
      false
    );

    const periodic = globalThis.setInterval(() => {
      if (queue.length && !flushTimer) {
        flushTimer = globalThis.setTimeout(flushQueued, 100);
      }
    }, 20000);

    return () => {
      cfg.destroyed = true;
      installedHere = false;
      globalThis.clearInterval(periodic);
      globalThis.clearTimeout(composeDebounceTimer);
      composeDebounceTimer = null;
      finalizePendingResponseWatches("cancel");
      resetDraftSession();
      window.removeEventListener("pointerdown", onEarlySendIntent, true);
      window.removeEventListener("mousedown", onEarlySendIntent, true);
      window.removeEventListener("click", onCaptureClick, true);
      window.removeEventListener("submit", onCaptureSubmit, true);
      window.removeEventListener("keydown", onCaptureKey, true);
      document.removeEventListener("input", onComposerInputLike, true);
      document.removeEventListener("keyup", onComposerInputLike, true);
      window.removeEventListener("pagehide", onPageHide, false);
      if (watchHeartbeatTimer) {
        globalThis.clearInterval(watchHeartbeatTimer);
        watchHeartbeatTimer = null;
      }
      flushQueued();
    };
  }

  window.PromptlyHostActivityListener = { install };
})();
