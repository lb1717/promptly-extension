(() => {
  const MAX_CHARS = 120;
  const MAX_COMPOSER_CHARS = 12000;

  function trimLabel(s) {
    if (!s || typeof s !== "string") {
      return "";
    }
    return s.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  }

  /** Prefer short visible labels that resemble model selectors (not prose). */
  function acceptModelLabel(candidate) {
    const t = trimLabel(candidate);
    if (!t || t.length < 2 || t.length > 96) {
      return "";
    }
    if (/https?:\/\//i.test(t)) {
      return "";
    }
    if (/[.!?]\s+[A-Z]/.test(t) && t.length > 56) {
      return "";
    }
    return t;
  }

  function pickFromElements(nodes) {
    for (const el of nodes) {
      if (!(el instanceof Element)) {
        continue;
      }
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= 0) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        continue;
      }
      const label = acceptModelLabel(el.textContent || "");
      if (label) {
        return label;
      }
    }
    return "";
  }

  function scrapeChatGptModel() {
    const selectors = [
      '[data-testid="model-switcher-dropdown-button"]',
      '[data-testid="mode-switcher-popup-button"] button',
      'button[data-testid*="model" i]',
      '[data-heading="Model-selector"] button',
      "div[class*='ModelSwitcher'] button"
    ];
    for (const sel of selectors) {
      const found = pickFromElements(document.querySelectorAll(sel));
      if (found) {
        return found;
      }
    }
    const comboboxes = pickFromElements(
      document.querySelectorAll('[role="combobox"][aria-label*="model" i], [role="button"][aria-label*="model" i]')
    );
    if (comboboxes) {
      return comboboxes;
    }
    return "";
  }

  function scrapeClaudeModel() {
    const selectors = [
      "button[class*='model' i]",
      "[data-testid*='model-picker' i]",
      "[data-testid*='model-picker' i] button",
      "button[data-testid*='model' i]"
    ];
    for (const sel of selectors) {
      const found = pickFromElements(document.querySelectorAll(sel));
      if (found) {
        return found;
      }
    }
    return pickFromElements(document.querySelectorAll('[aria-label*="Model" i]'));
  }

  function scrapeGeminiModel() {
    const selectors = [
      "button[class*='mat-mdc-selection' i]",
      '[role="tablist"] [role="tab"][aria-selected="true"]',
      "button[class*='picker' i][class*='model' i]",
      "[data-tooltip*='Gemini' i]"
    ];
    for (const sel of selectors) {
      const found = pickFromElements(document.querySelectorAll(sel));
      if (found) {
        return found;
      }
    }
    return pickFromElements(document.querySelectorAll('[aria-haspopup][aria-label*="Model" i]'));
  }

  function scrapeHostModelLabel(site) {
    try {
      if (site === "chatgpt") {
        return scrapeChatGptModel();
      }
      if (site === "claude") {
        return scrapeClaudeModel();
      }
      if (site === "gemini") {
        return scrapeGeminiModel();
      }
    } catch (_e) {
      /* deliberate no-op — telemetry must never break compose */
    }
    return "";
  }

  function countWordsRough(text) {
    const normalized = String(text || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!normalized) {
      return 0;
    }
    const parts = normalized.split(" ").filter(Boolean);
    return Math.min(parts.length, 16000);
  }

  /**
   * @returns {Record<string, string|number|undefined|null>}
   */
  function collectForOptimize(site, promptText, userInstructionText) {
    const p = String(promptText || "").length;
    const u = String(userInstructionText || "").length;
    const combined = Math.min(MAX_COMPOSER_CHARS, Math.max(0, p + u));
    const hostLabel = scrapeHostModelLabel(site);
    const draft =
      typeof window.PromptlyHostActivityListener?.peekDraftMetrics === "function"
        ? window.PromptlyHostActivityListener.peekDraftMetrics()
        : { draft_duration_ms: null, draft_active_ms: null };
    const telemetry = {
      composer_char_estimate: combined,
      composer_word_estimate: countWordsRough(`${String(promptText || "")} ${String(userInstructionText || "")}`),
      draft_duration_ms: draft.draft_duration_ms,
      draft_active_ms: draft.draft_active_ms
    };
    if (hostLabel) {
      telemetry.host_model_label = hostLabel.slice(0, MAX_CHARS);
    }
    return telemetry;
  }

  window.PromptlyHostTelemetry = { collectForOptimize, scrapeHostModelLabel };
})();
