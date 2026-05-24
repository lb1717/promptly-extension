(() => {
  const DEBOUNCE_SEND_MS = 750;
  const MIN_AFTER_SEND_BEFORE_DONE_MS = 900;
  const STABLE_POLL_MS = 500;
  const STABLE_NEED_TICKS = 3;
  const MAX_WATCH_MS = 120_000;
  const MAX_OUTSTANDING_WATCHERS = 4;

  /** How long to idle after keystrokes before taking a composer sample. */
  const COMPOSER_INPUT_DEBOUNCE_MS = 2200;
  /** Prevent flooding Firestore — one compose sample intent at least this far apart (timer may fire sooner but we throttle). */
  const MIN_GAP_BETWEEN_COMPOSE_SAMPLES_MS = 7000;

  function slugBucket(label) {
    const s = String(label || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return s || "unknown";
  }

  function isLikelySendButton(el) {
    if (!(el instanceof Element)) {
      return false;
    }
    const button = el.closest("button, [role='button']");
    if (!button) {
      return false;
    }
    const signals = [
      button.getAttribute("aria-label"),
      button.getAttribute("data-testid"),
      button.getAttribute("data-test"),
      button.getAttribute("name"),
      button.getAttribute("type"),
      button.getAttribute("id"),
      button.className,
      button.textContent
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (/\b(send|submit|composer-submit|send-button|send-message|submit-button|streaming-submit)\b/.test(signals)) {
      return true;
    }
    const dt = String(button.getAttribute("data-testid") || "").toLowerCase();
    if (dt && (dt.includes("send") || dt.includes("submit"))) {
      return true;
    }
    return button.getAttribute("type") === "submit";
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

  function fingerprintAssistant(site) {
    try {
      if (site === "chatgpt") {
        const list = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
        const last = list[list.length - 1];
        const t = last ? String(last.innerText || "") : "";
        return { n: list.length, len: t.length };
      }
      if (site === "claude") {
        const list = [...document.querySelectorAll('[data-testid*="assistant-message" i]')];
        if (list.length) {
          const last = list[list.length - 1];
          const t = last ? String(last.innerText || "") : "";
          return { n: list.length, len: t.length };
        }
        const wide = [...document.querySelectorAll("[data-turn='assistant']")];
        const last = wide[wide.length - 1];
        const t = last ? String(last.innerText || "") : "";
        return { n: wide.length, len: t.length };
      }
      if (site === "gemini") {
        const candidates = [...document.querySelectorAll("model-response, message-content, bard-message-response")];
        const last = candidates[candidates.length - 1];
        const t =
          last && "innerText" in last ? String(last.innerText || "") : String(document.body?.innerText || "").slice(-4000);
        return { n: candidates.length, len: Math.min(120000, t.length) };
      }
      return { n: 0, len: 0 };
    } catch (_e) {
      return { n: 0, len: 0 };
    }
  }

  /** @param {string} site */
  function hostShowsStopControl(site) {
    try {
      const globalStops = document.querySelectorAll(
        '[data-testid="stop-button"],button[aria-label*="Stop" i],button[aria-label*="stop generating" i]'
      );
      if (globalStops.length > 0) {
        let visible = false;
        for (const b of [...globalStops]) {
          if (!(b instanceof Element)) continue;
          const r = b.getBoundingClientRect();
          const st = window.getComputedStyle(b);
          if (
            r.width > 2 &&
            r.height > 2 &&
            st.visibility !== "hidden" &&
            st.display !== "none" &&
            Number(st.opacity || 1) > 0.05
          ) {
            visible = true;
            break;
          }
        }
        if (visible) {
          return true;
        }
      }
      if (site === "gemini") {
        const busy = document.querySelector("[busy], [aria-busy='true']");
        if (busy instanceof Element) return true;
      }
      return false;
    } catch (_e) {
      return false;
    }
  }

  function fingerprintMoved(prev, next) {
    return prev.n !== next.n || Math.abs(prev.len - next.len) > 18;
  }

  let installedHere = false;
  let lastSendAt = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let flushTimer = null;
  /** @type {Array<Record<string, unknown>>} */
  let queue = [];
  let outstandingWatchers = 0;
  let recentComposerSnapshot = { chars: 0, words: 0, at: 0 };
  let lastComposeTelemetryAt = 0;
  let flushFailures = 0;

  /** @type {ReturnType<typeof setTimeout>|null} */
  let composeDebounceTimer = null;

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
    enqueueRow({
      interaction_kind: "composer_input",
      service: cfg.site === "unknown" ? "unknown" : String(cfg.site),
      composer_char_estimate: chars,
      composer_word_estimate: Math.min(12000, wordsRough),
      ...(meta.label ? { host_model_label: meta.label.slice(0, 120), host_model_bucket: meta.bucket.slice(0, 48) } : {}),
      host_response_latency_ms: null,
      assistant_output_char_estimate: null,
      time_to_first_stream_activity_ms: null,
      stream_visual_active_ms: null,
      client_occurred_ms: now
    });
  }

  /**
   * @param {{ site: string }} opts
   * @param {{ n: number, len: number }} baselineFp
   * @param {number} composerChars
   * @param {{ label: string, bucket: string }} meta
   * @param {number} wordsRough
   * @param {number} occurredMs
   */
  function watchLatency(opts, baselineFp, composerChars, meta, wordsRough, occurredMs) {
    const site = opts.site;
    let prevFp = baselineFp;
    let stable = 0;
    let ended = false;
    const t0 = performance.now();

    /** @type {number|undefined} */
    let intervalId;
    /** @type {number | null} */
    let streamStartedMsAfterSend = null;
    let assistantPeakGrowth = baselineFp.len;

    function finalize(latencyMs) {
      if (ended) return;
      ended = true;
      if (intervalId !== undefined) {
        globalThis.clearInterval(intervalId);
        intervalId = undefined;
      }
      outstandingWatchers -= 1;
      const nowRel = performance.now();
      /** Growth of scraped last-assistant blob — rough “how much was visibly typed/streamed”. */
      const assistantDelta = Math.max(0, Math.min(200000, assistantPeakGrowth - baselineFp.len));
      const ttStream =
        streamStartedMsAfterSend != null ? Math.max(0, Math.round(streamStartedMsAfterSend)) : null;
      let streamWall = null;
      if (streamStartedMsAfterSend != null) {
        streamWall = Math.max(0, Math.round(nowRel - t0 - streamStartedMsAfterSend));
      }

      enqueueRow({
        interaction_kind: "send",
        service: site === "unknown" ? "unknown" : String(site),
        composer_char_estimate: composerChars,
        composer_word_estimate: wordsRough >= 0 ? Math.min(12000, wordsRough) : null,
        ...(meta.label ? { host_model_label: meta.label.slice(0, 120), host_model_bucket: meta.bucket.slice(0, 48) } : {}),
        host_response_latency_ms: latencyMs,
        assistant_output_char_estimate: assistantDelta > 0 ? assistantDelta : null,
        time_to_first_stream_activity_ms: ttStream,
        stream_visual_active_ms: streamWall,
        client_occurred_ms: occurredMs
      });
    }

    intervalId = globalThis.setInterval(() => {
      const elapsedWall = performance.now() - t0;
      const streaming = hostShowsStopControl(site);
      const fp = fingerprintAssistant(site);

      assistantPeakGrowth = Math.max(assistantPeakGrowth, fp.len);
      const looksLikeStreamGrowing = streaming || fp.len > baselineFp.len + 35 || fingerprintMoved(prevFp, fp);
      if (looksLikeStreamGrowing && streamStartedMsAfterSend === null) {
        streamStartedMsAfterSend = elapsedWall;
      }

      if (!streaming) {
        if (fingerprintMoved(prevFp, fp)) {
          stable = 0;
          prevFp = fp;
        } else if (elapsedWall >= MIN_AFTER_SEND_BEFORE_DONE_MS) {
          stable += 1;
          if (
            stable >= STABLE_NEED_TICKS &&
            ((fp.len > baselineFp.len + 8 || fp.n > baselineFp.n) || elapsedWall > 5500 || assistantPeakGrowth > baselineFp.len + 40)
          ) {
            finalize(Math.min(MAX_WATCH_MS, Math.round(elapsedWall)));
            return;
          }
        }
      } else {
        stable = 0;
      }

      if (elapsedWall > MAX_WATCH_MS) {
        finalize(null);
      }
    }, STABLE_POLL_MS);
  }

  /**
   * @param {{ destroyed: boolean, site: string, getPromptTarget: () => Element|null, readComposer: () => string }} cfg
   * @returns {boolean}
   */
  function tryRecordTrustedSend(cfg, eventTargetEl) {
    if (cfg.destroyed) return false;

    const root = resolveComposerRoot(cfg);
    const targetEl = eventTargetEl instanceof Element ? eventTargetEl : null;

    const clickSendLike = !!(targetEl && isLikelySendButton(targetEl));
    const inComposerFocus = !!(targetEl && root && (targetEl === root || root.contains(targetEl)));

    if (!clickSendLike && !inComposerFocus) {
      return false;
    }

    let text = "";
    try {
      text = String(cfg.readComposer() || "").trim();
    } catch (_e) {
      text = "";
    }
    let chars = Math.min(12000, text.length);
    let wordsRough = chars ? text.split(/\s+/).filter(Boolean).length : 0;

    if (
      !chars &&
      clickSendLike &&
      recentComposerSnapshot.chars > 0 &&
      Date.now() - recentComposerSnapshot.at < 4000
    ) {
      chars = recentComposerSnapshot.chars;
      wordsRough = recentComposerSnapshot.words;
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
    const baselineFp = fingerprintAssistant(cfg.site);

    if (outstandingWatchers >= MAX_OUTSTANDING_WATCHERS) {
      enqueueRow({
        interaction_kind: "send",
        service: cfg.site === "unknown" ? "unknown" : String(cfg.site),
        composer_char_estimate: chars,
        composer_word_estimate: Math.min(12000, wordsRough),
        ...(meta.label
          ? { host_model_label: meta.label.slice(0, 120), host_model_bucket: meta.bucket.slice(0, 48) }
          : {}),
        host_response_latency_ms: null,
        assistant_output_char_estimate: null,
        time_to_first_stream_activity_ms: null,
        stream_visual_active_ms: null,
        client_occurred_ms: nowMs
      });
      return true;
    }

    outstandingWatchers += 1;
    watchLatency({ site: cfg.site }, baselineFp, chars, meta, wordsRough, nowMs);
    return true;
  }

  /** @param {{ site: string, getPromptTarget: () => Element|null, readComposer: () => string }} configuration */
  function install(configuration) {
    if (installedHere || window.self !== window.top || typeof configuration.readComposer !== "function") {
      return () => {};
    }
    installedHere = true;

    const cfg = {
      destroyed: false,
      site: String(configuration.site || "unknown"),
      getPromptTarget: typeof configuration.getPromptTarget === "function" ? configuration.getPromptTarget : () => null,
      readComposer: configuration.readComposer
    };

    /** Grab prompt length before hosts clear input on submit (esp. ChatGPT). */
    function onPointerDownCapture(ev) {
      if (ev?.isTrusted !== true || cfg.destroyed || ev.button !== 0) {
        return;
      }
      if (!isLikelySendButton(ev.target)) {
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

      globalThis.clearTimeout(composeDebounceTimer);
      composeDebounceTimer = globalThis.setTimeout(() => {
        composeDebounceTimer = null;
        enqueueComposerTypingSample(cfg);
      }, COMPOSER_INPUT_DEBOUNCE_MS);
    }

    function onCaptureClick(ev) {
      if (ev?.isTrusted !== true || cfg.destroyed) return;
      tryRecordTrustedSend(cfg, ev.target instanceof Element ? ev.target : null);
    }

    function onCaptureSubmit(ev) {
      if (ev?.isTrusted !== true || cfg.destroyed || !(ev.target instanceof HTMLFormElement)) return;
      const composer = resolveComposerRoot(cfg);
      if (!composer || !ev.target.contains(composer)) return;
      const sub = ev.submitter instanceof Element ? ev.submitter : ev.target.querySelector('button[type="submit"]');
      if (!(sub instanceof Element && isLikelySendButton(sub))) return;
      tryRecordTrustedSend(cfg, ev.target);
    }

    function onCaptureKey(ev) {
      if (cfg.destroyed || ev?.isTrusted !== true || ev.key !== "Enter") return;
      if (ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey || ev.isComposing) return;
      const root = resolveComposerRoot(cfg);
      const el = ev.target instanceof Node ? ev.target : null;
      if (root && el && (root === el || root.contains(el))) {
        tryRecordTrustedSend(cfg, el instanceof Element ? el : root);
      }
    }

    function onLeave() {
      globalThis.clearTimeout(composeDebounceTimer);
      composeDebounceTimer = null;
      flushQueued();
    }

    document.addEventListener("pointerdown", onPointerDownCapture, true);
    document.addEventListener("click", onCaptureClick, true);
    document.addEventListener("submit", onCaptureSubmit, true);
    window.addEventListener("keydown", onCaptureKey, true);

    /** Typing inside the AI composer (captures bubbling + shadow-heavy paths). */
    document.addEventListener("input", onComposerInputLike, true);
    document.addEventListener("keyup", onComposerInputLike, true);

    window.addEventListener("pagehide", onLeave, false);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && onLeave(), false);

    /** Flush occasionally so activity shows up without waiting for idle. */
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
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      document.removeEventListener("click", onCaptureClick, true);
      document.removeEventListener("submit", onCaptureSubmit, true);
      window.removeEventListener("keydown", onCaptureKey, true);
      document.removeEventListener("input", onComposerInputLike, true);
      document.removeEventListener("keyup", onComposerInputLike, true);
      window.removeEventListener("pagehide", onLeave, false);
      flushQueued();
    };
  }

  window.PromptlyHostActivityListener = { install };
})();
