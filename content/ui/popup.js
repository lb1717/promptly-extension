(() => {
  class PromptlyPopup {
    constructor(rootNode, onSuggestionClick, onAutoAdjustClick, onLayoutHintChange) {
      this.rootNode = rootNode;
      this.doc = rootNode.ownerDocument || document;
      this.onSuggestionClick = onSuggestionClick;
      this.onAutoAdjustClick = onAutoAdjustClick;
      this.onLayoutHintChange = onLayoutHintChange;
      this.root = this.doc.createElement("section");
      this.root.className = "promptly-popup";
      this.root.setAttribute("aria-hidden", "true");
      this.root.dataset.rewriteLines = "1";
      this.lastBounds = { width: 0, height: 0 };
      this.autoErrorResetTimer = null;
      this.autoBoxShineEndHandler = null;
      this.autoTextLoopResetTimer = null;
      this.composeSendErrorResetTimer = null;
      this.composePromptWritten = false;
      /** After Generate Prompt: keep description visible until first edit clears it (once per generate). */
      this.scratchClearOnNextEdit = false;
      /** True until user has done the one-time clear; prevents re-arming clear on every refocus. */
      this.awaitingOneTimeScratchClear = false;
      /** Exact field value after last successful generate; used to block duplicate API calls. */
      this.composeFieldBaseline = null;
      this.composeFieldDirty = false;
      this.composeStageTimer = null;
      this.composeShineWatchdogTimer = null;
      this.composeShineEnforcerRaf = null;
      this.composeShineHardOverrideActive = false;
      this.composeLastDebugLogAt = 0;
      this.composeDebugStorageKey = "promptly:compose-shine:logs";
      this.composeDebugSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.composeStageLoopActive = false;
      this.composeAwaitingPromptWrite = false;
      this.composeAwaitingPreWriteWordCount = null;
      this.composeAwaitingFinalizeTimer = null;
      this.composeLastObservedWriteWordCount = null;
      this.composeThinkingRun = [];
      this.composeThinkingIndex = 0;
      /** 0–3 while generate is in flight; advances at most to 3 then holds until the API finishes. */
      this.composeProgressPhase = 0;
      /** After success display, keep label on idle Generate Prompt. */
      this.composeUseIdleLabel = false;
      this.composeThoughtLineEls = [];
      this.visibleLineCount = 1;
      this.maxVisibleLines = 4;
      this.lastRenderedWordCount = 0;
      /** Smoothed 0–100 display for manual strength; snaps when Promptly enhances. */
      this.strengthDisplay = null;
      this.lastStrengthAiEnhanced = null;

      this.fitLayer = this.doc.createElement("div");
      this.fitLayer.className = "promptly-fit-layer";

      this.topRow = this.doc.createElement("div");
      this.topRow.className = "promptly-top-metrics";

      this.strengthInlineLabel = this.doc.createElement("span");
      this.strengthInlineLabel.className = "promptly-strength-inline-label";
      this.strengthInlineLabel.textContent = "Prompt strength";

      this.wordCountLabel = this.doc.createElement("span");
      this.wordCountLabel.className = "promptly-word-count-label";
      this.wordCountLabel.textContent = "Words:";
      this.wordCountValue = this.doc.createElement("span");
      this.wordCountValue.className = "promptly-word-count-value";
      this.wordCountValue.textContent = "0";
      this.wordCountInline = this.doc.createElement("span");
      this.wordCountInline.className = "promptly-word-count-inline";
      this.wordCountInline.append(this.wordCountLabel, this.wordCountValue);

      this.autoAdjustButton = this.doc.createElement("button");
      this.autoAdjustButton.type = "button";
      this.autoAdjustButton.className = "promptly-auto-button";
      this.autoTextWindow = this.doc.createElement("span");
      this.autoTextWindow.className = "promptly-auto-text-window";
      this.autoTextTrack = this.doc.createElement("span");
      this.autoTextTrack.className = "promptly-auto-text-track";
      this.autoTextTrack.innerHTML =
        "<span class='promptly-auto-text-line'>Improve Prompt</span>" +
        "<span class='promptly-auto-text-line'>Improve Prompt</span>" +
        "<span class='promptly-auto-text-line'>Analyzing</span>" +
        "<span class='promptly-auto-text-line'>Rewriting</span>" +
        "<span class='promptly-auto-text-line'>Prompt Improved ✓</span>" +
        "<span class='promptly-auto-text-line'>Prompt Already Strong ✓</span>" +
        "<span class='promptly-auto-text-line'>Improve Prompt</span>";
      this.autoTextWindow.append(this.autoTextTrack);
      this.autoAdjustErrorText = this.doc.createElement("span");
      this.autoAdjustErrorText.className = "promptly-auto-error-text";
      this.autoAdjustErrorText.textContent = "";
      this.autoAdjustButton.append(this.autoTextWindow, this.autoAdjustErrorText);
      this.autoAdjustButton.dataset.stage = "idle";
      this.autoAdjustButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.autoAdjustButton.disabled) {
          return;
        }
        if (typeof this.onAutoAdjustClick === "function") {
          this.onAutoAdjustClick({
            mode: "improve",
            suffix: this.autoAdjustSuffix,
            userInstruction: ""
          });
        }
      });

      this.dividerOne = this.doc.createElement("div");
      this.dividerOne.className = "promptly-divider";

      this.suggestionTitle = this.doc.createElement("div");
      this.suggestionTitle.className = "promptly-section-label";
      this.suggestionTitle.textContent = "Create a Superprompt";

      this.rewriteInputWrap = this.doc.createElement("div");
      this.rewriteInputWrap.className = "promptly-rewrite-input-wrap";
      this.rewriteInstructionInput = this.doc.createElement("textarea");
      this.rewriteInstructionInput.rows = 1;
      this.rewriteInstructionInput.wrap = "soft";
      this.rewriteInstructionInput.className = "promptly-rewrite-input";
      this.rewriteInstructionInput.placeholder = "Describe the prompt you want to write";
      this.rewriteInstructionInput.addEventListener("focus", () => {
        // Only arm the clear once per successful generate — not on every refocus (that caused
        // every keystroke after the first to wipe the field again).
        if (this.composePromptWritten && this.awaitingOneTimeScratchClear) {
          this.scratchClearOnNextEdit = true;
        }
      });
      this.rewriteInstructionInput.addEventListener("beforeinput", (event) => {
        if (!this.scratchClearOnNextEdit) {
          return;
        }
        const t = event.inputType || "";
        const isMeaningfulEdit =
          t === "insertText" ||
          t === "insertLineBreak" ||
          t === "insertFromPaste" ||
          t === "insertFromYank" ||
          t === "deleteContentBackward" ||
          t === "deleteContentForward" ||
          t === "deleteByCut" ||
          t === "deleteByDrag";
        if (!isMeaningfulEdit) {
          return;
        }
        this.rewriteInstructionInput.value = "";
        this.scratchClearOnNextEdit = false;
        this.awaitingOneTimeScratchClear = false;
        this.updateInputLineMode();
      });
      this.rewriteInstructionInput.addEventListener("input", () => {
        if (
          this.composePromptWritten &&
          this.composeFieldBaseline !== null &&
          this.rewriteInstructionInput.value !== this.composeFieldBaseline
        ) {
          this.composeFieldDirty = true;
        }
        this.updateInputLineMode();
        const hasText = String(this.rewriteInstructionInput.value || "").trim().length > 0;
        if (this.composeSendErrorResetTimer) {
          window.clearTimeout(this.composeSendErrorResetTimer);
          this.composeSendErrorResetTimer = null;
        }
        this.rewriteSendButton.classList.remove("has-compose-inline-error");
        this.rewriteSendErrorText.textContent = "";
        if (!this.rewriteSendButton.classList.contains("is-working")) {
          if (this.composeUseIdleLabel) {
            this.rewriteSendButton.dataset.stage = "idle";
          } else if (this.composePromptWritten && hasText) {
            this.rewriteSendButton.dataset.stage = "further";
          } else if (this.composePromptWritten) {
            this.rewriteSendButton.dataset.stage = "written";
          } else {
            this.rewriteSendButton.dataset.stage = "idle";
          }
        }
      });
      this.rewriteInstructionInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
          return;
        }
        if (event.shiftKey) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (this.rewriteSendButton && !this.rewriteSendButton.disabled) {
          this.rewriteSendButton.click();
        }
      });
      this.rewriteSendRow = this.doc.createElement("div");
      this.rewriteSendRow.className = "promptly-rewrite-send-row";
      this.rewriteSendButton = this.doc.createElement("button");
      this.rewriteSendButton.type = "button";
      this.rewriteSendButton.className = "promptly-rewrite-send";
      this.rewriteSendButton.title = "Send rewrite instruction";
      this.rewriteSendTextWindow = this.doc.createElement("span");
      this.rewriteSendTextWindow.className = "promptly-rewrite-send-text-window";
      this.rewriteSendTextTrack = this.doc.createElement("span");
      this.rewriteSendTextTrack.className = "promptly-rewrite-send-text-track";
      this.rewriteSendTextTrack.innerHTML =
        "<span class='promptly-rewrite-send-text-line'>Generate Prompt</span>" +
        "<span class='promptly-rewrite-send-text-line promptly-rewrite-compose-line'>Analyzing</span>" +
        "<span class='promptly-rewrite-send-text-line promptly-rewrite-compose-line'>Analyzing</span>" +
        "<span class='promptly-rewrite-send-text-line promptly-rewrite-compose-line'>Analyzing</span>" +
        "<span class='promptly-rewrite-send-text-line promptly-rewrite-compose-line'>Analyzing</span>" +
        "<span class='promptly-rewrite-send-text-line'>Prompt Generated</span>" +
        "<span class='promptly-rewrite-send-text-line'>Generate Prompt</span>";
      this.composeThoughtLineEls = Array.from(
        this.rewriteSendTextTrack.querySelectorAll(".promptly-rewrite-compose-line")
      );
      this.rewriteSendTextWindow.append(this.rewriteSendTextTrack);
      this.rewriteSendErrorText = this.doc.createElement("span");
      this.rewriteSendErrorText.className = "promptly-rewrite-send-error-text";
      this.rewriteSendErrorText.textContent = "";
      this.rewriteSendButton.append(this.rewriteSendTextWindow, this.rewriteSendErrorText);
      this.rewriteSendButton.dataset.stage = "idle";
      this.rewriteSendButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const userInstruction = String(this.rewriteInstructionInput?.value || "").trim();
        if (
          this.composePromptWritten &&
          !this.composeFieldDirty &&
          this.composeFieldBaseline !== null
        ) {
          this.setAutoAdjustLoading(false, "Prompt already generated", true, "compose");
          return;
        }
        if (!userInstruction) {
          return;
        }
        if (typeof this.onAutoAdjustClick === "function") {
          this.onAutoAdjustClick({
            mode: "compose",
            suffix: "",
            userInstruction
          });
        }
      });
      this.rewriteSendRow.append(this.rewriteSendButton);
      this.rewriteInputWrap.append(this.rewriteInstructionInput, this.rewriteSendRow);

      this.suggestions = this.doc.createElement("div");
      this.suggestions.className = "promptly-suggestion-row";

      this.dividerTwo = this.doc.createElement("div");
      this.dividerTwo.className = "promptly-divider";

      this.strengthTrack = this.doc.createElement("div");
      this.strengthTrack.className = "promptly-strength-track";
      this.strengthFill = this.doc.createElement("div");
      this.strengthFill.className = "promptly-strength-fill";
      this.strengthTrack.append(this.strengthFill);

      this.topRow.append(
        this.strengthInlineLabel,
        this.strengthTrack,
        this.wordCountInline
      );
      this.fitLayer.append(
        this.topRow,
        this.dividerOne,
        this.autoAdjustButton,
        this.dividerTwo,
        this.suggestionTitle,
        this.rewriteInputWrap,
        this.suggestions
      );
      this.root.append(this.fitLayer);
      this.autoAdjustSuffix = "";
      this.autoStageResetTimer = null;
      this.updateInputLineMode();
    }

    shouldLogComposeDebug() {
      return true;
    }

    logComposeDebug(eventName, details = null, throttleMs = 0) {
      if (!this.shouldLogComposeDebug()) {
        return;
      }
      const now = Date.now();
      if (throttleMs > 0 && now - this.composeLastDebugLogAt < throttleMs) {
        return;
      }
      this.composeLastDebugLogAt = now;
      const payload = {
        event: eventName,
        stage: this.rewriteSendButton?.dataset?.stage || "",
        isWorking: this.rewriteSendButton?.classList?.contains("is-working") || false,
        disabled: !!this.rewriteSendButton?.disabled,
        loopActive: !!this.composeStageLoopActive,
        awaitingWrite: !!this.composeAwaitingPromptWrite,
        thinkingIndex: this.composeThinkingIndex
      };
      if (details && typeof details === "object") {
        Object.assign(payload, details);
      }
      this.persistComposeDebugLog(payload);
      console.warn("[Promptly][compose-shine]", payload);
    }

    persistComposeDebugLog(payload) {
      const entry = {
        t: new Date().toISOString(),
        sid: this.composeDebugSessionId,
        ...payload
      };
      try {
        const existingRaw = window.localStorage.getItem(this.composeDebugStorageKey);
        const existing = existingRaw ? JSON.parse(existingRaw) : [];
        const next = Array.isArray(existing) ? existing : [];
        next.push(entry);
        // Keep a rolling log window to avoid unbounded storage growth.
        const capped = next.slice(-600);
        window.localStorage.setItem(this.composeDebugStorageKey, JSON.stringify(capped));
      } catch (_error) {
        // Ignore storage failures; console logs still provide fallback visibility.
      }
      try {
        // Handy runtime hooks for quick inspection without digging in storage.
        window.__PROMPTLY_COMPOSE_SHINE_LOGS__ = window.__PROMPTLY_COMPOSE_SHINE_LOGS__ || [];
        window.__PROMPTLY_COMPOSE_SHINE_LOGS__.push(entry);
        if (window.__PROMPTLY_COMPOSE_SHINE_LOGS__.length > 600) {
          window.__PROMPTLY_COMPOSE_SHINE_LOGS__.splice(
            0,
            window.__PROMPTLY_COMPOSE_SHINE_LOGS__.length - 600
          );
        }
      } catch (_error) {
        // Ignore runtime property assignment issues.
      }
    }

    getVisibleComposeThinkingLine() {
      const stage = String(this.rewriteSendButton?.dataset?.stage || "");
      if (!stage.startsWith("compose")) {
        return null;
      }
      const idx = Number(stage.replace("compose", ""));
      if (!Number.isFinite(idx)) {
        return null;
      }
      const lineIndex = Math.min(3, Math.max(0, idx));
      return this.composeThoughtLineEls[lineIndex] || null;
    }

    isComposeShineHealthy() {
      if (!this.rewriteSendButton?.classList?.contains("is-working")) {
        return false;
      }
      const line = this.getVisibleComposeThinkingLine();
      if (!line) {
        return true;
      }
      const style = window.getComputedStyle(line);
      const hasAnimation = String(style.animationName || "").includes("promptly-shine");
      const isTransparent = String(style.color || "").includes("0, 0, 0, 0");
      return hasAnimation || isTransparent;
    }

    getInputLineMetrics() {
      const input = this.rewriteInstructionInput;
      if (!input) {
        return { rawLines: 1, lineHeightPx: 19, paddingY: 6 };
      }
      const style = window.getComputedStyle(input);
      const lineHeightPx = Number.parseFloat(style.lineHeight) || 12;
      const paddingTop = Number.parseFloat(style.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
      const paddingY = paddingTop + paddingBottom;
      const innerTextHeight = Math.max(0, input.scrollHeight - paddingY);
      // Use rounding (not ceil) so the field does not jump to 2 lines
      // on the very first characters due fractional layout/pixel jitter.
      const rawLines = Math.max(1, Math.round(innerTextHeight / lineHeightPx));
      return { rawLines, lineHeightPx, paddingY };
    }

    /**
     * Temporary: when inline error areas are too small, show the full message in the rewrite textarea.
     * TODO: remove this workaround when error UI supports long copy.
     */
    appendPromptlyErrorToRewriteField(fullMessage) {
      const msg = String(fullMessage || "").trim();
      if (!msg || !this.rewriteInstructionInput) {
        return;
      }
      const header = "[Promptly — error]\n";
      const existing = String(this.rewriteInstructionInput.value || "");
      const block = `${header}${msg}\n\n`;
      if (existing.includes(header) && existing.includes(msg)) {
        return;
      }
      this.rewriteInstructionInput.value = existing ? `${block}${existing}` : block;
      this.updateInputLineMode();
    }

    updateInputLineMode() {
      const input = this.rewriteInstructionInput;
      if (!input) {
        return;
      }
      input.style.height = "auto";
      const isEmpty = String(input.value || "").trim().length === 0;
      const { rawLines, lineHeightPx, paddingY } = this.getInputLineMetrics();
      const effectiveRawLines = isEmpty ? 1 : rawLines;
      const nextVisibleLines = Math.min(this.maxVisibleLines, effectiveRawLines);
      const nextHeight = Math.round(paddingY + lineHeightPx * nextVisibleLines);
      input.style.height = `${nextHeight}px`;
      input.style.overflowY = effectiveRawLines > this.maxVisibleLines ? "auto" : "hidden";

      if (nextVisibleLines !== this.visibleLineCount) {
        this.visibleLineCount = nextVisibleLines;
        this.root.dataset.rewriteLines = String(nextVisibleLines);
        if (typeof this.onLayoutHintChange === "function") {
          this.onLayoutHintChange({
            lineCount: this.visibleLineCount,
            scrollable: effectiveRawLines > this.maxVisibleLines
          });
        }
      }
    }

    setDirection(direction) {
      this.root.dataset.direction = direction;
    }

    setOpen(isOpen) {
      this.root.setAttribute("aria-hidden", String(!isOpen));
    }

    endComposeStageLoop() {
      this.composeStageLoopActive = false;
      this.composeProgressPhase = 0;
      if (this.composeStageTimer) {
        window.clearTimeout(this.composeStageTimer);
        this.composeStageTimer = null;
      }
    }

    startComposeShineWatchdog() {
      this.stopComposeShineWatchdog();
      this.logComposeDebug("watchdog-start");
      this.composeShineWatchdogTimer = window.setInterval(() => {
        const shouldKeepShining =
          this.composeStageLoopActive ||
          !!this.rewriteSendButton?.disabled ||
          this.composeAwaitingPromptWrite;
        if (shouldKeepShining && !this.rewriteSendButton.classList.contains("is-working")) {
          this.logComposeDebug("watchdog-recover-is-working", null, 500);
          this.rewriteSendButton.classList.add("is-working");
        }
        if (shouldKeepShining && this.composeShineHardOverrideActive) {
          this.applyComposeShineHardOverride(true);
        }
        if (shouldKeepShining && !this.isComposeShineHealthy()) {
          this.logComposeDebug("watchdog-recover-shine", { reason: "unhealthy-style" }, 500);
          this.rewriteSendButton.classList.add("is-working");
          this.applyComposeShineHardOverride(true);
        }
      }, 120);
    }

    stopComposeShineWatchdog() {
      if (this.composeShineWatchdogTimer) {
        window.clearInterval(this.composeShineWatchdogTimer);
        this.composeShineWatchdogTimer = null;
        this.logComposeDebug("watchdog-stop");
      }
    }

    startComposeShineEnforcer() {
      this.stopComposeShineEnforcer();
      const tick = () => {
        const shouldEnforce =
          this.composeStageLoopActive || !!this.rewriteSendButton?.disabled || this.composeAwaitingPromptWrite;
        if (!shouldEnforce) {
          this.composeShineEnforcerRaf = null;
          return;
        }
        if (!this.rewriteSendButton.classList.contains("is-working")) {
          this.rewriteSendButton.classList.add("is-working");
        }
        this.applyComposeShineHardOverride(true);
        this.composeShineEnforcerRaf = window.requestAnimationFrame(tick);
      };
      this.composeShineEnforcerRaf = window.requestAnimationFrame(tick);
      this.logComposeDebug("enforcer-start");
    }

    stopComposeShineEnforcer() {
      if (this.composeShineEnforcerRaf !== null) {
        window.cancelAnimationFrame(this.composeShineEnforcerRaf);
        this.composeShineEnforcerRaf = null;
        this.logComposeDebug("enforcer-stop");
      }
    }

    applyComposeShineHardOverride(enabled) {
      this.composeShineHardOverrideActive = !!enabled;
      const lines = this.composeThoughtLineEls || [];
      if (enabled) {
        this.logComposeDebug("hard-override-on", null, 800);
        for (const line of lines) {
          line.style.background = "linear-gradient(90deg, rgba(79, 70, 229, 0.55) 0%, rgba(67, 56, 202, 1) 45%, rgba(79, 70, 229, 0.55) 100%)";
          line.style.backgroundSize = "220% 100%";
          line.style.webkitBackgroundClip = "text";
          line.style.backgroundClip = "text";
          line.style.color = "transparent";
          line.style.animation = "promptly-shine 1s linear infinite";
        }
        return;
      }
      this.logComposeDebug("hard-override-off");
      for (const line of lines) {
        line.style.background = "";
        line.style.backgroundSize = "";
        line.style.webkitBackgroundClip = "";
        line.style.backgroundClip = "";
        line.style.color = "";
        line.style.animation = "";
      }
    }

    resetComposeThoughtLinePlaceholders() {
      const defaults = ["Analyzing", "Analyzing", "Analyzing", "Analyzing"];
      for (let i = 0; i < 4; i++) {
        if (this.composeThoughtLineEls[i]) {
          this.composeThoughtLineEls[i].textContent = defaults[i];
        }
      }
    }

    finalizeComposeThinkingUi() {
      this.logComposeDebug("finalize-ui");
      if (this.composeAwaitingFinalizeTimer) {
        window.clearTimeout(this.composeAwaitingFinalizeTimer);
        this.composeAwaitingFinalizeTimer = null;
      }
      this.endComposeStageLoop();
      this.composeAwaitingPromptWrite = false;
      this.composeAwaitingPreWriteWordCount = null;
      this.composeLastObservedWriteWordCount = null;
      this.composeThinkingRun = [];
      this.composeThinkingIndex = 0;
      this.composeUseIdleLabel = true;
      this.rewriteSendButton.dataset.stage = "idle";
      this.rewriteSendButton.classList.remove("is-working");
      this.stopComposeShineWatchdog();
      this.stopComposeShineEnforcer();
      this.applyComposeShineHardOverride(false);
      this.resetComposeThoughtLinePlaceholders();
    }

    /**
     * Generate Prompt: fixed "Analyzing" + infinite shine until the host prompt bar reflects the paste
     * (see setContent / finalizeComposeThinkingUi). Not advanced by API stage text or fake timers.
     */
    playAutoButtonBoxShineOnce() {
      const btn = this.autoAdjustButton;
      if (!btn) {
        return;
      }
      if (this.autoBoxShineEndHandler) {
        btn.removeEventListener("animationend", this.autoBoxShineEndHandler);
        this.autoBoxShineEndHandler = null;
      }
      const onEnd = (event) => {
        if (event.animationName !== "promptly-auto-box-shine") {
          return;
        }
        btn.classList.remove("is-auto-box-shine");
        btn.removeEventListener("animationend", onEnd);
        if (this.autoBoxShineEndHandler === onEnd) {
          this.autoBoxShineEndHandler = null;
        }
      };
      this.autoBoxShineEndHandler = onEnd;
      btn.addEventListener("animationend", onEnd);
      btn.classList.remove("is-auto-box-shine");
      void btn.offsetWidth;
      btn.classList.add("is-auto-box-shine");
    }

    beginComposeGenerationProgress() {
      this.endComposeStageLoop();
      this.composeStageLoopActive = true;
      this.composeAwaitingPromptWrite = false;
      this.composeProgressPhase = 0;
      this.composeUseIdleLabel = false;
      this.composeThinkingRun = ["Analyzing"];
      this.composeThinkingIndex = 0;
      for (let i = 0; i < 4; i++) {
        if (this.composeThoughtLineEls[i]) {
          this.composeThoughtLineEls[i].textContent = "Analyzing";
        }
      }
      this.rewriteSendButton.dataset.stage = "compose0";
      this.logComposeDebug("thinking-start-analyzing-only");
    }

    setAutoAdjustLoading(isLoading, stageText = "", isError = false, mode = "improve") {
      if (this.autoErrorResetTimer) {
        window.clearTimeout(this.autoErrorResetTimer);
        this.autoErrorResetTimer = null;
      }
      if (this.composeSendErrorResetTimer) {
        window.clearTimeout(this.composeSendErrorResetTimer);
        this.composeSendErrorResetTimer = null;
      }
      if (this.autoTextLoopResetTimer) {
        window.clearTimeout(this.autoTextLoopResetTimer);
        this.autoTextLoopResetTimer = null;
      }
      if (this.autoStageResetTimer) {
        window.clearTimeout(this.autoStageResetTimer);
        this.autoStageResetTimer = null;
      }
      const modeKey = String(mode || "improve").toLowerCase();
      if (modeKey === "compose") {
        this.rewriteSendButton.classList.remove("has-compose-inline-error");
        this.rewriteSendErrorText.textContent = "";
        this.rewriteSendButton.disabled = isLoading;
        if (isLoading) {
          const alreadyActive =
            this.composeStageLoopActive ||
            this.composeAwaitingPromptWrite ||
            this.rewriteSendButton.classList.contains("is-working");
          if (alreadyActive) {
            this.logComposeDebug("compose-loading-on-ignored-duplicate");
            this.rewriteSendButton.classList.add("is-working");
            this.applyComposeShineHardOverride(true);
            this.startComposeShineWatchdog();
            this.startComposeShineEnforcer();
            return;
          }
          this.logComposeDebug("compose-loading-on");
          this.composeAwaitingPreWriteWordCount = this.lastRenderedWordCount;
          this.composeLastObservedWriteWordCount = null;
          if (this.composeAwaitingFinalizeTimer) {
            window.clearTimeout(this.composeAwaitingFinalizeTimer);
            this.composeAwaitingFinalizeTimer = null;
          }
          this.rewriteSendButton.classList.add("is-working");
          this.applyComposeShineHardOverride(true);
          this.startComposeShineWatchdog();
          this.startComposeShineEnforcer();
          this.beginComposeGenerationProgress();
          return;
        }
        if (isError) {
          this.logComposeDebug("compose-loading-error", { stageText: String(stageText || "") });
          this.endComposeStageLoop();
          this.composeAwaitingPromptWrite = false;
          this.composeAwaitingPreWriteWordCount = null;
          this.composeLastObservedWriteWordCount = null;
          if (this.composeAwaitingFinalizeTimer) {
            window.clearTimeout(this.composeAwaitingFinalizeTimer);
            this.composeAwaitingFinalizeTimer = null;
          }
          this.rewriteSendButton.classList.remove("is-working");
          this.stopComposeShineWatchdog();
          this.stopComposeShineEnforcer();
          this.applyComposeShineHardOverride(false);
          const hasText = String(this.rewriteInstructionInput?.value || "").trim().length > 0;
          const errMsg = String(stageText || "")
            .replace(/^failed:\s*/i, "")
            .trim();
          const COMPOSE_INLINE_ERROR_MAX = 120;
          if (errMsg) {
            if (errMsg.length > COMPOSE_INLINE_ERROR_MAX) {
              this.appendPromptlyErrorToRewriteField(errMsg);
              this.rewriteSendErrorText.textContent = "See text box above";
            } else {
              this.rewriteSendErrorText.textContent = errMsg;
            }
            this.rewriteSendButton.classList.add("has-compose-inline-error");
            this.composeSendErrorResetTimer = window.setTimeout(() => {
              this.rewriteSendButton.classList.remove("has-compose-inline-error");
              this.rewriteSendErrorText.textContent = "";
              this.composeSendErrorResetTimer = null;
            }, 3200);
          }
          this.rewriteSendButton.classList.add("is-compose-text-reset");
          this.rewriteSendButton.dataset.stage =
            this.composePromptWritten && hasText ? "further" : this.composePromptWritten ? "written" : "idle";
          requestAnimationFrame(() => {
            this.rewriteSendButton.classList.remove("is-compose-text-reset");
            this.resetComposeThoughtLinePlaceholders();
          });
          return;
        }
        this.composePromptWritten = true;
        // Decouple API loading from write monitoring: loading is done now, writing monitor
        // continues in parallel while shine stays active via enforcer/watchdog.
        this.endComposeStageLoop();
        this.composeAwaitingPromptWrite = true;
        // Stay on compose0 so the visible line remains "Analyzing" until paste is confirmed.
        this.rewriteSendButton.dataset.stage = "compose0";
        this.logComposeDebug("compose-loading-off-parallel-write");
        this.awaitingOneTimeScratchClear = true;
        {
          const root = this.rewriteInstructionInput.getRootNode();
          const ae =
            root && "activeElement" in root ? root.activeElement : this.doc.activeElement;
          this.scratchClearOnNextEdit = ae === this.rewriteInstructionInput;
        }
        this.composeFieldBaseline = String(this.rewriteInstructionInput?.value ?? "");
        this.composeFieldDirty = false;
        // Do not stop local thinking/shimmer here; wait until setContent confirms box write.
        // Keep description text in the field; user can edit fresh after focus + typing (beforeinput).
        return;
      }

      this.autoAdjustButton.disabled = isLoading;
      this.autoAdjustButton.classList.remove("is-auto-text-reset");
      this.autoAdjustButton.classList.remove("has-inline-error");
      if (isLoading) {
        if (this.autoBoxShineEndHandler) {
          this.autoAdjustButton.removeEventListener("animationend", this.autoBoxShineEndHandler);
          this.autoBoxShineEndHandler = null;
        }
        this.autoAdjustButton.classList.remove("is-auto-box-shine");
        this.autoAdjustButton.classList.remove("is-promptly-strong");
        this.autoAdjustButton.classList.add("is-working");
        const lowered = String(stageText || "").toLowerCase();
        if (lowered.includes("updating") || lowered.includes("rewriting")) {
          this.autoAdjustButton.dataset.stage = "rewriting";
        } else if (lowered.includes("analyzing")) {
          this.autoAdjustButton.dataset.stage = "analyzing";
        } else {
          this.autoAdjustButton.dataset.stage = "improve";
        }
        this.autoAdjustErrorText.textContent = "";
        return;
      }
      this.autoAdjustButton.classList.remove("is-working");

      const keepImprovedState = String(stageText || "").toLowerCase().includes("already improved");
      const applyImproveDoneMutedUi = () => {
        this.autoAdjustButton.dataset.stage = "improved-muted";
        this.autoAdjustButton.disabled = true;
        this.autoAdjustButton.classList.add("is-promptly-strong");
      };
      const applyImproveIdleUi = () => {
        this.autoAdjustButton.dataset.stage = "idle";
        this.autoAdjustButton.disabled = false;
        this.autoAdjustButton.classList.remove("is-promptly-strong");
      };
      if (isError && stageText) {
        if (keepImprovedState) {
          applyImproveDoneMutedUi();
        } else {
          applyImproveIdleUi();
        }
        const errFull = String(stageText)
          .replace(/^failed:\s*/i, "")
          .trim();
        const IMPROVE_INLINE_ERROR_MAX = 16;
        if (errFull.length > IMPROVE_INLINE_ERROR_MAX) {
          this.appendPromptlyErrorToRewriteField(errFull);
          this.autoAdjustErrorText.textContent = "See text box ↓";
        } else {
          this.autoAdjustErrorText.textContent = errFull;
        }
        this.autoAdjustButton.classList.add("has-inline-error");
        this.autoErrorResetTimer = window.setTimeout(() => {
          this.autoAdjustButton.classList.remove("has-inline-error");
          this.autoAdjustErrorText.textContent = "";
          if (!keepImprovedState) {
            applyImproveIdleUi();
          }
          this.autoErrorResetTimer = null;
        }, 2200);
      } else {
        this.autoAdjustErrorText.textContent = "";
        applyImproveDoneMutedUi();
      }
    }

    setContent(model) {
      const wordCount = Math.max(0, Math.floor(Number(model.wordCount) || 0));
      this.lastRenderedWordCount = wordCount;
      this.wordCountValue.textContent = wordCount > 99999 ? "MAX." : String(wordCount);
      this.autoAdjustSuffix = model.autoAdjustSuffix || "";
      this.composePromptWritten = !!model.composePromptWritten;
      if (this.composeAwaitingPromptWrite && this.composePromptWritten) {
        const pre = Number(this.composeAwaitingPreWriteWordCount);
        const hasObservedWrite =
          Number.isFinite(pre) ? wordCount !== pre : wordCount > 0;
        if (hasObservedWrite) {
          const changedDuringWrite = this.composeLastObservedWriteWordCount !== wordCount;
          this.composeLastObservedWriteWordCount = wordCount;
          if (this.composeAwaitingFinalizeTimer) {
            window.clearTimeout(this.composeAwaitingFinalizeTimer);
            this.composeAwaitingFinalizeTimer = null;
          }
          // Keep shine active while host UI is still writing; finalize after write settles briefly.
          this.composeAwaitingFinalizeTimer = window.setTimeout(() => {
            this.composeAwaitingFinalizeTimer = null;
            if (!this.composeAwaitingPromptWrite || !this.composePromptWritten) {
              return;
            }
            this.logComposeDebug("setContent-confirmed-write", {
              preWordCount: Number.isFinite(pre) ? pre : null,
              currentWordCount: this.composeLastObservedWriteWordCount
            });
            this.finalizeComposeThinkingUi();
          }, 900);
          if (changedDuringWrite) {
            this.logComposeDebug("setContent-write-progress", {
              preWordCount: Number.isFinite(pre) ? pre : null,
              currentWordCount: wordCount
            }, 200);
          }
        }
      }
      if (!this.composePromptWritten) {
        this.scratchClearOnNextEdit = false;
        this.awaitingOneTimeScratchClear = false;
        this.composeFieldBaseline = null;
        this.composeFieldDirty = false;
      }
      this.root.classList.toggle("promptly-hide-improve-section", !!model.hideImprovePromptSection);
      if (!this.rewriteSendButton.classList.contains("is-working")) {
        const hasText = String(this.rewriteInstructionInput?.value || "").trim().length > 0;
        if (this.composeUseIdleLabel) {
          this.rewriteSendButton.dataset.stage = "idle";
        } else {
          this.rewriteSendButton.dataset.stage =
            this.composePromptWritten && hasText ? "further" : this.composePromptWritten ? "written" : "idle";
        }
      }
      if (
        !this.autoAdjustButton.classList.contains("is-working") &&
        !this.autoAdjustButton.classList.contains("has-inline-error")
      ) {
        if (model.improveMutedByCompose) {
          this.autoAdjustButton.dataset.stage = "strong";
          this.autoAdjustButton.disabled = true;
          this.autoAdjustButton.classList.add("is-promptly-strong");
        } else if (model.hasPromptlyRewrite) {
          this.autoAdjustButton.dataset.stage = "improved-muted";
          this.autoAdjustButton.disabled = true;
          this.autoAdjustButton.classList.add("is-promptly-strong");
        } else {
          this.autoAdjustButton.classList.remove("is-promptly-strong");
          this.autoAdjustButton.disabled = false;
          this.autoAdjustButton.dataset.stage = "idle";
        }
      }
      this.suggestions.innerHTML = "";
      const targetRaw = Math.max(0, Math.min(100, Number(model.strengthPercent) || 0));
      const target = Math.round(targetRaw);
      const ai = !!model.strengthAiEnhanced;
      let strength = target;
      if (ai) {
        this.strengthDisplay = target;
      } else if (this.lastStrengthAiEnhanced === true) {
        this.strengthDisplay = target;
      } else if (this.strengthDisplay == null) {
        this.strengthDisplay = target;
      } else {
        const cur = this.strengthDisplay;
        const d = target - cur;
        const up = d > 0 ? d : 0;
        const down = d < 0 ? d : 0;
        this.strengthDisplay = cur + up * 0.44 + down * 0.13;
      }
      strength = Math.round(Math.max(0, Math.min(100, this.strengthDisplay)));
      this.lastStrengthAiEnhanced = ai;
      this.strengthFill.style.width = `${strength}%`;
      this.strengthFill.dataset.level = strength < 30 ? "low" : strength < 60 ? "mid" : "high";
      if (this.strengthTrack) {
        this.strengthTrack.dataset.aiEnhanced = model.strengthAiEnhanced ? "true" : "false";
      }
      this.updateInputLineMode();
      this.applyFitScale();
    }

    getHeight() {
      return 150 + (this.visibleLineCount - 1) * 14;
    }

    fitToBounds(width, height) {
      this.lastBounds = {
        width: Math.max(1, Number(width) || 1),
        height: Math.max(1, Number(height) || 1)
      };
      this.applyFitScale();
    }

    applyFitScale() {
      // Do not shrink internal UI; allow popup height to grow instead.
      this.fitLayer.style.transform = "scale(1)";
    }
  }

  window.PromptlyPopup = PromptlyPopup;
})();
