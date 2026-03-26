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
  let visibilityCreditsRefreshTimer = null;
  let bypassNextAutoSendInterception = false;
  let dragStartOffsetX = 0;
  const MAX_DRAG_LEFT_PX = -75;
  const MAX_DRAG_RIGHT_PX = 225;
  const offsetStorageKey = `promptly:center-offset-x:${site}`;
  const autoSendStorageKey = `promptly:auto-adjust-on-send:${site}`;
  const promptLifecycleState = {
    lastObservedText: "",
    pendingProgrammaticText: null,
    hasPromptlyRewrite: false,
    composePromptWritten: false,
    hideImprovePromptSection: false,
    /** After Generate Prompt: Improve button shows muted/disabled "Prompt Already Strong ✓". After Improve: muted "Prompt Improved ✓". */
    improveMutedByCompose: false,
    lockedSuggestions: null,
    appliedSuggestionKeys: new Set()
  };

  /** Generate prompt now uses the worker's built-in super prompt; no extra client prompt text needed. */
  const COMPOSE_FROM_DESCRIPTION_META = "";

  /** Tiny mode markers only; the worker owns the actual super prompts. */
  const REWRITE_SUFFIX_AUTO_V3 = "[REWRITE_MODE: AUTO_REWRITE]";
  const REWRITE_SUFFIX_MANUAL_V3 = "[REWRITE_MODE: MANUAL_REWRITE]";

  function resolveRewriteUserInstruction(userInstruction) {
    const u = String(userInstruction || "").trim();
    if (!u || u.length < 40 || u.includes(REWRITE_SUFFIX_AUTO_V3)) {
      return REWRITE_SUFFIX_AUTO_V3;
    }
    if (u.includes(REWRITE_SUFFIX_MANUAL_V3) || /rewrite\s+and\s+improve/i.test(u)) {
      return REWRITE_SUFFIX_MANUAL_V3;
    }
    return REWRITE_SUFFIX_MANUAL_V3;
  }

  /** Lenient gate for Improve / auto-rewrite: not empty; 2+ words OR one clear word (3+ chars). */
  function isImprovePromptSubstantive(text) {
    const t = String(text || "").trim();
    if (!t) {
      return false;
    }
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return true;
    }
    if (words.length === 1 && words[0].length >= 3) {
      return true;
    }
    return false;
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

  const positionManager = new PositionManager();
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
        const result = await ensureChromeSignedIn();
        ui.setSignedOut(false);
        if (result?.chromeEmail) {
          refreshCreditsFromServer();
        }
      } catch (error) {
        ui.showErrorToast(mapPromptlyErrorToToast(String(error?.message || error)));
        ui.setSignedOut(true);
      }
    },
    onAutoAdjust: async (payload = {}) => {
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
        ui.setAutoAdjustLoading(false, "add 2+ words", true, "improve");
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
        // needs Chrome Gmail (checked in the background on optimize); skip the stricter page gate.
        if (!isComposeMode) {
          await verifyCurrentUserSession();
        }
        const fallbackInstruction = String(payload.suffix || "").trim();
        const requestMode = isComposeMode ? "create" : "rewrite";
        ui.setAutoAdjustLoading(true, "analyzing", false, isComposeMode ? "compose" : "improve");
        const optimizationPromise = isComposeMode
          ? optimizePromptViaProxy(userInstruction, COMPOSE_FROM_DESCRIPTION_META, requestMode, {
              compose: true
            })
          : optimizePromptViaProxy(
              originalPrompt,
              fallbackInstruction,
              requestMode
            );
        const optimization = await optimizationPromise;
        const optimizedPrompt = optimization.optimizedPrompt;
        if (optimization.credits) {
          ui.setCreditUsage(optimization.credits);
        }
        if (!isComposeMode) {
          ui.setAutoAdjustLoading(true, "updating", false, "improve");
        }
        // Mark pending programmatic text BEFORE dispatching input events,
        // so observers/sync don't treat it as a user edit mid-animation.
        markPromptlyRewrite(optimizedPrompt);
        replaceTargetText(currentTarget, optimizedPrompt);
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
        } else {
          promptLifecycleState.improveMutedByCompose = false;
        }
        if (!isOpen) {
          ui.setTabStatus(isComposeMode ? "strong" : "improved");
        }
      } catch (_error) {
        hadError = true;
        const rawReason = String(_error?.message || _error || "failed");
        ui.showErrorToast(mapPromptlyErrorToToast(rawReason));
        if (_error?.promptlyCredits) {
          ui.setCreditUsage(_error.promptlyCredits);
        }
        const limitReached = /daily api token limit reached|daily credit limit reached/i.test(rawReason);
        const tokenShortfall = /not enough api tokens|not enough daily tokens/i.test(rawReason);
        const reason = limitReached
          ? "Daily API token limit reached"
          : tokenShortfall
            ? "Not enough API tokens for this prompt"
            : rawReason;
        if (!(_error?.promptlyCredits) && (limitReached || tokenShortfall)) {
          try {
            const credits = await fetchCreditUsageViaProxy();
            if (credits) {
              ui.setCreditUsage(credits);
            }
          } catch (_creditsError) {
            // Ignore credits refresh failure; primary error is already surfaced.
          }
        }
        ui.setAutoAdjustLoading(false, `failed: ${reason}`, true, isComposeMode ? "compose" : "improve");
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
    onLayoutChange: () => {
      observers.scheduleUpdate();
    },
    onToggleAutoSend: () => {
      autoAdjustOnSend = !autoAdjustOnSend;
      try {
        window.localStorage.setItem(autoSendStorageKey, autoAdjustOnSend ? "1" : "0");
      } catch (_error) {
        // Ignore storage errors.
      }
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
  // Try to detect sign-in status on startup (non-interactive).
  checkChromeSignedIn()
    .then(() => ui.setSignedOut(false))
    .catch(() => ui.setSignedOut(true));

  function getPromptText(target) {
    if (!target || !adapters.isEditable(target)) {
      return "";
    }
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      return String(target.value || "");
    }
    return String(target.innerText || target.textContent || "").replace(/\u00a0/g, " ");
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
        ui.setSignedOut(true);
            reject(new Error(response?.error || "User verification failed"));
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
    if (lowered.includes("sign in to chrome")) return "Sign in to Chrome (Gmail) to use Promptly.";
    if (lowered.includes("only gmail chrome profiles")) return "Use a Chrome profile signed into Gmail.";
    if (lowered.includes("not signed in on this ai service page")) return "Sign in on this AI site, then try again.";
    if (lowered.includes("service account email does not match")) return "Account mismatch: switch to your Chrome Gmail.";
    if (lowered.includes("daily api token limit reached")) return "Daily token limit reached. Try again tomorrow.";
    if (lowered.includes("not enough api tokens")) return "Not enough tokens left for this prompt.";
    if (lowered.includes("timeout")) return "Request timed out. Try again.";
    return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg;
  }

  async function checkChromeSignedIn() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "PROMPTLY_CHECK_CHROME_SIGNIN" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error(response?.error || "Not signed in"));
          return;
        }
        resolve(response.data || {});
      });
    });
  }

  async function ensureChromeSignedIn() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "PROMPTLY_ENSURE_CHROME_SIGNIN" }, (response) => {
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

  async function optimizePromptViaProxy(
    prompt,
    userInstruction = "",
    requestMode = "rewrite",
    options = {}
  ) {
    const compose = !!options.compose;
    const instructionForProxy =
      !compose && requestMode === "rewrite"
        ? resolveRewriteUserInstruction(userInstruction)
        : userInstruction;
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "PROMPTLY_OPTIMIZE_PROMPT",
          prompt,
          userInstruction: instructionForProxy,
          requestMode
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            const err = new Error(response?.error || "Auto adjust failed");
            if (response?.credits) {
              err.promptlyCredits = response.credits;
            }
            reject(err);
            return;
          }
          const optimized = String(response.data.optimized_prompt || "").trim();
          if (!optimized) {
            reject(new Error("Empty optimized prompt"));
            return;
          }
          if (compose) {
            const interpreted = interpretComposeOptimizedOutput(optimized);
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
            optimizedPrompt: optimized,
            credits: response.data.credits || null
          });
        }
      );
    });
  }

  async function fetchCreditUsageViaProxy(estimate = null) {
    return new Promise((resolve, reject) => {
      const payload = { type: "PROMPTLY_GET_CREDITS" };
      if (
        estimate &&
        typeof estimate.promptLength === "number" &&
        typeof estimate.instructionLength === "number"
      ) {
        payload.estimatePromptLength = estimate.promptLength;
        payload.estimateInstructionLength = estimate.instructionLength;
      }
      chrome.runtime.sendMessage(
        payload,
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            reject(new Error(response?.error || "Unable to load credits"));
            return;
          }
          resolve(response.data?.credits || null);
        }
      );
    });
  }

  async function refreshCreditsFromServer(estimate = null) {
    try {
      const credits = await fetchCreditUsageViaProxy(estimate);
      if (credits) {
        ui.setCreditUsage(credits);
      }
    } catch (_e) {
      // Keep existing meter; server still enforces limits on optimize.
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
      refreshCreditsFromServer();
    }, 400);
  }

  function replaceTargetText(target, text) {
    if (!target || !adapters.isEditable(target)) {
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

    if (document.activeElement !== target) {
      target.focus();
    }
    let replaced = false;
    if (typeof document.execCommand === "function") {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(target);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      replaced = document.execCommand("insertText", false, text);
    }
    if (!replaced) {
      target.textContent = text;
    }
    dispatchInputEvents(target, text);
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

  function appendDirectiveToTarget(target, directive) {
    if (!target || !adapters.isEditable(target)) {
      return "";
    }
    const previousText = getPromptText(target);
    const separator = previousText.trim() && !/\s$/.test(previousText) ? "\n\n" : "";
    const nextText = `${previousText}${separator}${directive}`;
    // Use the same robust full-replacement path as AI rewrite for site compatibility.
    replaceTargetText(target, nextText);
    return nextText;
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
    const autoAdjustSuffix = REWRITE_SUFFIX_MANUAL_V3;

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
      suggestions: [],
      suggestionNotice: ""
    };
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
    const rect = target.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 24) {
      return false;
    }
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
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
    const rect = getAnchorRectForTarget(currentTarget);
    ui.setTheme(inferThemeFromTarget(currentTarget));
    if (isOpen) {
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
      button.getAttribute("id"),
      button.className
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return /\b(send|submit|composer-submit)\b/.test(signals);
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
    if (!isOpen) {
      ui.setTabStatus("rewriting");
    }
    const originalPrompt = getPromptText(currentTarget).trim();
    if (!isImprovePromptSubstantive(originalPrompt)) {
      if (!isOpen) {
        ui.setTabStatus("idle");
      }
      triggerSendAfterAdjust(trigger);
      return;
    }
    if (promptLifecycleState.hasPromptlyRewrite) {
      if (!isOpen) {
        ui.setTabStatus("idle");
      }
      triggerSendAfterAdjust(trigger);
      return;
    }

    autoAdjustInFlight = true;
    let didApplyOptimizedPrompt = false;
    try {
      ui.setAutoAdjustLoading(true, "reading prompt");
      ui.setAutoAdjustLoading(true, "analyzing");
      ui.playAutoButtonBoxShineOnce();
      await verifyCurrentUserSession();
      refreshCreditsFromServer({
        promptLength: originalPrompt.length,
        instructionLength: REWRITE_SUFFIX_AUTO_V3.length
      });
      const optimization = await optimizePromptViaProxy(
        originalPrompt,
        REWRITE_SUFFIX_AUTO_V3,
        "rewrite"
      );
      const optimizedPrompt = optimization.optimizedPrompt;
      if (optimization.credits) {
        ui.setCreditUsage(optimization.credits);
      }
      ui.setAutoAdjustLoading(true, "updating");
      markPromptlyRewrite(optimizedPrompt);
      replaceTargetText(currentTarget, optimizedPrompt);
      didApplyOptimizedPrompt = true;
      if (!isOpen) {
        ui.setTabStatus("improved");
      }
    } catch (_error) {
      ui.showErrorToast(mapPromptlyErrorToToast(String(_error?.message || _error || "")));
      if (_error?.promptlyCredits) {
        ui.setCreditUsage(_error.promptlyCredits);
      }
      // Fall through and send original prompt if optimization fails.
      if (!isOpen) {
        ui.setTabStatus("idle");
      }
    } finally {
      autoAdjustInFlight = false;
      const finalize = () => {
        ui.setAutoAdjustLoading(false);
        observers.scheduleUpdate();
        window.requestAnimationFrame(() => triggerSendAfterAdjust(trigger));
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

  function destroy() {
    destroyed = true;
    window.clearTimeout(visibilityCreditsRefreshTimer);
    visibilityCreditsRefreshTimer = null;
    window.clearTimeout(unlockDisplayTimer);
    observers.stop();
    document.removeEventListener("pointerdown", handlePointerDown, true);
    document.removeEventListener("click", handleDocumentClick, true);
    window.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("visibilitychange", scheduleCreditsRefreshWhenVisible);
    window.removeEventListener("pagehide", destroy, true);
    ui.destroy();
  }

  observers.start();
  fetchCreditUsageViaProxy()
    .then((credits) => {
      if (credits) {
        ui.setCreditUsage(credits);
      }
    })
    .catch(() => {
      // Tooltip keeps default text when usage fetch fails.
    });
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("click", handleDocumentClick, true);
  window.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("visibilitychange", scheduleCreditsRefreshWhenVisible);
  window.addEventListener("pagehide", destroy, true);
  observers.scheduleUpdate();
})();
