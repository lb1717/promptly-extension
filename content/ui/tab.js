(() => {
  class PromptlyTabUI {
    constructor({
      onToggle,
      onSuggestionClick,
      onAutoAdjust,
      onLayoutChange,
      onToggleAutoSend,
      onSignIn,
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
      this.onDragStart = onDragStart;
      this.onDragMove = onDragMove;
      this.onDragEnd = onDragEnd;
      this.isOpen = false;
      this.isVisible = false;
      this.dragState = null;
      this.suppressNextClick = false;
      this.tabStatusResetTimer = null;
      this.tabStatusPrepTimer = null;

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

      this.tabButton = document.createElement("button");
      this.tabButton.type = "button";
      this.tabButton.className = "promptly-tab";
      this.tabButton.setAttribute("aria-label", "Toggle Promptly");
      this.tabButton.innerHTML =
        "<span class='promptly-tab-text-window'><span class='promptly-tab-text-track'>" +
        "<span class='promptly-tab-text-line'>Promptly</span>" +
        "<span class='promptly-tab-text-line'>Rewriting Prompt</span>" +
        "<span class='promptly-tab-text-line'>Prompt Improved</span>" +
        "<span class='promptly-tab-text-line'>Prompt Already Strong ✓</span>" +
        "<span class='promptly-tab-text-line'>Promptly</span>" +
        "</span></span><span class='promptly-tab-controls'>" +
        "<button class='promptly-tab-signin' type='button' aria-label='Sign in to Promptly'>Sign in</button>" +
        "<span class='promptly-tab-auto-label'>Auto</span>" +
        "<span class='promptly-tab-auto-switch' role='switch' aria-checked='false' title='Auto-adjust on send'>A</span>" +
        "<span class='promptly-tab-credit-wrap'><span class='promptly-tab-credit-meter' aria-hidden='true'></span><span class='promptly-tab-credit-tooltip' role='tooltip'>Loading API token usage…</span></span>" +
        "</span>";
      this.autoSendSwitch = this.tabButton.querySelector(".promptly-tab-auto-switch");
      this.signInButton = this.tabButton.querySelector(".promptly-tab-signin");
      this.creditUsageMeter = this.tabButton.querySelector(".promptly-tab-credit-meter");
      this.creditUsageTooltip = this.tabButton.querySelector(".promptly-tab-credit-tooltip");
      if (this.creditUsageMeter) {
        this.creditUsageMeter.style.setProperty("--promptly-credit-progress", "0%");
      }
      if (this.creditUsageTooltip) {
        this.creditUsageTooltip.innerHTML =
          "<span class='promptly-credit-line promptly-credit-line-strong'>—</span>" +
          "<span class='promptly-credit-line promptly-credit-line-muted'>— / — Tokens</span>";
      }
      this.autoSendSwitch.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof this.onToggleAutoSend === "function") {
          this.onToggleAutoSend();
        }
      });
      this.signInButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof this.onSignIn === "function") {
          this.onSignIn();
        }
      });
      this.tabButton.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        if (
          event.target instanceof Element &&
          (event.target.closest(".promptly-tab-auto-switch") || event.target.closest(".promptly-tab-signin"))
        ) {
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
        if (this.root.classList.contains("is-signed-out")) {
          return;
        }
        if (this.suppressNextClick) {
          this.suppressNextClick = false;
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

      this.root.append(this.errorToast, this.popupMask, this.tabButton);
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
        window.requestAnimationFrame(() => {
          if (this.isVisible) {
            this.root.classList.add("is-host-visible");
          }
        });
        return;
      }
      this.root.classList.remove("is-host-visible");
      this.host.style.display = "none";
    }

    setOpen(isOpen) {
      this.isOpen = isOpen;
      this.root.classList.toggle("is-open", isOpen);
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

    showErrorToast(message) {
      const msg = String(message || "").trim();
      if (!msg || !this.errorToast) {
        return;
      }
      if (this.errorToastTimer) {
        window.clearTimeout(this.errorToastTimer);
        this.errorToastTimer = null;
      }
      this.errorToast.textContent = msg;
      this.errorToast.classList.add("is-visible");
      this.errorToastTimer = window.setTimeout(() => {
        this.errorToast.classList.remove("is-visible");
        this.errorToastTimer = null;
      }, 7000);
    }

    setCreditUsage(credits) {
      if (!credits || !this.creditUsageMeter || !this.creditUsageTooltip) {
        return;
      }
      const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("en-US");
      const used = Math.max(0, Number(credits.used || 0));
      const max = Math.max(1, Number(credits.max || 1));
      const usedPercent = Math.max(0, Math.min(100, Math.round((used / max) * 100)));
      this.creditUsageMeter.style.setProperty("--promptly-credit-progress", `${usedPercent}%`);
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
