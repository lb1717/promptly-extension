(() => {
  const DEBOUNCE_SEND_MS = 750;
  const MIN_AFTER_SEND_BEFORE_DONE_MS = 900;
  const STABLE_POLL_MS = 500;
  const STABLE_NEED_TICKS = 3;
  const MAX_WATCH_MS = 120_000;
  const MAX_OUTSTANDING_WATCHERS = 4;

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

  /** @type {null | { destroyed: boolean, site: string, getPromptTarget: () => Element|null, readComposer: () => string }} */
  let state = null;
  /** @type {boolean} */
  let installedHere = false;
  let lastSendAt = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let flushTimer = null;
  /** @type {Array<Record<string, unknown>>} */
  let queue = [];
  /** @type {number} */
  let outstandingWatchers = 0;
  /** Composer snapshot grabbed on pointerdown over send — ChatGPT clears the box before capture-phase click fires. */
  let recentComposerSnapshot = { chars: 0, words: 0, at: 0 };

  function enqueueRow(row) {
    queue.push(row);
    if (queue.length > 25) {
      queue.splice(0, queue.length - 24);
    }
    if (!flushTimer) {
      flushTimer = globalThis.setTimeout(flushQueued, 4000);
    }
  }

  function flushQueued() {
    flushTimer = null;
    const batch = queue.splice(0, 24);
    if (!batch.length) return;
    try {
      chrome.runtime.sendMessage({ type: "PROMPTLY_HOST_ACTIVITY_BATCH", events: batch }, () => {
        void chrome.runtime.lastError;
      });
    } catch (_e) {
      /* extension torn down */
    }
  }

  /**
   * @param {object} opts
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

    function finalize(latencyMs) {
      if (ended) return;
      ended = true;
      if (intervalId !== undefined) {
        globalThis.clearInterval(intervalId);
        intervalId = undefined;
      }
      outstandingWatchers -= 1;
      enqueueRow({
        service: site === "unknown" ? "unknown" : String(site),
        composer_char_estimate: composerChars,
        composer_word_estimate: wordsRough >= 0 ? Math.min(12000, wordsRough) : null,
        ...(meta.label ? { host_model_label: meta.label.slice(0, 120), host_model_bucket: meta.bucket.slice(0, 48) } : {}),
        host_response_latency_ms: latencyMs,
        client_occurred_ms: occurredMs
      });
    }

    intervalId = globalThis.setInterval(() => {
      const elapsedWall = performance.now() - t0;
      const streaming = hostShowsStopControl(site);
      const fp = fingerprintAssistant(site);

      if (!streaming) {
        if (fingerprintMoved(prevFp, fp)) {
          stable = 0;
          prevFp = fp;
        } else if (elapsedWall >= MIN_AFTER_SEND_BEFORE_DONE_MS) {
          stable += 1;
          if (stable >= STABLE_NEED_TICKS && ((fp.len > 0 || fp.n > baselineFp.n) || elapsedWall > 5500)) {
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

    let meta = { label: "", bucket: "unknown" };
    try {
      if (typeof window.PromptlyHostTelemetry?.scrapeHostModelLabel === "function") {
        const scraped = String(window.PromptlyHostTelemetry.scrapeHostModelLabel(cfg.site) || "").trim();
        meta = { label: scraped.slice(0, 120), bucket: slugBucket(scraped) };
      }
    } catch (_e) {
      meta = { label: "", bucket: "unknown" };
    }

    const baselineFp = fingerprintAssistant(cfg.site);

    if (outstandingWatchers >= MAX_OUTSTANDING_WATCHERS) {
      enqueueRow({
        service: cfg.site === "unknown" ? "unknown" : String(cfg.site),
        composer_char_estimate: chars,
        composer_word_estimate: Math.min(12000, wordsRough),
        ...(meta.label
          ? { host_model_label: meta.label.slice(0, 120), host_model_bucket: meta.bucket.slice(0, 48) }
          : {}),
        host_response_latency_ms: null,
        client_occurred_ms: nowMs
      });
      return true;
    }

    outstandingWatchers += 1;
    watchLatency(cfg, baselineFp, chars, meta, wordsRough, nowMs);
    return true;
  }

  /** @param {{ site: string, getPromptTarget: () => Element|null, readComposer: () => string }} configuration */
  function install(configuration) {
    if (installedHere || window.self !== window.top || typeof configuration.readComposer !== "function") {
      return () => {};
    }
    installedHere = true;

    /** @type {{ destroyed: boolean, site: string, getPromptTarget: ()=>Element|null, readComposer: ()=>string }} */
    const cfg = {
      destroyed: false,
      site: String(configuration.site || "unknown"),
      getPromptTarget: typeof configuration.getPromptTarget === "function" ? configuration.getPromptTarget : () => null,
      readComposer: configuration.readComposer
    };
    state = cfg;

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

    /** @type {(ev: MouseEvent) => void} */
    function onCaptureClick(ev) {
      if (ev?.isTrusted !== true || cfg.destroyed) return;
      tryRecordTrustedSend(cfg, ev.target instanceof Element ? ev.target : null);
    }

    /** @type {(ev: SubmitEvent) => void} */
    function onCaptureSubmit(ev) {
      if (ev?.isTrusted !== true || cfg.destroyed || !(ev.target instanceof HTMLFormElement)) return;
      const composer = resolveComposerRoot(cfg);
      if (!composer || !ev.target.contains(composer)) return;
      const sub = ev.submitter instanceof Element ? ev.submitter : ev.target.querySelector('button[type="submit"]');
      if (!(sub instanceof Element && isLikelySendButton(sub))) return;
      tryRecordTrustedSend(cfg, ev.target);
    }

    /** @type {(ev: KeyboardEvent) => void} */
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
      flushQueued();
    }

    document.addEventListener("pointerdown", onPointerDownCapture, true);
    document.addEventListener("click", onCaptureClick, true);
    document.addEventListener("submit", onCaptureSubmit, true);
    window.addEventListener("keydown", onCaptureKey, true);
    window.addEventListener("pagehide", onLeave, false);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && onLeave(), false);

    return () => {
      cfg.destroyed = true;
      state = null;
      installedHere = false;
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      document.removeEventListener("click", onCaptureClick, true);
      document.removeEventListener("submit", onCaptureSubmit, true);
      window.removeEventListener("keydown", onCaptureKey, true);
      window.removeEventListener("pagehide", onLeave, false);
      flushQueued();
    };
  }

  window.PromptlyHostActivityListener = { install };
})();
