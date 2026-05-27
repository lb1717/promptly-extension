(() => {
  /** Ms of unchanged assistant surface after streaming stops → treat reply as settled. */
  const STABLE_MS = 1400;
  /** Poll even when MutationObserver misses shadow-DOM edge cases; works in background tabs (Date.now-based). */
  const POLL_MS = 900;
  /** Abandon watch and emit best-effort partial metrics. */
  const MAX_WATCH_MS = 600_000;
  /** Ignore tiny DOM noise before counting first-token / completion. */
  const MIN_ASSISTANT_GROWTH_CHARS = 6;

  const ASSISTANT_SELECTORS = {
    chatgpt: [
      '[data-message-author-role="assistant"]',
      '[data-testid="conversation-turn"] [data-message-author-role="assistant"]'
    ],
    claude: ['[data-testid="assistant-message"]', '[data-is-assistant="true"]', ".font-claude-message"],
    gemini: ["message-content.model-response-text", ".model-response-text", '[data-message-type="model"]']
  };

  function collectAssistantNodes(site) {
    const selectors = ASSISTANT_SELECTORS[site] || [];
    const seen = new Set();
    const out = [];
    for (const sel of selectors) {
      try {
        const nodes = document.querySelectorAll(sel);
        for (const node of nodes) {
          if (!(node instanceof Element) || seen.has(node)) {
            continue;
          }
          seen.add(node);
          out.push(node);
        }
      } catch (_e) {
        /* ignore invalid selector on exotic pages */
      }
    }
    return out;
  }

  function readNodePlainChars(el) {
    const t = String(el.innerText || el.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return t.length;
  }

  function detectStreaming(site) {
    try {
      if (site === "chatgpt") {
        return !!document.querySelector(
          '[data-testid="stop-button"], [data-testid="stop-generating-button"], button[aria-label*="Stop generating" i], button[aria-label*="Stop response" i]'
        );
      }
      if (site === "claude") {
        return !!document.querySelector('[data-is-streaming="true"], [data-is-streaming=""]');
      }
      if (site === "gemini") {
        return !!document.querySelector(
          ".thinking-message, [class*='streaming' i], [aria-busy='true'][class*='response' i]"
        );
      }
    } catch (_e) {
      return false;
    }
    return false;
  }

  function measureAssistant(site) {
    const nodes = collectAssistantNodes(site);
    let chars = 0;
    let count = 0;
    for (const node of nodes) {
      const n = readNodePlainChars(node);
      if (n > 0) {
        chars += n;
        count += 1;
      }
    }
    return {
      chars,
      count,
      streaming: detectStreaming(site)
    };
  }

  /**
   * Watch from native send until host assistant reply settles (or timeout / flush).
   * Uses wall-clock timestamps so elapsed time stays correct when the tab is in the background.
   *
   * @param {{ site: string, sendAtMs: number, onComplete: (metrics: Record<string, number|null|boolean>) => void }} params
   */
  function createWatch(params) {
    const site = String(params.site || "unknown");
    const sendAtMs = Math.max(0, Math.floor(Number(params.sendAtMs) || Date.now()));
    const baseline = measureAssistant(site);
    let firstStreamAt = null;
    let lastGrowthAt = sendAtMs;
    let done = false;

    const observer = new MutationObserver(() => {
      tick("mutation");
    });
    try {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (_e) {
      /* observe may fail on detached documents — polling still runs */
    }

    const interval = globalThis.setInterval(() => tick("poll"), POLL_MS);

    function finish(reason) {
      if (done) {
        return;
      }
      done = true;
      globalThis.clearInterval(interval);
      observer.disconnect();

      const now = Date.now();
      const final = measureAssistant(site);
      const assistantDelta = Math.max(0, final.chars - baseline.chars);
      const sawGrowth = assistantDelta >= MIN_ASSISTANT_GROWTH_CHARS || final.count > baseline.count;

      let hostResponseLatencyMs = null;
      if (firstStreamAt && (reason === "complete" || reason === "flush")) {
        hostResponseLatencyMs = Math.max(0, now - sendAtMs);
      } else if (reason === "timeout" && sawGrowth) {
        hostResponseLatencyMs = Math.max(0, now - sendAtMs);
      }

      let timeToFirstStreamActivityMs = null;
      if (firstStreamAt) {
        timeToFirstStreamActivityMs = Math.max(0, firstStreamAt - sendAtMs);
      }

      let streamVisualActiveMs = null;
      if (firstStreamAt && lastGrowthAt >= firstStreamAt) {
        streamVisualActiveMs = Math.max(0, lastGrowthAt - firstStreamAt);
      }

      let assistantOutputCharEstimate = null;
      if (assistantDelta >= MIN_ASSISTANT_GROWTH_CHARS) {
        assistantOutputCharEstimate = Math.min(400_000, assistantDelta);
      }

      params.onComplete({
        host_response_latency_ms: hostResponseLatencyMs,
        time_to_first_stream_activity_ms: timeToFirstStreamActivityMs,
        stream_visual_active_ms: streamVisualActiveMs,
        assistant_output_char_estimate: assistantOutputCharEstimate,
        response_watch_completed: reason === "complete"
      });
    }

    function tick(_source) {
      if (done) {
        return;
      }
      const now = Date.now();
      if (now - sendAtMs > MAX_WATCH_MS) {
        finish("timeout");
        return;
      }

      const cur = measureAssistant(site);
      const grew =
        cur.chars > baseline.chars + MIN_ASSISTANT_GROWTH_CHARS || cur.count > baseline.count;

      if (grew) {
        if (!firstStreamAt) {
          firstStreamAt = now;
        }
        lastGrowthAt = now;
      }

      if (firstStreamAt && !cur.streaming && now - lastGrowthAt >= STABLE_MS) {
        finish("complete");
      }
    }

    tick("init");

    return {
      cancel() {
        finish("cancel");
      },
      flush() {
        finish("flush");
      },
      getHeartbeat() {
        return {
          sendAtMs,
          site,
          firstStreamAt,
          lastGrowthAt,
          pending: !done
        };
      }
    };
  }

  window.PromptlyHostResponseWatcher = {
    createWatch,
    measureAssistant
  };
})();
