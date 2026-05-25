(() => {
  const adapters = window.PromptlySiteAdapters;
  const PositionManager = window.PromptlyPositionManager;
  const PromptlyObservers = window.PromptlyObservers;
  const PromptlyTabUI = window.PromptlyTabUI;

  if (!adapters || !PositionManager || !PromptlyObservers || !PromptlyTabUI) {
    return;
  }

  const site = adapters.getSite();
  if (!["chatgpt", "claude", "gemini"].includes(site)) {
    return;
  }

  const UI_DISPLAY_DELAY_MS = 300;
  const BASE_CONTEXT_WINDOW_WIDTH = 330;
  const EXPANDED_CONTEXT_WINDOW_MULTIPLIER = 1.5;
  /** Claude-only: nudge anchor top upward so the tab sits flush on the prompt shell (px). */
  const CLAUDE_PLACEMENT_TOP_OFFSET_PX = 24;
  /** Gemini-only: nudge anchor top downward slightly for better chatbox alignment (px). */
  const GEMINI_PLACEMENT_TOP_OFFSET_PX = 1;
  /** After Generate Prompt succeeds with the panel open, collapse back to tab-only (ms). */
  const COMPOSE_SUCCESS_PANEL_AUTO_CLOSE_MS = 2000;

  function purgeLegacyPromptlyNodes() {
    const staleNodes = document.querySelectorAll(
      "[data-promptly-root='true'], [data-promptly-ui='true']"
    );
    for (const node of staleNodes) {
      node.remove();
    }
  }

  purgeLegacyPromptlyNodes();

  let currentTarget = null;
  let hintedTarget = null;
  let isOpen = false;
  let destroyed = false;
  /** Skip applyPlacement when anchor geometry + open state unchanged (reduces jitter from inner scroll/input). */
  let lastPlacementSignature = null;
  let allowDisplay = false;
  let autoAdjustInFlight = false;
  let autoAdjustOnSend = false;
  let autoModeBlockedByTokens = false;
  let visibilityCreditsRefreshTimer = null;
  let creditsPollTimer = null;
  let creditRefreshInFlight = null;
  const CREDITS_POLL_MS = 45000;
  const EXTENSION_MESSAGE_TIMEOUT_MS = 14000;
  let bypassNextAutoSendInterception = false;
  let dragStartOffsetX = 0;
  let composeWidthExpanded = false;
  /** Teardown for passive host-site send/latency telemetry (runs even when Promptly optimize is unused). */
  let stopHostPassiveListener = null;
  let composePopupAutoCloseTimer = null;
  /** While > Date.now(), `sync` skips `ui.setContent` so further-improve chip curtain animation is not torn down. */
  let suppressOpenPopupSetContentUntilMs = 0;
  const FURTHER_IMPROVE_CURTAIN_MS = 300;

  function clearComposePopupAutoCloseTimer() {
    if (composePopupAutoCloseTimer != null) {
      window.clearTimeout(composePopupAutoCloseTimer);
      composePopupAutoCloseTimer = null;
    }
  }

  const MAX_DRAG_LEFT_PX = -75;
  const MAX_DRAG_RIGHT_PX = 225;
  const offsetStorageKey = `promptly:center-offset-x:${site}`;
  const autoSendStorageKey = `promptly:auto-adjust-on-send:${site}`;
  const visualStyleStorageKey = `promptly:visual-style:${site}`;
  const visualColorStorageKey = `promptly:visual-color:${site}`;
  const DEFAULT_APP_BASE_URL = "https://promptly-labs.com";

  function normalizeProxyBaseUrl(rawValue) {
    const normalized = String(rawValue || "").trim().replace(/\/$/, "") || DEFAULT_APP_BASE_URL;
    try {
      const parsed = new URL(normalized);
      const host = String(parsed.hostname || "").toLowerCase();
      const allowed =
        host === "promptly-labs.com" || host === "www.promptly-labs.com" || host === "localhost" || host === "127.0.0.1";
      if (!allowed || /\.workers\.dev$/i.test(host)) {
        return DEFAULT_APP_BASE_URL;
      }
    } catch (_error) {
      return DEFAULT_APP_BASE_URL;
    }
    return normalized;
  }

  const promptLifecycleState = {
    lastObservedText: "",
    pendingProgrammaticText: null,
    hasPromptlyRewrite: false,
    composePromptWritten: false,
    hideImprovePromptSection: false,
    /** After Generate Prompt: Improve button shows muted/disabled "Prompt Already Strong ✓". After Improve: muted "Prompt Improved ✓". */
    improveMutedByCompose: false,
    lockedSuggestions: null,
    appliedSuggestionKeys: new Set(),
    /** Mutually exclusive groups; one random option per session after Improve (not Generate). */
    furtherImproveChoices: null,
    appliedFurtherImproveIds: new Set()
  };

  const FURTHER_IMPROVE_GROUPS = [
    {
      options: [
        {
          id: "uploaded-sources",
          label: "Use Uploaded Sources",
          snippet:
            "<<Restrict all responses strictly to the provided uploaded sources and do not use any external knowledge.>>"
        },
        {
          id: "web-research",
          label: "Enable Web Research",
          snippet:
            "<<Incorporate relevant, up-to-date information from external sources when necessary to improve accuracy.>>"
        }
      ]
    },
    {
      options: [
        {
          id: "concise-output",
          label: "Concise Output Mode",
          snippet:
            "<<Deliver responses that are brief, direct, and free of unnecessary verbosity.>>"
        },
        {
          id: "in-depth",
          label: "In-Depth Explanation",
          snippet:
            "<<Provide thorough, detailed explanations with depth, nuance, and supporting reasoning.>>"
        }
      ]
    },
    {
      options: [
        {
          id: "beginner-friendly",
          label: "Beginner-Friendly Mode",
          snippet:
            "<<Explain concepts clearly and simply, defining terms and avoiding unnecessary complexity.>>"
        },
        {
          id: "expert-detail",
          label: "Expert-Level Detail",
          snippet:
            "<<Assume an expert audience and use advanced terminology with deep technical detail.>>"
        }
      ]
    },
    {
      options: [
        {
          id: "human-like",
          label: "Human-Like Writing",
          snippet:
            "<<Write in a natural, human-like tone with varied sentence structure and avoid robotic phrasing.>>"
        },
        {
          id: "professional-tone",
          label: "Professional Tone",
          snippet:
            "<<Use a formal, structured, and professional tone appropriate for business or academic contexts.>>"
        },
        {
          id: "creative-thinking",
          label: "Creative Thinking Mode",
          snippet:
            "<<Encourage originality and generate creative, non-obvious ideas or approaches.>>"
        }
      ]
    },
    {
      options: [
        {
          id: "step-by-step",
          label: "Step-by-Step Logic",
          snippet: "<<Break down reasoning into clear, sequential steps that are easy to follow.>>"
        },
        {
          id: "structured-formatting",
          label: "Structured Formatting",
          snippet:
            "<<Organize the response using clear sections, headings, and structured formatting for readability.>>"
        }
      ]
    },
    {
      options: [
        {
          id: "no-hallucination",
          label: "Strict No Hallucination",
          snippet:
            "<<Do not fabricate information; if uncertain or lacking data, explicitly state the limitation.>>"
        },
        {
          id: "self-check",
          label: "Self-Check Responses",
          snippet:
            "<<Review the response for errors, inconsistencies, or omissions and correct them before finalizing.>>"
        }
      ]
    },
    {
      options: [
        {
          id: "cite-sources",
          label: "Cite All Sources",
          snippet:
            "<<Provide clear citations or references for all factual claims and sourced information.>>"
        }
      ]
    },
    {
      options: [
        {
          id: "actionable",
          label: "Actionable Responses",
          snippet:
            "<<Focus on practical, executable guidance and avoid abstract or non-actionable content.>>"
        }
      ]
    }
  ];

  function shuffleFurtherImproveGroups(groups) {
    const arr = [...groups];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickFurtherImproveOptions(wordCount) {
    const need = wordCount <= 100 ? 5 : 6;
    const shuffled = shuffleFurtherImproveGroups(FURTHER_IMPROVE_GROUPS);
    const n = Math.min(need, shuffled.length);
    return shuffled.slice(0, n).map((group) => {
      const opts = group.options;
      return opts[Math.floor(Math.random() * opts.length)];
    });
  }

  /** Gate for Improve / auto-rewrite: at least 3 words. */
  function isImprovePromptSubstantive(text) {
    const t = String(text || "").trim();
    if (!t) {
      return false;
    }
    return t.split(/\s+/).filter(Boolean).length >= 3;
  }

  function looksLikePureGibberish(text) {
    const t = String(text || "").trim();
    if (!t) {
      return true;
    }
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    const words = t.split(/\s+/).filter(Boolean);
    const longWordCount = words.filter((w) => /[A-Za-z]{3,}/.test(w)).length;
    const letterRatio = letters / Math.max(1, t.length);
    return letterRatio < 0.35 || longWordCount < 2;
  }

  /** Generate Prompt: allow when 7+ words and not pure gibberish. */
  function isComposeDescriptionSubstantive(text) {
    const raw = String(text || "").trim();
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length < 7) {
      return false;
    }
    return !looksLikePureGibberish(raw);
  }

  function isCreditsHardExhausted(credits) {
    const max = Math.max(1, Number(credits?.max || 1));
    const used = Math.max(0, Number(credits?.used || 0));
    return Boolean(credits?.hard_exhausted) || used >= max;
  }

  function persistAutoSendPreference() {
    try {
      window.localStorage.setItem(autoSendStorageKey, autoAdjustOnSend ? "1" : "0");
    } catch (_error) {
      // Ignore storage errors.
    }
  }

  function sendExtensionMessage(payload, timeoutMs = EXTENSION_MESSAGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("Extension request timed out"));
      }, Math.max(1000, Number(timeoutMs) || EXTENSION_MESSAGE_TIMEOUT_MS));
      chrome.runtime.sendMessage(payload, (response) => {
        window.clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function startCreditsPolling() {
    stopCreditsPolling();
    creditsPollTimer = window.setInterval(() => {
      if (destroyed || document.visibilityState !== "visible" || ui.isSignedOut()) {
        return;
      }
      void refreshCreditsFromServer(null, { showLoading: false });
    }, CREDITS_POLL_MS);
  }

  function stopCreditsPolling() {
    if (creditsPollTimer != null) {
      window.clearInterval(creditsPollTimer);
      creditsPollTimer = null;
    }
  }

  function applyCreditsToUi(credits, options = {}) {
    if (!credits) {
      return;
    }
    const exhausted = isCreditsHardExhausted(credits);
    autoModeBlockedByTokens = exhausted;
    ui.setCreditUsage(credits);
    if (exhausted && autoAdjustOnSend) {
      autoAdjustOnSend = false;
      persistAutoSendPreference();
    }
    ui.setAutoSendEnabled(autoAdjustOnSend && !autoModeBlockedByTokens);
    if (exhausted && options?.announceNoTokens) {
      ui.showErrorToast("No more tokens left today.");
    }
  }

  function extractJsonObjectFromModelOutput(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) {
      return null;
    }
    let s = trimmed;
    const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
    if (fence) {
      s = fence[1].trim();
    }
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch (_err) {
      return null;
    }
  }

  function interpretComposeOptimizedOutput(raw) {
    const obj = extractJsonObjectFromModelOutput(raw);
    if (obj && String(obj.result || "").toLowerCase() === "insufficient") {
      return {
        ok: false,
        message: String(obj.message || "Add more detail: what you want, topic, and desired output.").slice(0, 220)
      };
    }
    if (obj && String(obj.result || "").toLowerCase() === "ok" && typeof obj.prompt === "string") {
      const p = obj.prompt.trim();
      if (p.length > 0) {
        return { ok: true, prompt: p };
      }
      return {
        ok: false,
        message: "The model returned an empty prompt. Try a clearer description."
      };
    }
    // Legacy / misformatted model output: if it looks like plain text, accept it.
    const plain = String(raw || "").trim();
    if (plain.length >= 10 && !/^\s*\{/.test(plain)) {
      return { ok: true, prompt: plain };
    }
    return {
      ok: false,
      message: "Could not read the response. Try again, or add a few words about what you want."
    };
  }

  async function getPromptlyAccountUrl() {
    const fallback = async () => {
      const values = await chrome.storage.sync.get(["proxyBaseUrl"]);
      const baseUrl = normalizeProxyBaseUrl(values.proxyBaseUrl);
      return `${baseUrl.replace(/\/$/, "")}/account`;
    };
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "PROMPTLY_GET_MANAGE_ACCOUNT_URL" }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(resp || {});
        });
      });
      const url = String(response?.data?.url || "").trim();
      if (url) {
        return url;
      }
    } catch (_error) {
      // Fall back to plain account page URL.
    }
    return fallback();
  }

  const positionManager = new PositionManager();
  positionManager.setContextWindowWidth(BASE_CONTEXT_WINDOW_WIDTH);
  function syncComposeContextWidth() {
    const width = composeWidthExpanded
      ? Math.round(BASE_CONTEXT_WINDOW_WIDTH * EXPANDED_CONTEXT_WINDOW_MULTIPLIER)
      : BASE_CONTEXT_WINDOW_WIDTH;
    positionManager.setContextWindowWidth(width);
  }
  let storedOffset = Number.NaN;
  try {
    const storedOffsetRaw = window.localStorage.getItem(offsetStorageKey);
    storedOffset = storedOffsetRaw === null ? Number.NaN : Number(storedOffsetRaw);
  } catch (_error) {
    storedOffset = Number.NaN;
  }
  if (Number.isFinite(storedOffset)) {
    positionManager.setPromptlyCenterOffsetX(
      Math.max(MAX_DRAG_LEFT_PX, Math.min(MAX_DRAG_RIGHT_PX, storedOffset))
    );
  }
  try {
    autoAdjustOnSend = window.localStorage.getItem(autoSendStorageKey) === "1";
  } catch (_error) {
    autoAdjustOnSend = false;
  }
  let savedVisualStyle = "default";
  try {
    savedVisualStyle = String(window.localStorage.getItem(visualStyleStorageKey) || "default").trim() || "default";
  } catch (_error) {
    savedVisualStyle = "default";
  }
  let savedVisualColor = "black";
  try {
    savedVisualColor = String(window.localStorage.getItem(visualColorStorageKey) || "black").trim() || "black";
  } catch (_error) {
    savedVisualColor = "black";
  }

  /** Skip strict visibility bounds (findMeasurableBoundsHost) when appending to the host composer. */
  function isLikelyWritableComposer(el) {
    if (!el || !el.isConnected) {
      return false;
    }
    if (typeof adapters.isInsidePromptlyUi === "function" && adapters.isInsidePromptlyUi(el)) {
      return false;
    }
    if ("disabled" in el && el.disabled) {
      return false;
    }
    if ("readOnly" in el && el.readOnly) {
      return false;
    }
    if (el instanceof HTMLTextAreaElement) {
      return true;
    }
    if (el instanceof HTMLInputElement) {
      return el.type === "text" || el.type === "search";
    }
    if (el.getAttribute("role") === "textbox") {
      return true;
    }
    return !!(el.isContentEditable || el.getAttribute("contenteditable") === "true");
  }

  function readPromptPlainForVerify(target) {
    if (!target || !isLikelyWritableComposer(target)) {
      return "";
    }
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      return String(target.value || "");
    }
    const surface =
      typeof adapters.getPromptWriteSurface === "function" ? adapters.getPromptWriteSurface(target) : target;
    const el = surface && isLikelyWritableComposer(surface) ? surface : target;
    return String(el.innerText || el.textContent || "").replace(/\u00a0/g, " ");
  }

  function queryFallbackHostComposer() {
    const owned = (node) =>
      !!node &&
      typeof adapters.isInsidePromptlyUi === "function" &&
      adapters.isInsidePromptlyUi(node);
    const selectors = [
      "#prompt-textarea",
      '[data-testid="chat-input"]',
      "textarea[data-testid]",
      "div.ProseMirror[contenteditable='true'][role='textbox']",
      "div[contenteditable='true'][role='textbox']"
    ];
    for (const sel of selectors) {
      let el = null;
      try {
        el = document.querySelector(sel);
      } catch (_e) {
        continue;
      }
      if (!el || !el.isConnected || owned(el)) {
        continue;
      }
      if (adapters.isEditable(el) || isLikelyWritableComposer(el)) {
        return el;
      }
    }
    return null;
  }

  /** ChatGPT / Claude sometimes mount the composer inside shadow roots — querySelector on document misses them. */
  function queryFallbackHostComposerDeep() {
    const owned = (node) =>
      !!node &&
      typeof adapters.isInsidePromptlyUi === "function" &&
      adapters.isInsidePromptlyUi(node);
    const candidates = [];
    const seen = new Set();
    function collect(root) {
      if (!root || !root.querySelectorAll) {
        return;
      }
      root.querySelectorAll("textarea, [contenteditable='true'], [role='textbox']").forEach((el) => {
        if (!(el instanceof Element) || seen.has(el)) {
          return;
        }
        seen.add(el);
        if (!el.isConnected || owned(el)) {
          return;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < 32 || rect.height < 8) {
          return;
        }
        candidates.push(el);
      });
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) {
          collect(el.shadowRoot);
        }
      });
    }
    collect(document.documentElement);
    candidates.sort((a, b) => {
      const rb = b.getBoundingClientRect().bottom;
      const ra = a.getBoundingClientRect().bottom;
      return rb - ra;
    });
    for (const el of candidates) {
      if (adapters.isEditable(el) || isLikelyWritableComposer(el)) {
        return el;
      }
    }
    return null;
  }

  /** Best-effort main chat composer for “improve further” — prefer a fresh scan, then tracked targets. */
  function resolveFurtherImproveHost() {
    const owned = (node) =>
      !!node &&
      typeof adapters.isInsidePromptlyUi === "function" &&
      adapters.isInsidePromptlyUi(node);
    const pick = (node) => {
      if (!node || !node.isConnected || owned(node)) {
        return null;
      }
      return isLikelyWritableComposer(node) ? node : null;
    };
    let host = null;
    if (typeof adapters.getPromptElement === "function") {
      host = pick(adapters.getPromptElement(null));
      if (!host) {
        host = pick(adapters.getPromptElement(currentTarget));
      }
    }
    if (!host) {
      host = pick(currentTarget);
    }
    if (!host) {
      host = pick(hintedTarget);
    }
    if (!host) {
      host = pick(queryFallbackHostComposer());
    }
    if (!host) {
      host = pick(queryFallbackHostComposerDeep());
    }
    return host;
  }

  const ui = new PromptlyTabUI({
    onToggle: () => {
      isOpen = !isOpen;
      ui.setOpen(isOpen);
      observers.scheduleUpdate();
      if (isOpen) {
        refreshCreditsFromServer();
      }
    },
    onSuggestionClick: () => {},
    onSignIn: async () => {
      try {
        const existing = await checkChromeSignedIn({ includeCredits: true }).catch(() => null);
        if (existing?.chromeEmail) {
          ui.setSignedOut(false);
          ui.setSettingsAccountEmail(existing.chromeEmail);
          ui.showToast(`Signed in as ${existing.chromeEmail}.`, { tone: "success" });
          if (existing.credits) {
            applyCreditsToUi(existing.credits);
            startCreditsPolling();
          } else {
            await refreshCreditsFromServer(null, { showLoading: true, force: true });
          }
          return;
        }
      } catch (_alreadySignedInCheck) {
        // Continue to interactive sign-in.
      }
      ui.showToast("Starting sign-in…", { tone: "info" });
      try {
        const result = await ensureChromeSignedIn();
        ui.showToast(
          `Signed in as ${String(result?.chromeEmail || "").trim() || "your account"}.`,
          { tone: "success" }
        );
        ui.setSignedOut(false);
        ui.setSettingsAccountEmail(String(result?.chromeEmail || "").trim());
        ui.showRepositionHint();
        if (result?.chromeEmail) {
          await refreshCreditsFromServer(null, { showLoading: true, force: true });
        }
      } catch (error) {
        ui.showErrorToast(mapPromptlyErrorToToast(String(error?.message || error)));
        await applySignedOutState(true);
        throw error;
      }
    },
    onLoadSettingsAccount: async () => {
      try {
        let email = "";
        try {
          const signedIn = await checkChromeSignedIn({ retries: 2 });
          email = String(signedIn?.chromeEmail || "").trim();
        } catch (_checkError) {
          const hint = await readLocalPersistedSessionHint();
          email = String(hint?.chromeEmail || "").trim();
        }
        if (!email) {
          return { email: "", subscriptionTier: "free" };
        }
        const data = await getPromptlyAccountStatus();
        return {
          email: String(data?.chromeEmail || email).trim() || email,
          subscriptionTier: String(data?.subscriptionTier || "").trim() || ""
        };
      } catch (_error) {
        return { email: "", subscriptionTier: "free" };
      }
    },
    onManageAccount: async () => {
      window.open(await getPromptlyAccountUrl(), "_blank");
    },
    onPromptlySignOut: async () => {
      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "PROMPTLY_CLEAR_SESSION" }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response || !response.ok) {
              reject(new Error(String(response?.error || "Sign out failed")));
              return;
            }
            resolve();
          });
        });
        stopCreditsPolling();
        ui.setSignedOut(true);
        ui.setSettingsAccountEmail("");
        observers.scheduleUpdate();
        ui.showToast("Signed out of Promptly.", { tone: "info", durationMs: 2200 });
      } catch (error) {
        ui.showErrorToast(String(error?.message || error));
      }
    },
    onRefreshCredits: (options) => refreshCreditsFromServer(null, options || {}),
    onVisualStyleChange: (style) => {
      const nextStyle =
        style === "midnight" ? "midnight" : style === "minimalistic" ? "minimalistic" : "default";
      try {
        window.localStorage.setItem(visualStyleStorageKey, nextStyle);
      } catch (_error) {
        // Ignore storage failures; style still applies in-session.
      }
      ui.setVisualStyle(nextStyle);
      observers.scheduleUpdate();
    },
    onVisualColorChange: (color) => {
      const next = ["black", "purple", "dark-blue", "dark-green"].includes(color) ? color : "black";
      try {
        window.localStorage.setItem(visualColorStorageKey, next);
      } catch (_error) {
        // Ignore storage failures; style still applies in-session.
      }
      ui.setVisualColor(next);
      observers.scheduleUpdate();
    },
    onFurtherImproveAppend: ({ id, snippet }) => {
      const fid = String(id || "").trim();
      const snip = String(snippet || "").trim();
      if (!fid || !snip) {
        return false;
      }
      if (promptLifecycleState.appliedFurtherImproveIds.has(fid)) {
        return false;
      }
      const host = resolveFurtherImproveHost();
      if (!host) {
        return false;
      }
      try {
        host.focus({ preventScroll: true });
      } catch (_err) {
        try {
          host.focus();
        } catch (_err2) {
          // Host may reject programmatic focus; replaceTargetText still attempts insertion.
        }
      }
      const ok = applyFurtherImproveSnippet(host, snip);
      if (!ok) {
        observers.scheduleUpdate();
        return false;
      }
      scrollPromptComposerToBottom(host);
      promptLifecycleState.appliedFurtherImproveIds.add(fid);
      hintedTarget = host;
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        refreshOpenPopupFromHost(host);
        observers.scheduleUpdate();
        return true;
      }
      suppressOpenPopupSetContentUntilMs = Date.now() + FURTHER_IMPROVE_CURTAIN_MS;
      window.setTimeout(() => {
        suppressOpenPopupSetContentUntilMs = 0;
        refreshOpenPopupFromHost(host);
        observers.scheduleUpdate();
      }, FURTHER_IMPROVE_CURTAIN_MS);
      return true;
    },
    onAutoAdjust: async (payload = {}) => {
      clearComposePopupAutoCloseTimer();
      if (autoAdjustInFlight || !currentTarget || !adapters.isEditable(currentTarget)) {
        return;
      }
      const mode = String(payload.mode || "improve");
      const isComposeMode = mode === "compose";
      if (!isOpen) {
        ui.setTabStatus("rewriting");
      }
      // Improve: show early loading. Compose: only show loading after validation — shine is driven by paste, not API timing.
      if (!isComposeMode) {
        ui.setAutoAdjustLoading(true, "reading prompt", false, "improve");
      }
      const originalPrompt = getPromptText(currentTarget).trim();
      const userInstruction = String(payload.userInstruction || "").trim();
      if (!isComposeMode && !isImprovePromptSubstantive(originalPrompt)) {
        if (!isOpen) {
          ui.setTabStatus("idle");
        }
        ui.setAutoAdjustLoading(false, "Prompt too short", true, "improve");
        return;
      }
      if (isComposeMode && !userInstruction) {
        if (!isOpen) {
          ui.setTabStatus("idle");
        }
        ui.setAutoAdjustLoading(false, "Add a description first", true, "compose");
        return;
      }
      if (isComposeMode && !isComposeDescriptionSubstantive(userInstruction)) {
        if (!isOpen) {
          ui.setTabStatus("idle");
        }
        ui.setAutoAdjustLoading(false, "Clarify/Expand Prompt Request", true, "compose");
        return;
      }
      if (!isComposeMode && promptLifecycleState.hideImprovePromptSection) {
        if (!isOpen) {
          ui.setTabStatus("idle");
        }
        ui.setAutoAdjustLoading(false, "already composed", true, "improve");
        return;
      }
      if (!isComposeMode && promptLifecycleState.hasPromptlyRewrite) {
        if (!isOpen) {
          ui.setTabStatus("idle");
        }
        ui.setAutoAdjustLoading(false, "already improved", true, "improve");
        return;
      }

      autoAdjustInFlight = true;
      let hadError = false;
      let composeSuccessUiHandled = false;
      let didApplyOptimizedPrompt = false;
      try {
        // Improve: require visible service sign-in + optional page email match. Generate Prompt only
        // needs Chrome Google sign-in (checked in the background on optimize); skip the stricter page gate.
        if (!isComposeMode) {
          await verifyCurrentUserSession();
        }
        const userHint = String(payload.suffix || "").trim();
        const optimizeMode = isComposeMode ? "generate" : "improve";
        ui.setAutoAdjustLoading(true, "analyzing", false, isComposeMode ? "compose" : "improve");
        const optimizationPromise = isComposeMode
          ? optimizePromptViaProxy(userInstruction, "", { optimizeMode })
          : optimizePromptViaProxy(originalPrompt, userHint, { optimizeMode });
        const optimization = await optimizationPromise;
        const optimizedPrompt = optimization.optimizedPrompt;
        if (optimization.credits) {
          applyCreditsToUi(optimization.credits, { announceNoTokens: true });
        }
        if (!isComposeMode) {
          ui.setAutoAdjustLoading(true, "updating", false, "improve");
        }
        // Mark pending programmatic text BEFORE dispatching input events,
        // so observers/sync don't treat it as a user edit mid-animation.
        markPromptlyRewrite(optimizedPrompt);
        replaceTargetText(currentTarget, optimizedPrompt);
        playPromptImproveBoxFlash(currentTarget);
        didApplyOptimizedPrompt = true;
        if (isComposeMode) {
          // Order guarantee: deliver generated prompt first, then switch button to
          // "Prompt Generated" animation. Never hold output for UI stage timing.
          window.requestAnimationFrame(() => {
            ui.setAutoAdjustLoading(false, "", false, "compose");
          });
          composeSuccessUiHandled = true;
          promptLifecycleState.composePromptWritten = true;
          promptLifecycleState.improveMutedByCompose = true;
          if (isOpen) {
            composePopupAutoCloseTimer = window.setTimeout(() => {
              composePopupAutoCloseTimer = null;
              closePopup();
            }, COMPOSE_SUCCESS_PANEL_AUTO_CLOSE_MS);
          }
        } else {
          promptLifecycleState.improveMutedByCompose = false;
          const wc = String(optimizedPrompt || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean).length;
          promptLifecycleState.furtherImproveChoices = pickFurtherImproveOptions(wc);
          promptLifecycleState.appliedFurtherImproveIds = new Set();
        }
        if (!isOpen) {
          ui.setTabStatus(isComposeMode ? "strong" : "improved");
        }
      } catch (_error) {
        hadError = true;
        if (_error?.promptlyNeedsSignIn) {
          void applySignedOutState(true);
        }
        const rawReason = String(_error?.message || _error || "failed");
        const toastMsg = mapPromptlyErrorToToast(rawReason);
        if (_error?.promptlyCredits) {
          applyCreditsToUi(_error.promptlyCredits, { announceNoTokens: true });
        }
        const limitReached = /daily api token limit reached|daily credit limit reached/i.test(rawReason);
        const tokenShortfall = /not enough api tokens|not enough daily tokens/i.test(rawReason);
        if (!(_error?.promptlyCredits) && (limitReached || tokenShortfall)) {
          try {
            const credits = await fetchCreditUsageViaProxy();
            if (credits) {
              applyCreditsToUi(credits, { announceNoTokens: true });
            }
          } catch (_creditsError) {
            // Ignore credits refresh failure; primary error is already surfaced.
          }
        }
        ui.setAutoAdjustLoading(false, toastMsg, true, isComposeMode ? "compose" : "improve");
        if (!isOpen) {
          ui.setTabStatus("idle");
        }
      } finally {
        autoAdjustInFlight = false;
        const finalize = () => {
          if (!hadError && (!isComposeMode || !composeSuccessUiHandled)) {
            ui.setAutoAdjustLoading(false, "", false, isComposeMode ? "compose" : "improve");
          }
          observers.scheduleUpdate();
        };
        if (didApplyOptimizedPrompt) {
          window.requestAnimationFrame(finalize);
        } else {
          finalize();
        }
      }
    },
    onLayoutChange: (hint = {}) => {
      const rawLines = Number(hint?.rawLines || 0);
      const shouldExpand = rawLines > 1;
      if (shouldExpand !== composeWidthExpanded) {
        composeWidthExpanded = shouldExpand;
        syncComposeContextWidth();
      }
      observers.scheduleUpdate();
    },
    onToggleAutoSend: () => {
      if (autoModeBlockedByTokens) {
        autoAdjustOnSend = false;
        persistAutoSendPreference();
        ui.setAutoSendEnabled(false);
        ui.showErrorToast("No more tokens left today.");
        observers.scheduleUpdate();
        return;
      }
      autoAdjustOnSend = !autoAdjustOnSend;
      persistAutoSendPreference();
      ui.setAutoSendEnabled(autoAdjustOnSend);
      observers.scheduleUpdate();
    },
    onDragStart: () => {
      dragStartOffsetX = positionManager.getPromptlyCenterOffsetX();
    },
    onDragMove: (deltaX) => {
      const nextOffset = Math.max(
        MAX_DRAG_LEFT_PX,
        Math.min(MAX_DRAG_RIGHT_PX, Math.round(dragStartOffsetX + deltaX))
      );
      positionManager.setPromptlyCenterOffsetX(nextOffset);
      observers.scheduleUpdate();
    },
    onDragEnd: () => {
      try {
        window.localStorage.setItem(
          offsetStorageKey,
          String(positionManager.getPromptlyCenterOffsetX())
        );
      } catch (_error) {
        // Ignore storage failures; drag still works for current session.
      }
    }
  });
  ui.setVisualStyle(savedVisualStyle);
  ui.setVisualColor(savedVisualColor);

  const observers = new PromptlyObservers({
    onUpdate: sync,
    onTargetEvent: (target) => {
      if (adapters.isEditable(target)) {
        hintedTarget = target;
      }
    },
    // Gemini's composer animates heavily on load; disable continuous tracking
    // to prevent post-appear vertical drifting.
    enableContinuousPositionTracking: site !== "gemini",
    getAnchorElement:
      typeof adapters.getAnchorElement === "function"
        ? (target) => adapters.getAnchorElement(target)
        : null
  });
  const unlockDisplayTimer = window.setTimeout(() => {
    allowDisplay = true;
    observers.scheduleUpdate();
  }, UI_DISPLAY_DELAY_MS);
  ui.setAutoSendEnabled(autoAdjustOnSend);

  function isPromptlyAuthSessionError(message) {
    const lowered = String(message || "").toLowerCase();
    if (!lowered) {
      return false;
    }
    if (lowered.includes("not signed in on this ai service")) {
      return false;
    }
    if (lowered.includes("does not match your promptly sign-in")) {
      return false;
    }
    if (lowered.includes("account mismatch")) {
      return false;
    }
    return (
      lowered.includes("sign in to promptly") ||
      lowered.includes("not signed in") ||
      lowered.includes("missing firebase auth token")
    );
  }

  async function checkChromeSignedInOnce(options = {}) {
    const response = await sendExtensionMessage({
      type: "PROMPTLY_CHECK_CHROME_SIGNIN",
      includeCredits: options.includeCredits === true,
      forceRefresh: options.forceRefresh === true
    });
    if (!response || !response.ok) {
      throw new Error(response?.error || "Not signed in");
    }
    return response.data || {};
  }

  function isTransientExtensionMessageError(message) {
    const lowered = String(message || "").toLowerCase();
    return (
      lowered.includes("could not establish connection") ||
      lowered.includes("receiving end does not exist") ||
      lowered.includes("extension context invalidated") ||
      lowered.includes("message port closed") ||
      lowered.includes("timed out")
    );
  }

  function readLocalPersistedSessionHint() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve(null);
        return;
      }
      chrome.storage.local.get(
        ["promptlyFirebaseIdentity", "promptlyWebAuthEmail", "promptlyWebAuthAccessToken", "promptlyWebAuthExpiresAt"],
        (data) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          const identity = data?.promptlyFirebaseIdentity || null;
          const firebaseEmail = String(identity?.email || "").trim().toLowerCase();
          if (firebaseEmail) {
            resolve({ chromeEmail: firebaseEmail });
            return;
          }
          const webEmail = String(data?.promptlyWebAuthEmail || "").trim().toLowerCase();
          const webToken = String(data?.promptlyWebAuthAccessToken || "").trim();
          const webExp = Number(data?.promptlyWebAuthExpiresAt || 0);
          if (webEmail && webToken && webExp > Date.now() + 15_000) {
            resolve({ chromeEmail: webEmail });
            return;
          }
          if (identity?.refreshToken && firebaseEmail) {
            resolve({ chromeEmail: firebaseEmail });
            return;
          }
          resolve(null);
        }
      );
    });
  }

  async function checkChromeSignedIn(options = {}) {
    const retries = Math.max(1, Number(options.retries) || 3);
    let lastError = null;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        return await checkChromeSignedInOnce(options);
      } catch (error) {
        lastError = error;
        const message = String(error?.message || error || "");
        if (isTransientExtensionMessageError(message) && attempt < retries - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 180 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error("Not signed in");
  }

  async function hasPersistedPromptlySession() {
    try {
      const session = await checkChromeSignedIn({ retries: 2 });
      if (String(session?.chromeEmail || "").trim()) {
        return true;
      }
    } catch (_error) {
      // Fall through to local storage hint.
    }
    const hint = await readLocalPersistedSessionHint();
    return !!String(hint?.chromeEmail || "").trim();
  }

  async function applySignedOutState(isSignedOut) {
    if (!isSignedOut) {
      ui.setSignedOut(false);
      return;
    }
    if (await hasPersistedPromptlySession()) {
      ui.setSignedOut(false);
      return;
    }
    ui.setSignedOut(true);
    ui.setSettingsAccountEmail("");
    stopCreditsPolling();
  }

  async function applySignedInStateFromSession(session, options = {}) {
    const email = String(session?.chromeEmail || "").trim();
    if (!email) {
      await applySignedOutState(true);
      return;
    }
    ui.setSignedOut(false);
    ui.setSettingsAccountEmail(email);
    if (options.loadCredits !== false) {
      if (session?.credits) {
        applyCreditsToUi(session.credits);
        startCreditsPolling();
      } else {
        await refreshCreditsFromServer(null, { showLoading: !ui.hasCreditUsageData(), force: true });
      }
    }
    if (options.loadAccountStatus) {
      try {
        const status = await getPromptlyAccountStatus();
        if (status?.chromeEmail) {
          ui.setSettingsAccountEmail(String(status.chromeEmail).trim());
        }
        if (status?.subscriptionTier) {
          ui.setSettingsTierBadge(String(status.subscriptionTier).trim());
        }
      } catch (_statusError) {
        // Signed-in UI still holds from persisted session.
      }
    }
  }

  async function syncSignedInUiFromSession() {
    const hint = await readLocalPersistedSessionHint();
    if (hint?.chromeEmail) {
      ui.setSignedOut(false);
      ui.setSettingsAccountEmail(hint.chromeEmail);
      void refreshCreditsFromServer(null, { showLoading: true, force: true });
    }
    try {
      const session = await checkChromeSignedIn({ retries: 4, includeCredits: true });
      await applySignedInStateFromSession(session, { loadCredits: true, loadAccountStatus: true });
    } catch (_error) {
      if (hint?.chromeEmail) {
        ui.setSignedOut(false);
        ui.setSettingsAccountEmail(hint.chromeEmail);
        await refreshCreditsFromServer(null, { showLoading: !ui.hasCreditUsageData(), force: true });
        return;
      }
      await applySignedOutState(true);
    }
  }

  // Detect sign-in status on startup (non-interactive).
  syncSignedInUiFromSession();

  function getPromptText(target) {
    if (!target || !adapters.isEditable(target)) {
      return "";
    }
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      return String(target.value || "");
    }
    const surface =
      typeof adapters.getPromptWriteSurface === "function" ? adapters.getPromptWriteSurface(target) : target;
    const el = surface && adapters.isEditable(surface) ? surface : target;
    return String(el.innerText || el.textContent || "").replace(/\u00a0/g, " ");
  }

  function setNativeValue(element, value) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function dispatchInputEvents(element, insertedText) {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        data: insertedText,
        inputType: "insertReplacementText"
      })
    );
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function verifyCurrentUserSession() {
    const hints = adapters.getSessionVerificationHints
      ? adapters.getSessionVerificationHints(currentTarget)
      : { site, hasAuthenticatedUi: !!currentTarget, pageEmailHint: null };
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "PROMPTLY_VERIFY_USER_SESSION",
          site: hints.site || site,
          hasAuthenticatedUi: !!hints.hasAuthenticatedUi,
          pageEmailHint: hints.pageEmailHint || ""
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            const err = String(response?.error || "User verification failed");
            if (isPromptlyAuthSessionError(err)) {
              void applySignedOutState(true);
            }
            reject(new Error(err));
            return;
          }
      ui.setSignedOut(false);
          resolve(response.data || {});
        }
      );
    });
  }

  function mapPromptlyErrorToToast(message) {
    const msg = String(message || "").trim();
    const lowered = msg.toLowerCase();
    if (!msg) return "Something went wrong.";
    if (lowered.includes("sign in to chrome")) return "Sign in to Chrome with your Google account to use Promptly.";
    if (lowered.includes("only gmail chrome profiles")) return "Use a Chrome profile signed into Google.";
    if (lowered.includes("only gmail accounts are allowed")) return "Sign in with Google (any verified Google account).";
    if (lowered.includes("only gmail users are allowed")) return "Sign in with Google (any verified Google account).";
    if (lowered.includes("service account email does not match")) {
      return "Account mismatch: use the same Google account in Chrome as on this site.";
    }
    if (lowered.includes("does not match your chrome profile")) {
      return "Account mismatch: use the same Google account in Chrome as on this site.";
    }
    if (lowered.includes("signed-in account on this page does not match")) {
      return "Account mismatch: use the same account on this site as in Promptly / Chrome.";
    }
    if (lowered.includes("sign in to promptly first")) {
      return "Sign in to Promptly first — use the Sign in button on the tab.";
    }
    if (lowered.includes("not signed in on this ai service page")) return "Sign in on this AI site, then try again.";
    if (lowered.includes("daily api token limit reached")) return "Daily token limit reached. Try again tomorrow.";
    if (lowered.includes("not enough api tokens")) return "Not enough tokens left for this prompt.";
    if (lowered.includes("timeout")) return "Request timed out. Try again.";
    if (lowered.includes("sign in with promptly first")) return "Sign in with the tab Sign in button, then try again.";
    // Legacy server message; current API never returns this for improve.
    if (lowered.includes("echoed the request") || lowered.includes("request wrapper")) {
      return "Try Improve again in a moment.";
    }
    return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg;
  }

  async function getPromptlyAccountStatus() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "PROMPTLY_GET_ACCOUNT_STATUS" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error(response?.error || "Unable to load account status"));
          return;
        }
        resolve(response.data || {});
      });
    });
  }

  async function ensureChromeSignedIn() {
    return new Promise((resolve, reject) => {
      // Web auth flow can stay open while the user picks an account — allow enough time.
      const timer = window.setTimeout(() => {
        reject(new Error("Sign-in timed out. Finish the Google window or try again."));
      }, 120000);
      chrome.runtime.sendMessage({ type: "PROMPTLY_ENSURE_CHROME_SIGNIN" }, (response) => {
        window.clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error(response?.error || "Sign-in failed"));
          return;
        }
        resolve(response.data || {});
      });
    });
  }

  async function optimizePromptViaProxy(prompt, userInstruction = "", options = {}) {
    const optimizeMode = options.optimizeMode || (options.compose ? "generate" : "improve");
    let telemetry =
      typeof window.PromptlyHostTelemetry?.collectForOptimize === "function"
        ? window.PromptlyHostTelemetry.collectForOptimize(site, prompt, userInstruction)
        : null;
    if (!telemetry || typeof telemetry !== "object") {
      telemetry = undefined;
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "PROMPTLY_OPTIMIZE_PROMPT",
          prompt,
          userInstruction: String(userInstruction || "").trim(),
          optimizeMode,
          service: site,
          ...(telemetry ? { telemetry } : {})
        },
        (response) => {
          try {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response || !response.ok) {
              const err = new Error(response?.error || "Auto adjust failed");
              if (response?.needsSignIn) {
                err.promptlyNeedsSignIn = true;
              }
              if (response?.credits) {
                err.promptlyCredits = response.credits;
              }
              reject(err);
              return;
            }
            const optimized = String(response.data.optimized_prompt || "").trim();
            const clientFallback =
              optimizeMode === "generate"
                ? String(userInstruction || prompt || "").trim()
                : String(prompt || userInstruction || "").trim();
            const effective = optimized || clientFallback;
            if (!effective) {
              reject(new Error("Empty optimized prompt"));
              return;
            }
            if (optimizeMode === "generate") {
              const interpreted = interpretComposeOptimizedOutput(effective);
              if (!interpreted.ok) {
                reject(new Error(interpreted.message));
                return;
              }
              resolve({
                optimizedPrompt: interpreted.prompt,
                credits: response.data.credits || null
              });
              return;
            }
            resolve({
              optimizedPrompt: effective,
              credits: response.data.credits || null
            });
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      );
    });
  }

  async function fetchCreditUsageViaProxy(estimate = null, options = {}) {
    const payload = { type: "PROMPTLY_GET_CREDITS" };
    if (options.forceRefresh === true) {
      payload.forceRefresh = true;
    }
    if (
      estimate &&
      typeof estimate.promptLength === "number" &&
      typeof estimate.instructionLength === "number"
    ) {
      payload.estimatePromptLength = estimate.promptLength;
      payload.estimateInstructionLength = estimate.instructionLength;
    }
    const response = await sendExtensionMessage(payload);
    if (!response || !response.ok) {
      const err = new Error(response?.error || "Unable to load credits");
      if (response?.needsSignIn) {
        err.promptlyNeedsSignIn = true;
      }
      throw err;
    }
    return response.data?.credits || null;
  }

  async function refreshCreditsFromServer(estimate = null, options = {}) {
    const showLoading = options.showLoading !== false;
    const force = options.force === true;
    if (ui.isSignedOut()) {
      return;
    }
    if (creditRefreshInFlight && !force) {
      try {
        await Promise.race([
          creditRefreshInFlight,
          new Promise((_, reject) =>
            window.setTimeout(() => reject(new Error("Credits fetch timed out")), EXTENSION_MESSAGE_TIMEOUT_MS)
          )
        ]);
        if (ui.hasCreditUsageData()) {
          return;
        }
      } catch (_waitError) {
        creditRefreshInFlight = null;
      }
    }
    if (showLoading && !ui.hasCreditUsageData()) {
      ui.setCreditUsageLoading(true);
    }
    const task = (async () => {
      try {
        let credits = null;
        let lastError = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            credits = await fetchCreditUsageViaProxy(estimate, {
              forceRefresh: force || attempt > 0
            });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (error?.promptlyNeedsSignIn) {
              throw error;
            }
            const message = String(error?.message || error || "");
            if (attempt < 3) {
              await new Promise((resolve) => window.setTimeout(resolve, 280 * (attempt + 1)));
              continue;
            }
            if (isTransientExtensionMessageError(message)) {
              throw error;
            }
            throw error;
          }
        }
        if (credits) {
          applyCreditsToUi(credits);
          ui.setSignedOut(false);
          startCreditsPolling();
          return;
        }
        if (lastError) {
          throw lastError;
        }
        if (showLoading || options.fromHover) {
          ui.setCreditUsageUnavailable();
        }
      } catch (error) {
        if (error?.promptlyNeedsSignIn) {
          stopCreditsPolling();
          void applySignedOutState(true);
        } else if (showLoading || options.fromHover) {
          ui.setCreditUsageUnavailable();
        }
      } finally {
        ui.setCreditUsageLoading(false);
      }
    })();
    creditRefreshInFlight = task;
    try {
      await task;
    } finally {
      if (creditRefreshInFlight === task) {
        creditRefreshInFlight = null;
      }
    }
  }

  function scheduleCreditsRefreshWhenVisible() {
    if (destroyed || document.visibilityState !== "visible") {
      return;
    }
    window.clearTimeout(visibilityCreditsRefreshTimer);
    visibilityCreditsRefreshTimer = window.setTimeout(() => {
      visibilityCreditsRefreshTimer = null;
      if (destroyed || document.visibilityState !== "visible") {
        return;
      }
      void syncSignedInUiFromSession();
      refreshCreditsFromServer();
    }, 400);
  }

  function normalizeComposerPlainLength(s) {
    return String(s || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n/g, "\n")
      .trimEnd().length;
  }

  /** Minimal HTML for clipboard paste: double newlines → paragraphs, single newlines → <br>. */
  function plainTextToPasteHtml(s) {
    const raw = String(s || "").replace(/\r\n/g, "\n");
    if (!raw) {
      return "<p></p>";
    }
    const esc = (t) =>
      t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const chunks = raw.split(/\n\n+/).filter((c) => c.trim().length > 0);
    if (chunks.length === 0) {
      return `<p>${esc(raw)}</p>`;
    }
    return chunks.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  }

  /**
   * Host composers often use white-space: normal so plain "\\n" from the API collapses visually.
   * Always force a whitespace mode that preserves newlines when we inject model text.
   */
  function ensureContentEditablePlainNewlines(target) {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      return;
    }
    if (!target.isContentEditable) {
      return;
    }
    target.style.whiteSpace = "pre-wrap";
  }

  /**
   * ProseMirror-style contenteditable composers often truncate a single execCommand("insertText")
   * for long strings. Prefer synthetic paste after a hard clear, then chunked insertText, then
   * textContent fallback. Always clear existing text first—otherwise paste can append and leave
   * the old prompt above the improved text.
   */
  function replaceContentEditableText(target, fullText) {
    const text = String(fullText ?? "");
    if (document.activeElement !== target) {
      target.focus();
    }

    const normPlain = (s) =>
      String(s || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n/g, "\n")
        .trim();

    const readSurfacePlainLength = () =>
      normalizeComposerPlainLength(
        String(target.innerText || target.textContent || "").replace(/\u00a0/g, " ")
      );

    const surfaceMatchesDesired = () => normPlain(target.innerText || target.textContent) === normPlain(text);

    const trySyntheticPaste = (htmlOverride) => {
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        dt.setData(
          "text/html",
          htmlOverride != null && htmlOverride !== "" ? htmlOverride : plainTextToPasteHtml(text)
        );
        target.dispatchEvent(
          new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt })
        );
      } catch (_e) {
        // Synthetic paste is not supported in all environments.
      }
    };

    const expected = normalizeComposerPlainLength(text);
    const selection = window.getSelection();
    const selectAllEditable = () => {
      if (!selection) {
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
    };

    const clearSelection = () => {
      selectAllEditable();
      if (typeof document.execCommand === "function") {
        document.execCommand("delete", false);
      } else if (selection && selection.rangeCount > 0) {
        selection.getRangeAt(0).deleteContents();
      } else {
        target.textContent = "";
      }
    };

    const insertInChunks = () => {
      const CHUNK = 700;
      if (typeof document.execCommand === "function") {
        clearSelection();
        for (let i = 0; i < text.length; i += CHUNK) {
          document.execCommand("insertText", false, text.slice(i, i + CHUNK));
        }
      } else {
        target.textContent = text;
      }
      dispatchInputEvents(target, text);
    };

    const applyPasteHtml = () => {
      target.innerHTML = plainTextToPasteHtml(text);
      // `normal` collapses literal newlines in text nodes; host composers often need pre-wrap
      // so pasted/improved prompts keep paragraph structure until ProseMirror normalizes.
      target.style.whiteSpace = "pre-wrap";
      dispatchInputEvents(target, text);
    };

    clearSelection();

    // ProseMirror-style composers: insertText chunks almost always collapse `\n\n` after a failed
    // synthetic-paste match. Never use insertInChunks when the model output has structural newlines.
    const hasStructuralNewlines = /\n/.test(text);
    if (hasStructuralNewlines) {
      let pasteHtml = "";
      try {
        pasteHtml = plainTextToPasteHtml(text);
      } catch (_e) {
        pasteHtml = "";
      }

      const applyPasteHtmlFrom = (html) => {
        if (!html) {
          return;
        }
        target.innerHTML = html;
        target.style.whiteSpace = "pre-wrap";
        dispatchInputEvents(target, text);
      };

      try {
        applyPasteHtmlFrom(pasteHtml);
      } catch (_e) {
        ensureContentEditablePlainNewlines(target);
      }

      if (surfaceMatchesDesired()) {
        ensureContentEditablePlainNewlines(target);
        return;
      }

      trySyntheticPaste(pasteHtml);
      dispatchInputEvents(target, text);

      if (!surfaceMatchesDesired()) {
        if (expected > 200 && readSurfacePlainLength() < expected * 0.92) {
          target.textContent = text;
          target.style.whiteSpace = "pre-wrap";
          dispatchInputEvents(target, text);
        } else if (expected > 80) {
          target.textContent = text;
          target.style.whiteSpace = "pre-wrap";
          dispatchInputEvents(target, text);
        }
      }

      ensureContentEditablePlainNewlines(target);
      if (!surfaceMatchesDesired()) {
        try {
          applyPasteHtmlFrom(pasteHtml);
        } catch (_e2) {
          ensureContentEditablePlainNewlines(target);
        }
      }
      return;
    }

    if (text.length > 400) {
      trySyntheticPaste();
      dispatchInputEvents(target, text);
    }

    if (text.length <= 400 || !surfaceMatchesDesired()) {
      insertInChunks();
    }

    if (expected > 200 && readSurfacePlainLength() < expected * 0.92) {
      target.textContent = text;
      dispatchInputEvents(target, text);
    } else if (!surfaceMatchesDesired() && expected > 80) {
      target.textContent = text;
      dispatchInputEvents(target, text);
    }

    ensureContentEditablePlainNewlines(target);

    if (!surfaceMatchesDesired()) {
      try {
        applyPasteHtml();
      } catch (_e) {
        ensureContentEditablePlainNewlines(target);
      }
    }
  }

  function replaceTargetText(target, text, opts = {}) {
    const relaxed = opts.relaxedComposer === true;
    const writable = relaxed ? isLikelyWritableComposer(target) : adapters.isEditable(target);
    if (!target || !writable) {
      return;
    }
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      // Avoid redundant focus shifts (can trigger heavy host re-render).
      if (document.activeElement !== target) {
        target.focus();
      }
      setNativeValue(target, text);
      if (typeof target.setSelectionRange === "function") {
        target.setSelectionRange(text.length, text.length);
      }
      dispatchInputEvents(target, text);
      return;
    }

    const surface =
      typeof adapters.getPromptWriteSurface === "function" ? adapters.getPromptWriteSurface(target) : target;
    replaceContentEditableText(surface || target, text);
  }

  /**
   * Brief green wash over the host prompt “shell” (same outer bounds Promptly uses via getAnchorElement).
   */
  function playPromptImproveBoxFlash(target) {
    if (destroyed || !target || !target.isConnected) {
      return;
    }
    const run = () => {
      if (destroyed || !target.isConnected) {
        return;
      }
      let boxEl = adapters.getAnchorElement ? adapters.getAnchorElement(target) : target;
      if (!boxEl || !boxEl.isConnected) {
        boxEl = target;
      }
      let r = boxEl.getBoundingClientRect();
      let cornerEl = boxEl;
      if (r.width < 40 || r.height < 16) {
        r = target.getBoundingClientRect();
        cornerEl = target;
      }
      if (r.width < 40 || r.height < 16) {
        return;
      }
      if (r.height > window.innerHeight * 0.88) {
        const tr = target.getBoundingClientRect();
        if (tr.height > 16 && tr.height < r.height) {
          r = tr;
          cornerEl = target;
        }
      }
      const borderRadius = window.getComputedStyle(cornerEl).borderRadius || "10px";
      const overlay = document.createElement("div");
      overlay.setAttribute("data-promptly-improve-flash", "true");
      overlay.style.cssText = [
        "position:fixed",
        `left:${r.left}px`,
        `top:${r.top}px`,
        `width:${r.width}px`,
        `height:${r.height}px`,
        "pointer-events:none",
        "z-index:2147482000",
        "box-sizing:border-box",
        `border-radius:${borderRadius}`,
        "will-change:background-color"
      ].join(";");
      document.body.appendChild(overlay);
      const peak = "rgba(34, 197, 94, 0.1)";
      const anim = overlay.animate(
        [
          { backgroundColor: "rgba(34, 197, 94, 0)" },
          { backgroundColor: peak },
          { backgroundColor: "rgba(34, 197, 94, 0)" }
        ],
        { duration: 1360, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" }
      );
      anim.onfinish = () => {
        overlay.remove();
      };
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  }

  function resetPromptLifecycleState(nextText = "") {
    promptLifecycleState.lastObservedText = nextText;
    promptLifecycleState.pendingProgrammaticText = null;
    promptLifecycleState.hasPromptlyRewrite = false;
    promptLifecycleState.composePromptWritten = false;
    promptLifecycleState.hideImprovePromptSection = false;
    promptLifecycleState.improveMutedByCompose = false;
    promptLifecycleState.lockedSuggestions = null;
    promptLifecycleState.appliedSuggestionKeys = new Set();
    promptLifecycleState.furtherImproveChoices = null;
    promptLifecycleState.appliedFurtherImproveIds = new Set();
  }

  function markProgrammaticPromptText(nextText) {
    promptLifecycleState.lastObservedText = nextText;
    promptLifecycleState.pendingProgrammaticText = nextText;
  }

  function markPromptlyRewrite(nextText) {
    promptLifecycleState.hasPromptlyRewrite = true;
    markProgrammaticPromptText(nextText);
  }

  function syncPromptLifecycleState(currentText) {
    if (currentText === promptLifecycleState.lastObservedText) {
      return;
    }
    if (
      promptLifecycleState.pendingProgrammaticText !== null &&
      currentText === promptLifecycleState.pendingProgrammaticText
    ) {
      promptLifecycleState.lastObservedText = currentText;
      promptLifecycleState.pendingProgrammaticText = null;
      return;
    }

    promptLifecycleState.lastObservedText = currentText;
    promptLifecycleState.pendingProgrammaticText = null;
    promptLifecycleState.improveMutedByCompose = false;

    if (!currentText.trim()) {
      resetPromptLifecycleState(currentText);
      return;
    }

    if (!promptLifecycleState.hasPromptlyRewrite) {
      promptLifecycleState.lockedSuggestions = null;
      promptLifecycleState.appliedSuggestionKeys = new Set();
    }
  }

  /** Scroll host composer so newly appended text (usually at the end) is visible — textarea or nested scroll shells (ChatGPT / Claude / Gemini). */
  function scrollPromptComposerToBottom(host) {
    if (!host || !host.isConnected) {
      return;
    }
    const surface =
      typeof adapters.getPromptWriteSurface === "function"
        ? adapters.getPromptWriteSurface(host)
        : host;
    const inner = surface && surface.isConnected ? surface : host;
    const bump = () => {
      if (inner instanceof HTMLTextAreaElement || inner instanceof HTMLInputElement) {
        try {
          inner.scrollTop = inner.scrollHeight;
        } catch (_e) {
          // ignore
        }
        return;
      }
      const nodes = [];
      for (let n = inner, i = 0; n && n instanceof Element && i < 28; n = n.parentElement, i++) {
        const sh = n.scrollHeight;
        const ch = n.clientHeight;
        if (sh <= ch + 1) {
          continue;
        }
        const oy = window.getComputedStyle(n).overflowY;
        if (n === inner || oy === "auto" || oy === "scroll" || oy === "overlay") {
          nodes.push(n);
        }
      }
      for (const n of nodes) {
        try {
          n.scrollTop = n.scrollHeight;
        } catch (_e) {
          // ignore
        }
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bump();
        window.setTimeout(bump, 0);
        window.setTimeout(bump, 48);
      });
    });
  }

  /** Appends snippet line (including <<…>>) to the host composer with a blank paragraph before it when there is prior text. */
  function applyFurtherImproveSnippet(host, snippetRaw) {
    const block = String(snippetRaw || "").trim();
    if (!host || !block || !isLikelyWritableComposer(host)) {
      return false;
    }
    const before = String(readPromptPlainForVerify(host) || "").replace(/\u00a0/g, " ");
    const trimmedEnd = before.trimEnd();
    const fullText = trimmedEnd.length === 0 ? block : `${trimmedEnd}\n\n${block}`;
    markProgrammaticPromptText(fullText);
    replaceTargetText(host, fullText);
    let after = String(readPromptPlainForVerify(host) || "").replace(/\u00a0/g, " ");
    if (after.trimEnd().length <= trimmedEnd.length) {
      replaceTargetText(host, fullText, { relaxedComposer: true });
      after = String(readPromptPlainForVerify(host) || "").replace(/\u00a0/g, " ");
    }
    return after.trimEnd().length > trimmedEnd.length;
  }

  const SUGGESTION_DEFINITIONS = [
    {
      key: "no-hallucinations",
      label: "No hallucinations",
      suffix: "Use only supported information, and do not invent facts, quotes, citations, or details that are not provided or verifiable.",
      score: (ctx) =>
        (ctx.isResearch || ctx.isGroundedDocument || ctx.isQuotationRequest ? 10 : 0) +
        (ctx.hasDataSignals ? 1 : 0)
    },
    {
      key: "grounded-only",
      label: "Grounded only",
      suffix: "Use only the provided material as evidence and avoid outside assumptions.",
      score: (ctx) => (ctx.isGroundedDocument || ctx.isSourcePulling ? 9 : 0)
    },
    {
      key: "no-misquotes",
      label: "No misquotes",
      suffix: "If quoting source text, keep it verbatim and do not paraphrase quoted lines.",
      score: (ctx) => (ctx.isQuotationRequest ? 10 : 0)
    },
    {
      key: "evidence-first",
      label: "Evidence first",
      suffix: "Present supporting evidence before conclusions where factual claims are made.",
      score: (ctx) => (ctx.isResearch || ctx.isGroundedDocument ? 7 : 0)
    },
    {
      key: "verify",
      label: "Verify",
      suffix: "Verify factual claims, avoid unsupported assumptions, and flag uncertainty clearly.",
      score: (ctx) => (ctx.isResearch || ctx.isGroundedDocument ? 9 : 0) + (ctx.hasDataSignals ? 2 : 0)
    },
    {
      key: "factcheck",
      label: "Factcheck",
      suffix: "Fact-check the important claims before finalizing the answer.",
      score: (ctx) => (ctx.isResearch || ctx.isGroundedDocument ? 8 : 0) + (ctx.hasCurrentAffairsSignals ? 2 : 0)
    },
    {
      key: "cite-sources",
      label: "Cite sources",
      suffix: "Support non-trivial factual claims with credible sources or clearly state when a claim cannot be verified.",
      score: (ctx) => (ctx.isResearch || ctx.isGroundedDocument ? 10 : 0)
    },
    {
      key: "crosscheck",
      label: "Crosscheck",
      suffix: "Cross-check the conclusion against alternative evidence, calculations, or interpretations before final output.",
      score: (ctx) => (ctx.isResearch ? 6 : 0) + (ctx.isDataAnalysis ? 3 : 0) + (ctx.isMath ? 2 : 0)
    },
    {
      key: "quote-verbatim",
      label: "Quote verbatim",
      suffix: "Quote any source text verbatim and keep wording exact when pulling evidence or quotations.",
      score: (ctx) => (ctx.isQuotationRequest || ctx.isGroundedDocument ? 10 : 0)
    },
    {
      key: "show-work",
      label: "Show work",
      suffix: "Show the working step by step before giving the final answer.",
      score: (ctx) => (ctx.isMath ? 10 : 0) + (ctx.isHowOrWhy ? 2 : 0)
    },
    {
      key: "justify",
      label: "Justify",
      suffix: "Support the main answer or argument with clear reasons and evidence.",
      score: (ctx) => (ctx.isEssay ? 8 : 0) + (ctx.isResearch ? 2 : 0)
    },
    {
      key: "reference-data",
      label: "Reference data",
      suffix: "Reference the relevant data, source material, or provided evidence directly in the answer.",
      score: (ctx) => (ctx.isResearch || ctx.isGroundedDocument || ctx.isDataAnalysis ? 7 : 0)
    },
    {
      key: "clarify",
      label: "Clarify",
      suffix: "Clarify the goal, audience, context, and any non-negotiable constraints before answering.",
      score: (ctx) => (ctx.isAmbiguous ? 8 : 0) + (ctx.wordCount < 18 ? 2 : 0)
    },
    {
      key: "assumptions-list",
      label: "Assumptions list",
      suffix: "List explicit assumptions before the final answer.",
      score: (ctx) => (ctx.isAmbiguous ? 6 : 0) + (ctx.isMath ? 2 : 0) + (ctx.isDataAnalysis ? 2 : 0)
    },
    {
      key: "safe-defaults",
      label: "Safe defaults",
      suffix: "Use safe placeholders like [AUDIENCE], [CONTEXT], and [FORMAT] for missing details.",
      score: (ctx) => (ctx.isAmbiguous ? 7 : 0)
    },
    {
      key: "scope-lock",
      label: "Scope lock",
      suffix: "Stay strictly within the requested scope and avoid adding unrelated requirements.",
      score: (ctx) => (ctx.isAmbiguous ? 4 : 0) + (ctx.isMultiPart ? 3 : 0)
    },
    {
      key: "intent-preserve",
      label: "Intent preserve",
      suffix: "Preserve the original intent and avoid changing the user's objective.",
      score: (ctx) => (ctx.isAmbiguous ? 5 : 0) + (ctx.isTransformation ? 3 : 0)
    },
    {
      key: "output-contract",
      label: "Output contract",
      suffix: "Define and follow a clear output format contract.",
      score: (ctx) => (ctx.needsStructure ? 8 : 0) + (ctx.isCoding ? 2 : 0)
    },
    {
      key: "expand",
      label: "Expand",
      suffix: "Add more detail, examples, and missing context where the request is currently thin.",
      score: (ctx) => (ctx.wordCount >= 10 && ctx.wordCount < 18 ? 8 : 0)
    },
    {
      key: "concise",
      label: "Concise",
      suffix: "Keep the response concise, remove filler, and focus on the highest-value points only.",
      score: (ctx) => (ctx.wordCount > 80 ? 8 : 0) + (ctx.hasLongFormSignals ? 2 : 0)
    },
    {
      key: "structured",
      label: "Structured",
      suffix: "Organize the answer with clear sections and a logical structure.",
      score: (ctx) => (ctx.isMultiPart ? 7 : 0) + (ctx.isAmbiguous ? 2 : 0) + (ctx.needsStructure ? 2 : 0)
    },
    {
      key: "bullet-points",
      label: "Bullet points",
      suffix: "Present the main points as concise bullet points for easier scanning.",
      score: (ctx) => (ctx.isPlanningLike ? 6 : 0) + (ctx.isComparison ? 2 : 0)
    },
    {
      key: "stepwise",
      label: "Stepwise",
      suffix: "Explain the process step by step in a logical order.",
      score: (ctx) => (ctx.isHowOrWhy ? 5 : 0) + (ctx.isCoding ? 3 : 0) + (ctx.isMath ? 3 : 0)
    },
    {
      key: "sanity-check",
      label: "Sanity check",
      suffix: "Add a brief sanity check at the end to verify correctness.",
      score: (ctx) => (ctx.isMath ? 7 : 0) + (ctx.isDataAnalysis ? 4 : 0) + (ctx.isCoding ? 2 : 0)
    },
    {
      key: "edge-cases",
      label: "Edge cases",
      suffix: "Consider edge cases explicitly before finalizing the answer.",
      score: (ctx) => (ctx.isCoding ? 6 : 0) + (ctx.isMath ? 4 : 0)
    },
    {
      key: "analyze",
      label: "Analyze",
      suffix: "Analyze the problem carefully before answering and make the reasoning explicit where useful.",
      score: (ctx) => (ctx.isHowOrWhy ? 4 : 0) + (ctx.isDataAnalysis ? 4 : 0) + (ctx.isResearch ? 2 : 0)
    },
    {
      key: "compare",
      label: "Compare",
      suffix: "Compare the main options, tradeoffs, or alternatives before recommending a direction.",
      score: (ctx) => (ctx.isComparison ? 10 : 0)
    },
    {
      key: "table-output",
      label: "Table output",
      suffix: "Use a compact table if it improves comparison or readability.",
      score: (ctx) => (ctx.isComparison ? 5 : 0) + (ctx.isDataAnalysis ? 4 : 0) + (ctx.requestsTable ? 2 : 0)
    },
    {
      key: "explain",
      label: "Explain",
      suffix: "Explain the answer clearly in plain language and make each point easy to follow.",
      score: (ctx) => (ctx.isExplanationLike ? 8 : 0)
    },
    {
      key: "summarize",
      label: "Summarize",
      suffix: "Summarize the key takeaways clearly before going into any extra detail.",
      score: (ctx) => (ctx.isTransformation ? 5 : 0) + (ctx.wordCount > 120 ? 4 : 0)
    },
    {
      key: "outline",
      label: "Outline",
      suffix: "Provide a clear outline before the full answer so the structure is easy to follow.",
      score: (ctx) => (ctx.isPlanningLike ? 7 : 0) + (ctx.isWriting ? 2 : 0)
    },
    {
      key: "checklist",
      label: "Checklist",
      suffix: "Provide a short completion checklist to confirm all requirements are covered.",
      score: (ctx) => (ctx.isPlanningLike ? 6 : 0) + (ctx.isCoding ? 3 : 0)
    },
    {
      key: "draft",
      label: "Draft",
      suffix: "Draft the response in polished, ready-to-use language.",
      score: (ctx) => (ctx.isWriting ? 8 : 0) + (ctx.isCreative ? 2 : 0)
    },
    {
      key: "refine",
      label: "Refine",
      suffix: "Refine the wording for clarity, precision, and readability.",
      score: (ctx) => (ctx.isWriting ? 5 : 0) + (ctx.isTransformation ? 5 : 0) + (ctx.isImage ? 2 : 0)
    },
    {
      key: "brainstorm",
      label: "Brainstorm",
      suffix: "Generate several strong options before narrowing to the best one.",
      score: (ctx) => (ctx.isBrainstorm ? 10 : 0)
    },
    {
      key: "visualize",
      label: "Visualize",
      suffix: "Add visual, compositional, and scene detail without changing the core subject.",
      score: (ctx) => (ctx.isImage ? 10 : 0)
    },
    {
      key: "exact",
      label: "Exact",
      suffix: "Be exact with names, numbers, syntax, and any user-provided terms.",
      score: (ctx) => (ctx.isGroundedDocument ? 6 : 0) + (ctx.hasSyntaxSensitiveSignals ? 5 : 0)
    },
    {
      key: "validate",
      label: "Validate",
      suffix: "Validate assumptions, inputs, edge cases, and error conditions before finalizing.",
      score: (ctx) => (ctx.isCoding ? 8 : 0) + (ctx.isMath ? 4 : 0) + (ctx.isDataAnalysis ? 3 : 0)
    },
    {
      key: "test-cases",
      label: "Test cases",
      suffix: "Include concise test cases with expected outcomes where relevant.",
      score: (ctx) => (ctx.isCoding ? 8 : 0) + (ctx.isMath ? 2 : 0)
    },
    {
      key: "api-preserve",
      label: "API preserve",
      suffix: "Preserve existing public APIs unless explicitly asked to change them.",
      score: (ctx) => (ctx.isCoding ? 7 : 0)
    },
    {
      key: "security",
      label: "Security",
      suffix: "Call out security risks and apply safe-by-default practices.",
      score: (ctx) => (ctx.isCoding ? 6 : 0) + (ctx.isResearch ? 2 : 0)
    },
    {
      key: "privacy",
      label: "Privacy",
      suffix: "Avoid exposing sensitive data and redact secrets where needed.",
      score: (ctx) => (ctx.isCoding ? 4 : 0) + (ctx.isResearch ? 2 : 0)
    },
    {
      key: "code-snippet",
      label: "Code snippet",
      suffix: "Include a minimal working code snippet if that would make the answer more useful.",
      score: (ctx) => (ctx.isCoding ? 7 : 0)
    }
  ];

  function buildPromptContext(promptText) {
    const trimmed = String(promptText || "").trim();
    const lowered = trimmed.toLowerCase();
    const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
    const lineCount = trimmed ? trimmed.split(/\n+/).filter(Boolean).length : 0;
    const sentenceCount = trimmed ? trimmed.split(/[.!?]+/).filter(Boolean).length : 0;
    const isCoding =
      /```|\b(code|bug|debug|fix|function|component|api|endpoint|javascript|typescript|python|react|node|sql|css|html|script|refactor|repo|regex|query)\b/.test(
        lowered
      );
    const isMath =
      /\b(solve|equation|calculate|derivative|integral|probability|algebra|geometry|math|formula)\b/.test(
        lowered
      );
    const isDataAnalysis =
      /\b(dataset|data set|csv|spreadsheet|table|forecast|trend|regression|metric|metrics|analysis|analyze data|dashboard)\b/.test(
        lowered
      );
    const isResearch =
      /\b(research|evidence|source|sources|citation|citations|study|studies|latest|current|recent|fact|factual|accurate|accuracy|proof|statistics|statistic)\b/.test(
        lowered
      );
    const isGroundedDocument =
      /\b(pdf|document|contract|report|paper|transcript|from this text|from this pdf|quote|quotes|verbatim|provided text|only use provided)\b/.test(
        lowered
      );
    const isImage =
      /\b(midjourney|stable diffusion|dall[\s-]?e|image|render|illustration|photo|photoreal|concept art|prompt weights)\b|--ar\b|--stylize\b/.test(
        lowered
      );
    const isTransformation =
      /\b(summarize|summary|rewrite|rephrase|translate|extract|clean up|simplify|paraphrase|convert)\b/.test(
        lowered
      );
    const isWriting =
      /\b(write|draft|compose|email|post|essay|article|blog|linkedin|tweet|caption|copy|statement)\b/.test(
        lowered
      );
    const isBrainstorm =
      /\b(brainstorm|ideas|idea|names|name ideas|concepts|options|taglines|slogans|creative)\b/.test(
        lowered
      );
    const isEssay =
      /\b(essay|thesis|paragraph|introduction|conclusion|argumentative|persuasive|literary analysis|paper)\b/.test(
        lowered
      );
    const isComparison =
      /\b(compare|comparison|contrast|versus|vs\.?|pros and cons|tradeoff|tradeoffs)\b/.test(
        lowered
      );
    const isQuotationRequest =
      /\b(quote|quotes|quotation|quotations|verbatim|pull quote|exact quote|quoted text)\b/.test(lowered);
    const isSourcePulling =
      isGroundedDocument ||
      /\b(source pull|pull sources|extract sources|source material|reference material|references?)\b/.test(
        lowered
      );
    const isExplanationLike =
      /\b(explain|clarify|teach|walk me through|break down)\b/.test(lowered);
    const isPlanningLike =
      /\b(plan|roadmap|strategy|steps|checklist|outline|framework)\b/.test(lowered);
    const isHowOrWhy = /\b(how|why|walk me through|step by step)\b/.test(lowered);
    const requestsTable = /\b(table|tabulate|matrix)\b/.test(lowered);
    const needsStructure =
      requestsTable ||
      /\b(json|schema|markdown|xml|yaml|bullet|bullets|numbered|sections?|format)\b/.test(lowered);
    const hasSyntaxSensitiveSignals =
      /```|[{[].*[}\]]|<[^>]+>|--[a-z-]+|\bjson\b|\bxml\b|\byaml\b|\bmarkdown\b/.test(trimmed);
    const hasCurrentAffairsSignals = /\b(latest|current|recent|today|2024|2025|2026)\b/.test(lowered);
    const hasDataSignals = /\b(data|dataset|statistics|numbers|evidence|benchmark|report)\b/.test(lowered);
    const hasLongFormSignals =
      /\b(in detail|comprehensive|extensive|thorough|long-form|deep dive)\b/.test(lowered);
    const vagueTerms = (lowered.match(/\b(this|that|it|something|stuff|better|good|nice)\b/g) || []).length;
    const openEndedVerbs = /\b(help|make|improve|write|create|fix|build|tell me)\b/.test(lowered);
    const isAmbiguous =
      wordCount < 18 ||
      vagueTerms >= 2 ||
      (openEndedVerbs && !needsStructure && !isComparison && !isCoding && !isMath);
    const isMultiPart =
      lineCount > 2 ||
      sentenceCount > 2 ||
      /[,;:]/.test(trimmed) ||
      /\b(and|also|plus|then)\b/.test(lowered);

    return {
      wordCount,
      isCoding,
      isMath,
      isDataAnalysis,
      isResearch,
      isGroundedDocument,
      isImage,
      isTransformation,
      isWriting,
      isEssay,
      isBrainstorm,
      isComparison,
      isQuotationRequest,
      isSourcePulling,
      isExplanationLike,
      isPlanningLike,
      isHowOrWhy,
      requestsTable,
      needsStructure,
      hasSyntaxSensitiveSignals,
      hasCurrentAffairsSignals,
      hasDataSignals,
      hasLongFormSignals,
      isAmbiguous,
      isMultiPart,
      isCreative: isWriting || isBrainstorm
    };
  }

  function getPreferredSuggestionKeys(context) {
    const preferred = [];

    if (context.isQuotationRequest || context.isSourcePulling) {
      preferred.push(
        "grounded-only",
        "no-misquotes",
        "quote-verbatim",
        "no-hallucinations",
        "exact",
        "cite-sources"
      );
    } else if (context.isResearch) {
      preferred.push(
        "cite-sources",
        "verify",
        "factcheck",
        "evidence-first",
        "crosscheck",
        "reference-data"
      );
    } else if (context.isMath) {
      preferred.push("show-work", "stepwise", "sanity-check", "validate", "exact");
    } else if (context.isCoding) {
      preferred.push("validate", "edge-cases", "test-cases", "api-preserve", "code-snippet", "security");
    } else if (context.isEssay) {
      preferred.push("outline", "justify", "refine", "draft", "intent-preserve");
    } else if (context.isWriting) {
      preferred.push("draft", "refine", "structured", "clarify", "concise");
    } else if (context.isDataAnalysis) {
      preferred.push("analyze", "table-output", "compare", "sanity-check", "validate");
    } else if (context.isImage) {
      preferred.push("visualize", "exact", "refine");
    } else if (context.isComparison) {
      preferred.push("compare", "table-output", "structured");
    } else if (context.isTransformation) {
      preferred.push("summarize", "refine", "clarify");
    } else if (context.isBrainstorm) {
      preferred.push("brainstorm", "expand", "structured");
    }

    if (context.isAmbiguous) {
      preferred.unshift("clarify", "safe-defaults", "assumptions-list");
    }
    if (context.wordCount > 80) {
      preferred.push("concise");
    }

    return [...new Set(preferred)];
  }

  function getSuggestionCount(context) {
    if (context.wordCount < 3) {
      return 0;
    }
    const complexityScore = [
      context.isResearch,
      context.isGroundedDocument,
      context.isCoding,
      context.isDataAnalysis,
      context.isMath,
      context.isEssay,
      context.isComparison,
      context.isMultiPart,
      context.needsStructure
    ].filter(Boolean).length;

    if (context.wordCount < 5) {
      return 1;
    }
    if (context.wordCount < 35) {
      return 2;
    }
    if (context.wordCount < 70) {
      return complexityScore >= 3 ? 3 : 2;
    }
    if (context.wordCount < 120) {
      return complexityScore >= 3 ? 4 : 3;
    }
    return complexityScore >= 4 ? 5 : 4;
  }

  function orderSuggestionsForRows(items) {
    if (items.length <= 1) {
      return items;
    }
    const ordered = [...items].sort((a, b) => a.label.length - b.label.length);
    if (ordered.length <= 3) {
      return ordered;
    }
    return [...ordered.slice(0, 3), ...ordered.slice(3)];
  }

  function pickSuggestions(context, maxCount) {
    const scoredSuggestions = SUGGESTION_DEFINITIONS
      .map((item, index) => ({
        ...item,
        weight: Number(item.score(context) || 0),
        index
      }))
      .filter((item) => item.weight > 0)
      .sort((a, b) => (b.weight === a.weight ? a.index - b.index : b.weight - a.weight));
    const byKey = new Map(scoredSuggestions.map((item) => [item.key, item]));
    const chosen = [];
    const chosenKeys = new Set();

    for (const key of getPreferredSuggestionKeys(context)) {
      const match = byKey.get(key);
      if (!match || chosenKeys.has(key)) {
        continue;
      }
      chosen.push(match);
      chosenKeys.add(key);
      if (chosen.length >= 3) {
        break;
      }
    }

    for (const item of scoredSuggestions) {
      if (chosenKeys.has(item.key)) {
        continue;
      }
      chosen.push(item);
      chosenKeys.add(item.key);
      if (chosen.length >= maxCount) {
        break;
      }
    }

    return orderSuggestionsForRows(chosen).map(({ key, label, suffix }) => ({ key, label, suffix }));
  }

  function withSuggestionState(suggestions) {
    return suggestions.map((item) => ({
      key: item.key,
      label: item.label,
      suffix: item.suffix,
      disabled: promptLifecycleState.appliedSuggestionKeys.has(item.key)
    }));
  }

  /** Stable hash for strength jitter (same prompt → same noise; not purely linear with length). */
  function simplePromptHash(str) {
    let h = 2166136261 >>> 0;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * Strength bar: full green only after Promptly improve or compose/generate.
   * Manual typing: mostly monotonic with word count, slow low-frequency “organic” variation
   * (no full-string hash) so the fill eases up without snapping each word.
   */
  function computePromptStrengthPercent(promptText) {
    const trimmed = String(promptText || "").trim();
    const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const charCount = trimmed.length;
    const h = simplePromptHash(trimmed);

    const touchedByPromptly =
      promptLifecycleState.hasPromptlyRewrite || promptLifecycleState.composePromptWritten;

    if (touchedByPromptly) {
      const v = 96 + (h % 5);
      return Math.max(0, Math.min(100, Math.round(v)));
    }

    const cap = 59;
    if (wordCount === 0) {
      return Math.max(0, Math.min(22, Math.round(2 + (h % 18))));
    }

    const asymptotic = 1 - Math.exp(-wordCount / 11.5);
    let base = asymptotic * cap * 0.9;
    const organic =
      Math.sin(wordCount * 0.092 + 0.35) * 2.1 +
      Math.sin(charCount * 0.016 + wordCount * 0.058) * 1.45 +
      Math.sin(Math.sqrt(wordCount) * 1.5 + 0.7) * 0.95;
    base += organic * 0.52;
    base = Math.max(7, Math.min(cap, base));
    return Math.round(base);
  }

  function analyzePrompt(promptText) {
    const context = buildPromptContext(promptText);
    const suggestionCount = getSuggestionCount(context);
    const baseSuggestions =
      suggestionCount === 0
        ? []
        : promptLifecycleState.lockedSuggestions || pickSuggestions(context, suggestionCount);
    const suggestions = withSuggestionState(baseSuggestions);
    const strengthPercent = computePromptStrengthPercent(promptText);
    const autoAdjustSuffix = "";

    const showFurtherImproveGrid =
      !!promptLifecycleState.hasPromptlyRewrite &&
      !promptLifecycleState.composePromptWritten &&
      !promptLifecycleState.improveMutedByCompose &&
      !promptLifecycleState.hideImprovePromptSection &&
      Array.isArray(promptLifecycleState.furtherImproveChoices) &&
      promptLifecycleState.furtherImproveChoices.length > 0;

    const furtherImproveButtons = showFurtherImproveGrid
      ? promptLifecycleState.furtherImproveChoices.map((opt) => ({
          id: opt.id,
          label: opt.label,
          snippet: opt.snippet,
          applied: promptLifecycleState.appliedFurtherImproveIds.has(opt.id)
        }))
      : [];

    return {
      wordCount: context.wordCount,
      strengthPercent,
      strengthAiEnhanced:
        promptLifecycleState.hasPromptlyRewrite || promptLifecycleState.composePromptWritten,
      autoAdjustSuffix,
      hasPromptlyRewrite: promptLifecycleState.hasPromptlyRewrite,
      composePromptWritten: promptLifecycleState.composePromptWritten,
      hideImprovePromptSection: promptLifecycleState.hideImprovePromptSection,
      improveMutedByCompose: promptLifecycleState.improveMutedByCompose,
      showFurtherImproveGrid,
      furtherImproveButtons,
      suggestions: [],
      suggestionNotice: ""
    };
  }

  function refreshOpenPopupFromHost(host) {
    if (!isOpen) {
      return;
    }
    let t = "";
    if (host) {
      t = getPromptText(host);
      if (!t) {
        t = readPromptPlainForVerify(host);
      }
    }
    if (!t && currentTarget) {
      t = getPromptText(currentTarget);
      if (!t) {
        t = readPromptPlainForVerify(currentTarget);
      }
    }
    ui.setContent(analyzePrompt(t));
  }

  function parseColorChannels(colorText) {
    if (!colorText || colorText === "transparent") {
      return null;
    }
    const match = colorText.match(/rgba?\(([^)]+)\)/i);
    if (!match) {
      return null;
    }
    const parts = match[1].split(",").map((p) => Number.parseFloat(p.trim()));
    if (parts.length < 3) {
      return null;
    }
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }

  function inferThemeFromTarget(target) {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    let node = target;
    let fallback = null;
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const parsed = parseColorChannels(style.backgroundColor);
      if (parsed) {
        fallback = parsed;
        if (parsed.a > 0.85) {
          break;
        }
      }
      node = node.parentElement;
    }
    const color = fallback || parseColorChannels(window.getComputedStyle(document.body).backgroundColor);
    if (!color) {
      return prefersDark ? "dark" : "light";
    }
    const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
    return luminance < 0.45 ? "dark" : "light";
  }

  function isTargetVisible(target) {
    if (!target || !adapters.isEditable(target) || !target.isConnected) {
      return false;
    }
    const rect =
      typeof adapters.getPromptSurfaceRect === "function"
        ? adapters.getPromptSurfaceRect(target)
        : null;
    const effective = rect || target.getBoundingClientRect();
    if (effective.width < 120 || effective.height < 24) {
      return false;
    }
    if (
      effective.bottom < 0 ||
      effective.top > window.innerHeight ||
      effective.right < 0 ||
      effective.left > window.innerWidth
    ) {
      return false;
    }
    return true;
  }

  function getAnchorRectForTarget(target) {
    const anchor = adapters.getAnchorElement ? adapters.getAnchorElement(target) : target;
    const anchorRect = anchor && typeof anchor.getBoundingClientRect === "function"
      ? anchor.getBoundingClientRect()
      : null;
    const targetRect = target.getBoundingClientRect();
    if (anchorRect && anchorRect.width >= 120 && anchorRect.height >= 20) {
      // Pin to the outer composer "chatbox" top/width so inner textarea scroll / multiline
      // growth inside the shell does not move Promptly; only real composer movement does.
      return {
        left: anchorRect.left,
        width: anchorRect.width,
        top: anchorRect.top
      };
    }
    return targetRect;
  }

  function resolveTarget() {
    if (hintedTarget && adapters.isEditable(hintedTarget) && hintedTarget.isConnected) {
      return hintedTarget;
    }
    return adapters.getPromptElement(currentTarget);
  }

  function sync() {
    if (destroyed) {
      return;
    }

    const nextTarget = resolveTarget();
    if (nextTarget !== currentTarget) {
      currentTarget = nextTarget;
      lastPlacementSignature = null;
      observers.bindTarget(currentTarget);
    }

    if (!currentTarget || !isTargetVisible(currentTarget)) {
      lastPlacementSignature = null;
      ui.setVisible(false);
      return;
    }

    const currentPromptText = getPromptText(currentTarget);
    syncPromptLifecycleState(currentPromptText);
    const anchorRect = getAnchorRectForTarget(currentTarget);
    const rect =
      site === "claude"
        ? { ...anchorRect, top: anchorRect.top + CLAUDE_PLACEMENT_TOP_OFFSET_PX }
        : site === "gemini"
          ? { ...anchorRect, top: anchorRect.top + GEMINI_PLACEMENT_TOP_OFFSET_PX }
          : anchorRect;
    ui.setTheme(inferThemeFromTarget(currentTarget));
    if (isOpen && Date.now() >= suppressOpenPopupSetContentUntilMs) {
      ui.setContent(analyzePrompt(currentPromptText));
    }

    const popupHeight = ui.getPopupHeight();
    const placementSig = [
      Math.round(rect.left * 4) / 4,
      Math.round(rect.top * 4) / 4,
      Math.round(rect.width),
      Math.round(popupHeight),
      isOpen ? 1 : 0,
      Math.round(positionManager.getPromptlyCenterOffsetX())
    ].join("|");

    if (placementSig !== lastPlacementSignature) {
      lastPlacementSignature = placementSig;
      const placement = positionManager.compute(rect, popupHeight, isOpen);
      ui.setDirection(placement.direction);
      ui.applyPlacement(placement);
    }
    ui.setVisible(allowDisplay);
  }

  function closePopup() {
    clearComposePopupAutoCloseTimer();
    suppressOpenPopupSetContentUntilMs = 0;
    if (!isOpen) {
      return;
    }
    isOpen = false;
    ui.setOpen(false);
    observers.scheduleUpdate();
  }

  function handlePointerDown(event) {
    if (!isOpen) {
      return;
    }
    const target = event.target;
    const clickedInsideWidget = ui.containsNode(target);
    const clickedInput = currentTarget && currentTarget.contains(target);
    if (!clickedInsideWidget && !clickedInput) {
      closePopup();
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      closePopup();
      return;
    }

    if (
      autoAdjustOnSend &&
      !bypassNextAutoSendInterception &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.isComposing &&
      currentTarget &&
      (event.target === currentTarget || currentTarget.contains(event.target))
    ) {
      event.preventDefault();
      event.stopPropagation();
      runAutoAdjustThenSend({ type: "enter" });
    }
  }

  function isSignInRequiredError(error) {
    if (!error) {
      return false;
    }
    if (error.promptlyNeedsSignIn) {
      return true;
    }
    return isPromptlyAuthSessionError(String(error?.message || error || ""));
  }

  function isLikelySendButton(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    const button = target.closest("button, [role='button']");
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
    if (/\b(send|submit|composer-submit|send-button|send-message|submit-button)\b/.test(signals)) {
      return true;
    }
    return button.getAttribute("type") === "submit";
  }

  function triggerSendAfterAdjust(trigger) {
    bypassNextAutoSendInterception = true;
    window.setTimeout(() => {
      bypassNextAutoSendInterception = false;
    }, 0);

    if (trigger.type === "click" && trigger.button) {
      trigger.button.click();
      return;
    }

    if (!currentTarget) {
      return;
    }

    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true
    });
    currentTarget.dispatchEvent(enterEvent);
  }

  async function runAutoAdjustThenSend(trigger) {
    if (autoAdjustInFlight || !currentTarget) {
      return;
    }
    if (autoModeBlockedByTokens) {
      autoAdjustOnSend = false;
      persistAutoSendPreference();
      ui.setAutoSendEnabled(false);
      ui.showErrorToast("No more tokens left today.");
      triggerSendAfterAdjust(trigger);
      return;
    }
    const originalPrompt = getPromptText(currentTarget).trim();
    const alreadyHandledByPromptly =
      promptLifecycleState.hasPromptlyRewrite ||
      promptLifecycleState.composePromptWritten ||
      promptLifecycleState.improveMutedByCompose;
    // If current prompt is already improved/generated, never run auto again — just send.
    if (alreadyHandledByPromptly) {
      triggerSendAfterAdjust(trigger);
      return;
    }
    if (!isImprovePromptSubstantive(originalPrompt)) {
      ui.setAutoAdjustLoading(false, "Prompt too short", true, "improve");
      triggerSendAfterAdjust(trigger);
      return;
    }
    if (!isOpen) {
      ui.setTabStatus("rewriting");
    }

    autoAdjustInFlight = true;
    let didApplyOptimizedPrompt = false;
    let blockSend = false;
    try {
      ui.setAutoAdjustLoading(true, "reading prompt");
      ui.setAutoAdjustLoading(true, "analyzing");
      ui.playAutoButtonBoxShineOnce();
      await verifyCurrentUserSession();
      refreshCreditsFromServer({
        promptLength: originalPrompt.length,
        instructionLength: 0
      });
      const optimization = await optimizePromptViaProxy(originalPrompt, "", { optimizeMode: "auto" });
      const optimizedPrompt = optimization.optimizedPrompt;
      if (optimization.credits) {
        applyCreditsToUi(optimization.credits, { announceNoTokens: true });
      }
      ui.setAutoAdjustLoading(true, "updating");
      markPromptlyRewrite(optimizedPrompt);
      replaceTargetText(currentTarget, optimizedPrompt);
      didApplyOptimizedPrompt = true;
      if (!isOpen) {
        ui.setTabStatus("improved");
      }
    } catch (_error) {
      if (_error?.promptlyNeedsSignIn) {
        void applySignedOutState(true);
      }
      if (isSignInRequiredError(_error)) {
        blockSend = true;
      }
      if (!blockSend) {
        ui.showErrorToast(mapPromptlyErrorToToast(String(_error?.message || _error || "")));
      }
      if (_error?.promptlyCredits) {
        applyCreditsToUi(_error.promptlyCredits, { announceNoTokens: true });
      }
      // Block send when unauthenticated; otherwise fail open and send original prompt.
      if (!isOpen) {
        ui.setTabStatus("idle");
      }
    } finally {
      autoAdjustInFlight = false;
      const finalize = () => {
        ui.setAutoAdjustLoading(false);
        observers.scheduleUpdate();
        if (!blockSend) {
          window.requestAnimationFrame(() => triggerSendAfterAdjust(trigger));
          return;
        }
        ui.setAutoAdjustLoading(false, "Sign in first", true, "improve");
      };
      if (didApplyOptimizedPrompt) {
        window.requestAnimationFrame(finalize);
      } else {
        finalize();
      }
    }
  }

  function handleDocumentClick(event) {
    if (
      autoAdjustOnSend &&
      !bypassNextAutoSendInterception &&
      isLikelySendButton(event.target)
    ) {
      event.preventDefault();
      event.stopPropagation();
      const button = event.target.closest("button, [role='button']");
      runAutoAdjustThenSend({ type: "click", button });
    }
  }

  function handleDocumentSubmit(event) {
    if (!autoAdjustOnSend || bypassNextAutoSendInterception) {
      return;
    }
    if (!(event.target instanceof HTMLFormElement)) {
      return;
    }
    if (!currentTarget || !event.target.contains(currentTarget)) {
      return;
    }
    const submitter = event.submitter instanceof Element ? event.submitter : null;
    if (submitter && !isLikelySendButton(submitter)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    runAutoAdjustThenSend({ type: "submit", button: submitter });
  }

  function destroy() {
    destroyed = true;
    clearComposePopupAutoCloseTimer();
    document.querySelectorAll("[data-promptly-improve-flash='true']").forEach((node) => node.remove());
    window.clearTimeout(visibilityCreditsRefreshTimer);
    visibilityCreditsRefreshTimer = null;
    stopCreditsPolling();
    window.clearTimeout(unlockDisplayTimer);
    observers.stop();
    document.removeEventListener("pointerdown", handlePointerDown, true);
    document.removeEventListener("click", handleDocumentClick, true);
    document.removeEventListener("submit", handleDocumentSubmit, true);
    window.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("visibilitychange", scheduleCreditsRefreshWhenVisible);
    window.removeEventListener("pagehide", destroy, true);
    if (typeof stopHostPassiveListener === "function") {
      stopHostPassiveListener();
      stopHostPassiveListener = null;
    }
    ui.destroy();
  }

  observers.start();
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "PROMPTLY_OPEN_IN_PAGE_SETTINGS") {
      return;
    }
    ui.setSettingsOpen(true);
    observers.scheduleUpdate();
  });
  if (typeof window.PromptlyHostActivityListener?.install === "function") {
    stopHostPassiveListener = window.PromptlyHostActivityListener.install({
      site,
      getPromptTarget: () => currentTarget,
      readComposer: () => {
        const readEditable = (el) => {
          if (!el || !el.isConnected) {
            return "";
          }
          try {
            const surfaced =
              typeof adapters.getPromptWriteSurface === "function" ? adapters.getPromptWriteSurface(el) : el;
            const leaf = surfaced && adapters.isEditable(surfaced) ? surfaced : el;
            if (!leaf || !adapters.isEditable(leaf)) {
              return "";
            }
            return String(getPromptText(leaf) || "").trim();
          } catch (_e) {
            return "";
          }
        };
        let chunk = readEditable(currentTarget);
        if (chunk.length) {
          return chunk;
        }
        try {
          if (typeof adapters.getPromptElement === "function") {
            const hinted = adapters.getPromptElement(currentTarget ?? null);
            chunk = readEditable(hinted);
            if (chunk.length) {
              return chunk;
            }
          }
        } catch (_e) {
          /* ignore */
        }
        return "";
      }
    });
  }
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("click", handleDocumentClick, true);
  document.addEventListener("submit", handleDocumentSubmit, true);
  window.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("visibilitychange", scheduleCreditsRefreshWhenVisible);
  window.addEventListener("pagehide", destroy, true);
  observers.scheduleUpdate();
})();
