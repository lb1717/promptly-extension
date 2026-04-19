(() => {
  function nearestSliderLevel(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return 0;
    }
    return Math.max(0, Math.min(2, Math.round(n)));
  }

  function setTickHighlight(ticksRoot, level) {
    if (!(ticksRoot instanceof Element)) {
      return;
    }
    ticksRoot.querySelectorAll("span[data-level]").forEach((node) => {
      const isActive = String(node.getAttribute("data-level") || "") === String(level);
      node.classList.toggle("is-active", isActive);
    });
  }

  function setSliderProgressFill(sliderEl) {
    if (!(sliderEl instanceof HTMLInputElement)) {
      return;
    }
    const min = Number(sliderEl.min || 0);
    const max = Number(sliderEl.max || 100);
    const value = Number(sliderEl.value || min);
    const range = Math.max(1e-6, max - min);
    const pct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
    sliderEl.style.setProperty("--promptly-slider-fill-pct", `${pct}%`);
  }

  function wireSnapToNearestTick(sliderEl, options = {}) {
    if (!(sliderEl instanceof HTMLInputElement)) {
      return;
    }
    const ticksRootSelector = sliderEl.classList.contains("promptly-settings-quality")
      ? ".promptly-settings-quality-ticks"
      : sliderEl.classList.contains("promptly-settings-speed")
        ? ".promptly-settings-speed-ticks"
        : "";
    const ticksRoot = ticksRootSelector
      ? sliderEl.closest(".promptly-settings-slider-card")?.querySelector(ticksRootSelector)
      : null;
    const apply = (snapToNearest, userInitiated = false) => {
      const level = nearestSliderLevel(sliderEl.value);
      if (snapToNearest) {
        sliderEl.value = String(level);
      }
      setTickHighlight(ticksRoot, level);
      setSliderProgressFill(sliderEl);
      if (snapToNearest && typeof options.onRelease === "function") {
        options.onRelease(level, sliderEl, userInitiated);
      }
    };
    sliderEl.addEventListener("input", () => apply(false, true));
    sliderEl.addEventListener("pointerup", () => apply(true, true));
    sliderEl.addEventListener("touchend", () => apply(true, true), { passive: true });
    sliderEl.addEventListener("change", () => apply(true, true));
    apply(true, false);
  }

  function createWhiteTransparentIconDataUrl(sourceUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width || 32;
          canvas.height = img.naturalHeight || img.height || 32;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            reject(new Error("2D canvas unavailable"));
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const pixels = imageData.data;
          for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const a = pixels[i + 3];
            // Convert luminance to alpha: white gear stays visible, black background becomes transparent.
            const lum = Math.round((r + g + b) / 3);
            const nextAlpha = Math.round((lum / 255) * a);
            pixels[i] = 255;
            pixels[i + 1] = 255;
            pixels[i + 2] = 255;
            pixels[i + 3] = nextAlpha;
          }
          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error("Failed to load settings icon image"));
      img.src = sourceUrl;
    });
  }

  class PromptlyTabUI {
    constructor({
      onToggle,
      onSuggestionClick,
      onAutoAdjust,
      onLayoutChange,
      onToggleAutoSend,
      onSignIn,
      onLoadSettingsAccount,
      onManageAccount,
      onVisualStyleChange,
      onVisualColorChange,
      onDragStart,
      onDragMove,
      onDragEnd
    }) {
      this.onToggle = onToggle;
      this.onSuggestionClick = onSuggestionClick;
      this.onAutoAdjust = onAutoAdjust;
      this.onLayoutChange = onLayoutChange;
      this.onToggleAutoSend = onToggleAutoSend;
      this.onSignIn = onSignIn;
      this.onLoadSettingsAccount = onLoadSettingsAccount;
      this.onManageAccount = onManageAccount;
      this.onVisualStyleChange = onVisualStyleChange;
      this.onVisualColorChange = onVisualColorChange;
      this.onDragStart = onDragStart;
      this.onDragMove = onDragMove;
      this.onDragEnd = onDragEnd;
      this.isOpen = false;
      this.isVisible = false;
      this.dragState = null;
      this.suppressNextClick = false;
      this.tabStatusResetTimer = null;
      this.tabStatusPrepTimer = null;
      this.repositionHintTimer = null;
      this.repositionHintSeenStorageKey = "promptly_reposition_hint_seen_v1";
      this.settingsPlanTier = "free";
      this.settingsSliderUpgradeTimers = {};

      this.host = document.createElement("div");
      this.host.dataset.promptlyRoot = "true";
      this.host.style.position = "fixed";
      this.host.style.left = "0";
      this.host.style.top = "0";
      this.host.style.zIndex = "2147483000";
      this.host.style.pointerEvents = "none";
      this.host.style.display = "none";

      this.shadowRoot = this.host.attachShadow({ mode: "open" });
      const styleLink = document.createElement("link");
      styleLink.rel = "stylesheet";
      styleLink.href = chrome.runtime.getURL("content/ui/styles.css");

      this.root = document.createElement("div");
      this.root.className = "promptly-root";
      this.root.dataset.theme = "light";

      // Use a non-button container to avoid nested interactive elements inside a <button>,
      // which can cause click/gesture events (like Sign in) to be dropped in some browsers.
      this.tabButton = document.createElement("div");
      this.tabButton.className = "promptly-tab";
      this.tabButton.setAttribute("role", "button");
      this.tabButton.setAttribute("tabindex", "0");
      this.tabButton.setAttribute("aria-label", "Toggle Promptly");
      this.tabButton.innerHTML =
        "<span class='promptly-tab-text-window'><span class='promptly-tab-text-track'>" +
        "<span class='promptly-tab-text-line'>Promptly</span>" +
        "<span class='promptly-tab-text-line'>Rewriting</span>" +
        "<span class='promptly-tab-text-line'>Improved</span>" +
        "<span class='promptly-tab-text-line'>Prompt Already Strong ✓</span>" +
        "<span class='promptly-tab-text-line'>Promptly</span>" +
        "</span></span>" +
        "<span class='promptly-tab-logo-minimal'><img class='promptly-tab-logo-minimal-icon' alt='Promptly logo' /></span>" +
        "<span class='promptly-tab-controls'>" +
        "<span class='promptly-tab-signin' role='button' tabindex='0' aria-label='Sign in to Promptly'>Sign in</span>" +
        "<span class='promptly-tab-auto-label'>Auto</span>" +
        "<span class='promptly-tab-auto-switch' role='switch' aria-checked='false' title='Auto-adjust on send'>A</span>" +
        "<span class='promptly-tab-credit-wrap'><span class='promptly-tab-credit-meter' aria-hidden='true'></span><span class='promptly-tab-credit-tooltip' role='tooltip'>Loading API token usage…</span></span>" +
        "<span class='promptly-tab-settings' role='button' tabindex='0' aria-label='Open Promptly settings' title='Settings'>" +
        "<img class='promptly-tab-settings-icon' alt='' aria-hidden='true' />" +
        "</span>" +
        "</span>";
      this.autoSendSwitch = this.tabButton.querySelector(".promptly-tab-auto-switch");
      this.autoSendLabel = this.tabButton.querySelector(".promptly-tab-auto-label");
      this.signInButton = this.tabButton.querySelector(".promptly-tab-signin");
      this.minimalLogoIcon = this.tabButton.querySelector(".promptly-tab-logo-minimal-icon");
      if (this.minimalLogoIcon) {
        this.minimalLogoIcon.setAttribute("draggable", "false");
        this.minimalLogoIcon.draggable = false;
        this.minimalLogoIcon.addEventListener("dragstart", (event) => {
          event.preventDefault();
        });
        const rawLogoUrl = chrome.runtime.getURL("content/ui/images/Promptly Logo White.png");
        const encodedLogoUrl = rawLogoUrl.replace(/ /g, "%20");
        this.minimalLogoIcon.src = encodedLogoUrl;
        this.minimalLogoIcon.onerror = () => {
          // Some Chromium builds are finicky with spaces in extension asset paths.
          this.minimalLogoIcon.src = chrome.runtime.getURL("content/ui/images/download-1.png");
        };
      }
      this.settingsButton = this.tabButton.querySelector(".promptly-tab-settings");
      // Force-replace any stale icon node (old SVG/image) from prior versions.
      if (this.settingsButton) {
        this.settingsButton.querySelectorAll("svg, img").forEach((node) => node.remove());
        this.settingsIcon = document.createElement("img");
        this.settingsIcon.className = "promptly-tab-settings-icon";
        this.settingsIcon.alt = "";
        this.settingsIcon.setAttribute("aria-hidden", "true");
        this.settingsButton.append(this.settingsIcon);
        const sourceUrl = `${chrome.runtime.getURL("content/ui/images/gear.png")}?v=1`;
        this.settingsIconSourceUrl = sourceUrl;
        this.settingsIcon.src = sourceUrl;
        createWhiteTransparentIconDataUrl(sourceUrl)
          .then((dataUrl) => {
            if (this.settingsIcon && this.settingsIcon.isConnected) {
              this.settingsIcon.src = dataUrl;
            }
          })
          .catch(() => {
            // Fallback keeps the raw file if processing fails.
          });
      }
      this.creditUsageMeter = this.tabButton.querySelector(".promptly-tab-credit-meter");
      this.creditUsageTooltip = this.tabButton.querySelector(".promptly-tab-credit-tooltip");
      if (this.creditUsageMeter) {
        this.creditUsageMeter.style.setProperty("--promptly-credit-progress", "2%");
      }
      if (this.creditUsageTooltip) {
        this.creditUsageTooltip.innerHTML =
          "<span class='promptly-credit-line promptly-credit-line-strong'>—</span>" +
          "<span class='promptly-credit-line promptly-credit-line-muted'>— / — Tokens</span>";
      }
      const runToggleAutoSend = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof this.onToggleAutoSend === "function") {
          this.onToggleAutoSend();
        }
      };
      this.autoSendSwitch.addEventListener("click", runToggleAutoSend);
      if (this.autoSendLabel) {
        this.autoSendLabel.addEventListener("click", runToggleAutoSend);
      }
      const runSignInFlow = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showToast("Opening Google sign-in…", { tone: "info" });
        if (typeof this.onSignIn === "function") {
          Promise.resolve(this.onSignIn())
            .then(() => {
              this.setSettingsOpen(false);
            })
            .catch((error) => {
              this.showErrorToast(String(error?.message || error || "Sign-in failed"));
            });
        }
      };
      this.signInButton.addEventListener("click", runSignInFlow);
      this.signInButton.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        runSignInFlow(event);
      });
      const runToggleSettings = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.setSettingsOpen(!this.root.classList.contains("is-settings-open"));
      };
      this.settingsButton.addEventListener("click", runToggleSettings);
      this.settingsButton.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        runToggleSettings(event);
      });

      // Signed-out fallback: capture-phase click handler to ensure sign-in triggers even if
      // pointer capture / drag logic or nested targets swallow bubbling events.
      this.shadowRoot.addEventListener(
        "click",
        (event) => {
          if (!this.root.classList.contains("is-signed-out")) {
            return;
          }
          if (
            event.target instanceof Element &&
            (event.target.closest(".promptly-tab-auto-switch") ||
              event.target.closest(".promptly-tab-settings") ||
              event.target.closest(".promptly-settings-panel"))
          ) {
            return;
          }
          runSignInFlow(event);
        },
        true
      );
      this.tabButton.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        // Signed out: disable dragging entirely (clicks should trigger sign-in).
        if (this.root.classList.contains("is-signed-out")) {
          return;
        }
        // If the pointerdown originates from an interactive control inside the tab,
        // do not start a drag or capture the pointer (otherwise the click can be swallowed).
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        const hitControl = path.some(
          (node) =>
            node instanceof Element &&
            (node.closest(".promptly-tab-auto-switch") ||
              node.closest(".promptly-tab-signin") ||
              node.closest(".promptly-tab-settings"))
        );
        if (hitControl) {
          return;
        }
        this.dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          dragged: false
        };
        if (typeof this.onDragStart === "function") {
          this.onDragStart();
        }
        this.root.classList.add("is-dragging");
        this.tabButton.setPointerCapture(event.pointerId);
      });
      this.tabButton.addEventListener("pointermove", (event) => {
        if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
          return;
        }
        const deltaX = event.clientX - this.dragState.startX;
        if (Math.abs(deltaX) >= 2) {
          this.dragState.dragged = true;
        }
        if (typeof this.onDragMove === "function") {
          this.onDragMove(deltaX);
        }
      });
      this.tabButton.addEventListener("pointerup", (event) => {
        if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
          return;
        }
        if (this.tabButton.hasPointerCapture(event.pointerId)) {
          this.tabButton.releasePointerCapture(event.pointerId);
        }
        const didDrag = this.dragState.dragged;
        this.dragState = null;
        if (didDrag) {
          this.suppressNextClick = true;
          if (typeof this.onDragEnd === "function") {
            this.onDragEnd();
          }
        }
        this.root.classList.remove("is-dragging");
      });
      this.tabButton.addEventListener("pointercancel", (event) => {
        if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
          return;
        }
        this.dragState = null;
        this.root.classList.remove("is-dragging");
      });
      this.tabButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (
          event.target instanceof Element &&
          (event.target.closest(".promptly-tab-auto-switch") ||
            event.target.closest(".promptly-tab-signin") ||
            event.target.closest(".promptly-tab-settings"))
        ) {
          return;
        }
        if (this.root.classList.contains("is-signed-out")) {
          runSignInFlow(event);
          return;
        }
        if (this.suppressNextClick) {
          this.suppressNextClick = false;
          return;
        }
        this.onToggle();
      });
      this.tabButton.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (this.root.classList.contains("is-signed-out")) {
          runSignInFlow(event);
          return;
        }
        this.onToggle();
      });

      this.popup = new window.PromptlyPopup(
        this.shadowRoot,
        (text) => this.onSuggestionClick(text),
        (text) => {
          if (typeof this.onAutoAdjust === "function") {
            this.onAutoAdjust(text);
          }
        },
        () => {
          if (typeof this.onLayoutChange === "function") {
            this.onLayoutChange();
          }
        },
        () => {
          this.showRepositionHint({ force: true });
        }
      );
      this.popupMask = document.createElement("div");
      this.popupMask.className = "promptly-popup-mask";
      this.popupMask.append(this.popup.root);
      this.errorToast = document.createElement("div");
      this.errorToast.className = "promptly-tab-error-toast";
      this.errorToast.setAttribute("role", "status");
      this.errorToast.textContent = "";
      this.errorToastTimer = null;
      this.repositionHint = document.createElement("div");
      this.repositionHint.className = "promptly-tab-reposition-hint";
      this.repositionHint.setAttribute("role", "status");
      this.repositionHint.innerHTML =
        "<span class='promptly-tab-reposition-text'>Slide to reposition</span>" +
        "<span class='promptly-tab-reposition-arrow' aria-hidden='true'>←────→</span>";
      this.settingsPanel = document.createElement("aside");
      this.settingsPanel.className = "promptly-settings-panel";
      this.settingsPanel.setAttribute("aria-hidden", "true");
      this.settingsPanel.innerHTML =
        "<button type='button' class='promptly-settings-close' aria-label='Close settings'>×</button>" +
        "<div class='promptly-settings-header'>" +
        "<img class='promptly-settings-title-icon' alt='' aria-hidden='true' />" +
        "<div class='promptly-settings-title'>Settings</div>" +
        "<span class='promptly-settings-separator promptly-settings-header-separator' aria-hidden='true'>|</span>" +
        "<a class='promptly-settings-header-link' href='https://promptly-labs.com' target='_blank' rel='noopener noreferrer'>Promptly Labs</a>" +
        "</div>" +
        "<div class='promptly-settings-section promptly-settings-section-account'>" +
        "<div class='promptly-settings-label promptly-settings-heading'>Account</div>" +
        "<div class='promptly-settings-account-row'>" +
        "<div class='promptly-settings-email'>Not signed in</div>" +
        "<div class='promptly-settings-tier-badge' hidden>Free</div>" +
        "<button type='button' class='promptly-settings-account-btn'>Manage account / subscription</button>" +
        "</div>" +
        "</div>" +
        "<div class='promptly-settings-section promptly-settings-section-account-sliders'>" +
        "<div class='promptly-settings-sliders-wrap'>" +
        "<div class='promptly-settings-sliders'>" +
        "<div class='promptly-settings-slider-card'>" +
        "<div class='promptly-settings-label'>Model quality</div>" +
        "<div class='promptly-settings-slider-zone'>" +
        "<input class='promptly-settings-slider promptly-settings-quality' type='range' min='0' max='2' step='0.01' value='0' />" +
        "</div>" +
        "<div class='promptly-settings-ticks promptly-settings-quality-ticks'><span data-level='0'>Base</span><span data-level='1'>Premium</span><span data-level='2'>MAX</span></div>" +
        "</div>" +
        "<div class='promptly-settings-slider-card'>" +
        "<div class='promptly-settings-label'>Speed</div>" +
        "<div class='promptly-settings-slider-zone'>" +
        "<input class='promptly-settings-slider promptly-settings-speed' type='range' min='0' max='2' step='0.01' value='0' />" +
        "</div>" +
        "<div class='promptly-settings-ticks promptly-settings-speed-ticks'><span data-level='0'>Normal</span><span data-level='1'>Efficient</span><span data-level='2'>FAST</span></div>" +
        "</div>" +
        "</div>" +
        "<div class='promptly-settings-sliders-upgrade-prompt' hidden>" +
        "<button type='button' class='promptly-settings-slider-upgrade-btn' aria-label='Upgrade plan for premium sliders'>Upgrade plan</button>" +
        "</div>" +
        "</div>" +
        "</div>" +
        "<div class='promptly-settings-section promptly-settings-section-visuals'>" +
        "<div class='promptly-settings-label promptly-settings-heading'>Visuals</div>" +
        "<div class='promptly-settings-visuals-row'>" +
        "<span class='promptly-settings-inline-label'>Theme:</span>" +
        "<div class='promptly-settings-color-row'>" +
        "<button type='button' class='promptly-settings-color is-selected' data-color='black' aria-label='Black'><span>✓</span></button>" +
        "<button type='button' class='promptly-settings-color' data-color='purple' aria-label='Purple'><span>✓</span></button>" +
        "<button type='button' class='promptly-settings-color' data-color='dark-blue' aria-label='Dark blue'><span>✓</span></button>" +
        "<button type='button' class='promptly-settings-color' data-color='dark-green' aria-label='Dark green'><span>✓</span></button>" +
        "</div>" +
        "<span class='promptly-settings-separator' aria-hidden='true'>|</span>" +
        "<span class='promptly-settings-toggle-label promptly-settings-toggle-wide is-active'>Wide mode</span>" +
        "<button type='button' class='promptly-settings-toggle' role='switch' aria-checked='false' aria-label='Toggle thin mode'><span class='promptly-settings-toggle-knob'></span></button>" +
        "<span class='promptly-settings-toggle-label promptly-settings-toggle-thin'>Thin mode</span>" +
        "</div>";
      this.settingsEmailEl = this.settingsPanel.querySelector(".promptly-settings-email");
      this.settingsTierEl = this.settingsPanel.querySelector(".promptly-settings-tier-badge");
      this.settingsAccountBtn = this.settingsPanel.querySelector(".promptly-settings-account-btn");
      this.settingsCloseBtn = this.settingsPanel.querySelector(".promptly-settings-close");
      this.settingsTitleIcon = this.settingsPanel.querySelector(".promptly-settings-title-icon");
      this.settingsStyleToggle = this.settingsPanel.querySelector(".promptly-settings-toggle");
      this.settingsWideLabel = this.settingsPanel.querySelector(".promptly-settings-toggle-wide");
      this.settingsThinLabel = this.settingsPanel.querySelector(".promptly-settings-toggle-thin");
      this.settingsQualitySlider = this.settingsPanel.querySelector(".promptly-settings-quality");
      this.settingsSpeedSlider = this.settingsPanel.querySelector(".promptly-settings-speed");
      this.settingsSliderCards = Array.from(
        this.settingsPanel.querySelectorAll(".promptly-settings-slider-card")
      );
      this.settingsSlidersUpgradePrompt = this.settingsPanel.querySelector(
        ".promptly-settings-sliders-upgrade-prompt"
      );
      this.settingsSliderUpgradeButton = this.settingsPanel.querySelector(
        ".promptly-settings-slider-upgrade-btn"
      );
      this.settingsColorButtons = Array.from(this.settingsPanel.querySelectorAll(".promptly-settings-color"));
      wireSnapToNearestTick(this.settingsQualitySlider, {
        onRelease: (level, sliderEl) => this.handleSettingsSliderRelease("quality", level, sliderEl)
      });
      wireSnapToNearestTick(this.settingsSpeedSlider, {
        onRelease: (level, sliderEl) => this.handleSettingsSliderRelease("speed", level, sliderEl)
      });
      if (this.settingsQualitySlider) {
        this.settingsQualitySlider.addEventListener("change", () => {
          this.enforceFreeSliderLevel("quality", this.settingsQualitySlider);
        });
      }
      if (this.settingsSpeedSlider) {
        this.settingsSpeedSlider.addEventListener("change", () => {
          this.enforceFreeSliderLevel("speed", this.settingsSpeedSlider);
        });
      }
      if (this.settingsTitleIcon) {
        const sourceUrl = this.settingsIconSourceUrl || `${chrome.runtime.getURL("content/ui/images/gear.png")}?v=1`;
        this.settingsTitleIcon.src = sourceUrl;
        createWhiteTransparentIconDataUrl(sourceUrl)
          .then((dataUrl) => {
            if (this.settingsTitleIcon && this.settingsTitleIcon.isConnected) {
              this.settingsTitleIcon.src = dataUrl;
            }
          })
          .catch(() => {
            // Keep raw icon as fallback.
          });
      }
      this.settingsCloseBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.setSettingsOpen(false);
      });
      this.settingsAccountBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof this.onManageAccount === "function") {
          this.onManageAccount();
        }
      });
      this.settingsStyleToggle.addEventListener("click", () => {
        const isThin = this.root.dataset.visualStyle === "minimalistic";
        const next = isThin ? "default" : "minimalistic";
        this.setVisualStyle(next);
        if (typeof this.onVisualStyleChange === "function") {
          this.onVisualStyleChange(next);
        }
      });
      this.settingsColorButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const nextColor = String(button.dataset.color || "black");
          this.setVisualColor(nextColor);
          if (typeof this.onVisualColorChange === "function") {
            this.onVisualColorChange(nextColor);
          }
        });
      });
      if (this.settingsSliderUpgradeButton) {
        this.settingsSliderUpgradeButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.hideSettingsSliderUpgradePrompts();
          if (typeof this.onManageAccount === "function") {
            this.onManageAccount();
            return;
          }
          this.showToast("Upgrade plan", { tone: "info", durationMs: 2200 });
        });
      }
      this.settingsPanel.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      // Attach toast to the tab itself so it follows the tab's translate3d placement.
      this.tabButton.append(this.errorToast, this.repositionHint);
      this.root.append(this.popupMask, this.tabButton, this.settingsPanel);
      this.setTabStatus("idle");
      this.shadowRoot.append(styleLink, this.root);
      (document.body || document.documentElement).appendChild(this.host);
    }

    destroy() {
      if (this.tabStatusResetTimer) {
        window.clearTimeout(this.tabStatusResetTimer);
      }
      if (this.tabStatusPrepTimer) {
        window.clearTimeout(this.tabStatusPrepTimer);
      }
      if (this.errorToastTimer) {
        window.clearTimeout(this.errorToastTimer);
        this.errorToastTimer = null;
      }
      if (this.repositionHintTimer) {
        window.clearTimeout(this.repositionHintTimer);
        this.repositionHintTimer = null;
      }
      Object.keys(this.settingsSliderUpgradeTimers || {}).forEach((key) => {
        const timer = this.settingsSliderUpgradeTimers[key];
        if (timer) {
          window.clearTimeout(timer);
        }
      });
      this.host.remove();
    }

    containsNode(node) {
      return this.host === node || this.host.contains(node);
    }

    setVisible(visible) {
      if (visible === this.isVisible) {
        return;
      }
      this.isVisible = visible;
      if (visible) {
        this.host.style.display = "block";
        this.host.style.pointerEvents = "auto";
        window.requestAnimationFrame(() => {
          if (this.isVisible) {
            this.root.classList.add("is-host-visible");
          }
        });
        return;
      }
      this.root.classList.remove("is-host-visible");
      this.host.style.display = "none";
      this.host.style.pointerEvents = "none";
    }

    setOpen(isOpen) {
      this.isOpen = isOpen;
      this.root.classList.toggle("is-open", isOpen);
      this.root.classList.toggle(
        "is-minimal-expanded",
        isOpen && this.root.dataset.visualStyle === "minimalistic"
      );
      this.popupMask.classList.toggle("is-open", isOpen);
      this.popup.setOpen(isOpen);
    }

    setTheme(theme) {
      this.root.dataset.theme = theme;
    }

    setDirection(direction) {
      this.popup.setDirection(direction);
    }

    setContent(model) {
      this.popup.setContent(model);
    }

    setAutoAdjustLoading(isLoading, stageText = "", isError = false, mode = "improve") {
      this.popup.setAutoAdjustLoading(isLoading, stageText, isError, mode);
    }

    playAutoButtonBoxShineOnce() {
      this.popup.playAutoButtonBoxShineOnce();
    }

    setAutoSendEnabled(isEnabled) {
      this.autoSendSwitch.dataset.enabled = isEnabled ? "true" : "false";
      this.autoSendSwitch.setAttribute("aria-checked", isEnabled ? "true" : "false");
    }

    setSignedOut(isSignedOut) {
      this.root.classList.toggle("is-signed-out", !!isSignedOut);
    }

    async setSettingsOpen(isOpen) {
      this.root.classList.toggle("is-settings-open", !!isOpen);
      this.settingsPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
      this.settingsButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
      if (!isOpen) {
        return;
      }
      if (typeof this.onLoadSettingsAccount !== "function") {
        return;
      }
      try {
        const data = await this.onLoadSettingsAccount();
        const email = String(data?.email || "").trim();
        this.setSettingsAccountEmail(email || "Not signed in");
        this.setSettingsTierBadge(String(data?.subscriptionTier || "").trim());
      } catch (_error) {
        this.setSettingsAccountEmail("Not signed in");
        this.setSettingsTierBadge("free");
      }
    }

    setSettingsAccountEmail(email) {
      if (!this.settingsEmailEl) {
        return;
      }
      const safe = String(email || "").trim();
      this.settingsEmailEl.textContent = safe || "Not signed in";
    }

    setSettingsTierBadge(tier) {
      if (!this.settingsTierEl) {
        return;
      }
      const t = String(tier || "").trim().toLowerCase();
      if (!t) {
        // Treat missing/empty tier as Free so slider upsell gating always applies for non-Pro users.
        this.settingsTierEl.textContent = "Free";
        this.settingsTierEl.hidden = false;
        this.settingsPlanTier = "free";
        this.hideSettingsSliderUpgradePrompts();
        return;
      }
      const isPro = t === "pro" || t === "plus" || t === "professional";
      const label = isPro ? "Pro" : "Free";
      this.settingsTierEl.textContent = label;
      this.settingsTierEl.hidden = false;
      this.settingsPlanTier = isPro ? "pro" : "free";
      this.hideSettingsSliderUpgradePrompts();
    }

    hideSettingsSliderUpgradePrompts() {
      if (this.settingsSlidersUpgradePrompt) {
        this.settingsSlidersUpgradePrompt.hidden = true;
      }
    }

    showSettingsSliderUpgradePrompt(kind) {
      if (!(this.settingsSlidersUpgradePrompt instanceof HTMLElement)) {
        return;
      }
      this.hideSettingsSliderUpgradePrompts();
      this.settingsSlidersUpgradePrompt.hidden = false;
      const normalized = kind === "speed" ? "speed" : "quality";
      const prevTimer = this.settingsSliderUpgradeTimers[normalized];
      if (prevTimer) {
        window.clearTimeout(prevTimer);
      }
      this.settingsSliderUpgradeTimers[normalized] = window.setTimeout(() => {
        this.hideSettingsSliderUpgradePrompts();
        this.settingsSliderUpgradeTimers[normalized] = null;
      }, 2600);
    }

    enforceFreeSliderLevel(kind, sliderEl) {
      if (!(sliderEl instanceof HTMLInputElement)) {
        return;
      }
      if (this.settingsPlanTier !== "free") {
        return;
      }
      const level = nearestSliderLevel(sliderEl.value);
      if (level <= 0) {
        return;
      }
      sliderEl.value = "0";
      sliderEl.dispatchEvent(new Event("input", { bubbles: true }));
      sliderEl.dispatchEvent(new Event("change", { bubbles: true }));
      this.showSettingsSliderUpgradePrompt(kind);
    }

    handleSettingsSliderRelease(kind, level, sliderEl, userInitiated = false) {
      if (this.settingsPlanTier !== "free") {
        return;
      }
      if (!(sliderEl instanceof HTMLInputElement)) {
        return;
      }
      if (Number(level) <= 0) {
        return;
      }
      this.enforceFreeSliderLevel(kind, sliderEl);
    }

    setVisualStyle(style) {
      const next =
        style === "midnight" ? "midnight" : style === "minimalistic" ? "minimalistic" : "default";
      this.root.dataset.visualStyle = next;
      if (next !== "minimalistic") {
        this.root.classList.remove("is-minimal-expanded");
      } else if (this.isOpen) {
        this.root.classList.add("is-minimal-expanded");
      }
      if (this.settingsStyleToggle) {
        const thin = next === "minimalistic";
        this.settingsStyleToggle.setAttribute("aria-checked", thin ? "true" : "false");
        this.settingsStyleToggle.classList.toggle("is-thin", thin);
      }
      if (this.settingsWideLabel && this.settingsThinLabel) {
        const thin = next === "minimalistic";
        this.settingsWideLabel.classList.toggle("is-active", !thin);
        this.settingsThinLabel.classList.toggle("is-active", thin);
      }
    }

    setVisualColor(color) {
      const valid = ["black", "purple", "dark-blue", "dark-green"];
      const next = valid.includes(color) ? color : "black";
      this.root.dataset.visualColor = next;
      if (this.settingsColorButtons?.length) {
        this.settingsColorButtons.forEach((button) => {
          const selected = String(button.dataset.color || "") === next;
          button.classList.toggle("is-selected", selected);
        });
      }
    }

    showToast(message, options = {}) {
      const msg = String(message || "").trim();
      if (!msg || !this.errorToast) {
        return;
      }
      const tone = String(options?.tone || "error").trim().toLowerCase();
      const durationMs = Math.max(1200, Number(options?.durationMs) || 7000);
      if (this.errorToastTimer) {
        window.clearTimeout(this.errorToastTimer);
        this.errorToastTimer = null;
      }
      this.errorToast.dataset.tone = tone === "success" || tone === "info" ? tone : "error";
      this.errorToast.textContent = msg;
      this.errorToast.classList.add("is-visible");
      // Force visibility even if some page CSS ends up interfering.
      this.errorToast.style.opacity = "1";
      this.errorToast.style.transform = "translate3d(0, -110%, 0)";
      this.errorToastTimer = window.setTimeout(() => {
        this.errorToast.classList.remove("is-visible");
        this.errorToast.dataset.tone = "";
        this.errorToast.style.opacity = "";
        this.errorToast.style.transform = "";
        this.errorToastTimer = null;
      }, durationMs);
    }

    showErrorToast(message) {
      this.showToast(message, { tone: "error" });
    }

    showRepositionHint(options = {}) {
      if (!this.repositionHint) {
        return;
      }
      const force = !!options?.force;
      if (!force) {
        try {
          const seen = String(window.localStorage.getItem(this.repositionHintSeenStorageKey) || "");
          if (seen === "1") {
            return;
          }
          window.localStorage.setItem(this.repositionHintSeenStorageKey, "1");
        } catch (_error) {
          // Ignore storage errors; still show once for this session.
        }
      }
      if (this.repositionHintTimer) {
        window.clearTimeout(this.repositionHintTimer);
        this.repositionHintTimer = null;
      }
      this.repositionHint.classList.remove("is-replay");
      // Force reflow so the arrow animation can replay.
      void this.repositionHint.offsetWidth;
      this.repositionHint.classList.add("is-visible", "is-replay");
      this.repositionHintTimer = window.setTimeout(() => {
        this.repositionHint.classList.remove("is-visible", "is-replay");
        this.repositionHintTimer = null;
      }, 3600);
    }

    setCreditUsage(credits) {
      if (!credits || !this.creditUsageMeter || !this.creditUsageTooltip) {
        return;
      }
      const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("en-US");
      const max = Math.max(1, Number(credits.max || 1));
      const used = Math.min(max, Math.max(0, Number(credits.used || 0)));
      const usedPercent = Math.max(0, Math.min(100, Math.round((used / max) * 100)));
      const displayPercent = Math.max(2, usedPercent);
      this.creditUsageMeter.style.setProperty("--promptly-credit-progress", `${displayPercent}%`);
      const maxStr = fmt(max);
      this.creditUsageTooltip.innerHTML =
        `<span class="promptly-credit-line promptly-credit-line-strong">${usedPercent}% of Daily Limit used</span>` +
        `<span class="promptly-credit-line promptly-credit-line-muted">${fmt(used)} / ${maxStr} Tokens</span>`;
    }

    setTabStatus(status) {
      if (this.tabStatusResetTimer) {
        window.clearTimeout(this.tabStatusResetTimer);
        this.tabStatusResetTimer = null;
      }
      if (this.tabStatusPrepTimer) {
        window.clearTimeout(this.tabStatusPrepTimer);
        this.tabStatusPrepTimer = null;
      }
      this.root.classList.remove("is-tab-rewriting");
      if (status === "rewriting") {
        this.root.dataset.tabStatus = "rewriting";
        this.root.classList.add("is-tab-rewriting");
        return;
      }
      if (status === "improved") {
        this.root.dataset.tabStatus = "improved";
        this.tabStatusResetTimer = window.setTimeout(() => {
          this.root.dataset.tabStatus = "idle-final";
          this.tabStatusPrepTimer = window.setTimeout(() => {
            this.root.classList.add("is-tab-text-reset");
            this.root.dataset.tabStatus = "idle";
            window.requestAnimationFrame(() => {
              this.root.classList.remove("is-tab-text-reset");
            });
            this.tabStatusPrepTimer = null;
          }, 430);
          this.tabStatusResetTimer = null;
        }, 2000);
        return;
      }
      if (status === "strong") {
        this.root.dataset.tabStatus = "strong";
        this.tabStatusResetTimer = window.setTimeout(() => {
          this.root.dataset.tabStatus = "idle-final";
          this.tabStatusPrepTimer = window.setTimeout(() => {
            this.root.classList.add("is-tab-text-reset");
            this.root.dataset.tabStatus = "idle";
            window.requestAnimationFrame(() => {
              this.root.classList.remove("is-tab-text-reset");
            });
            this.tabStatusPrepTimer = null;
          }, 430);
          this.tabStatusResetTimer = null;
        }, 2000);
        return;
      }
      this.root.dataset.tabStatus = "idle";
    }

    getPopupHeight() {
      return this.popup.getHeight();
    }

    applyPlacement(placement) {
      const fixedPopupHeight = Math.max(1, Math.round(placement.popupHeight || 140));
      const hardManualYOffset = 0;
      const tabY = (placement.tabY || 0) + hardManualYOffset;
      const popupY = (placement.popupY || 0) + hardManualYOffset;
      this.root.style.setProperty("--promptly-tab-width", `${Math.round(placement.tabWidth || 220)}px`);
      this.root.style.setProperty("--promptly-popup-width", `${Math.round(placement.popupWidth || 330)}px`);
      this.tabButton.style.transform = `translate3d(${placement.tabX}px, ${tabY}px, 0)`;
      this.popupMask.style.transform = `translate3d(${placement.popupX}px, ${popupY}px, 0)`;
      this.popupMask.style.width = `${Math.round(placement.popupWidth || 330)}px`;
      this.popupMask.style.height = `${fixedPopupHeight}px`;
      this.popup.fitToBounds(
        Math.round(placement.popupWidth || 330),
        fixedPopupHeight
      );
    }
  }

  window.PromptlyTabUI = PromptlyTabUI;
})();
