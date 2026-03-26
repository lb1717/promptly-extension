(() => {
  class PromptlyObservers {
    constructor({
      onUpdate,
      onTargetEvent,
      enableContinuousPositionTracking = true,
      getAnchorElement = null
    }) {
      this.onUpdate = onUpdate;
      this.onTargetEvent = onTargetEvent;
      this.enableContinuousPositionTracking = enableContinuousPositionTracking;
      this.getAnchorElement = typeof getAnchorElement === "function" ? getAnchorElement : null;
      this.trackingRoot = null;
      this.target = null;
      this.frameScheduled = false;
      this.lastMutationAt = 0;
      this.destroyed = false;
      this.positionTrackRaf = 0;
      this.lastTrackedRect = null;

      this.boundSchedule = this.scheduleUpdate.bind(this);
      this.boundScroll = this.handleScroll.bind(this);
      this.boundFocusIn = this.handleFocusIn.bind(this);
      this.boundInput = this.handleInput.bind(this);
      this.boundVisualViewport = this.handleVisualViewport.bind(this);
      this.boundMutation = this.handleMutation.bind(this);
    }

    start() {
      if (this.destroyed) {
        return;
      }

      this.mutationObserver = new MutationObserver(this.boundMutation);
      this.mutationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "aria-label", "role", "contenteditable", "placeholder"]
      });

      this.resizeObserver = new ResizeObserver(() => {
        this.scheduleUpdate();
      });

      document.addEventListener("focusin", this.boundFocusIn, true);
      document.addEventListener("input", this.boundInput, true);
      // Capture scroll from nested regions, but ignore scroll *inside* the prompt field
      // (textarea / contenteditable) so the bar only follows real composer movement.
      document.addEventListener("scroll", this.boundScroll, true);
      window.addEventListener("resize", this.boundSchedule, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", this.boundVisualViewport, { passive: true });
        window.visualViewport.addEventListener("scroll", this.boundVisualViewport, { passive: true });
      }
    }

    stop() {
      this.destroyed = true;
      this.stopPositionTracking();
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
      document.removeEventListener("focusin", this.boundFocusIn, true);
      document.removeEventListener("input", this.boundInput, true);
      document.removeEventListener("scroll", this.boundScroll, true);
      window.removeEventListener("resize", this.boundSchedule, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", this.boundVisualViewport, { passive: true });
        window.visualViewport.removeEventListener("scroll", this.boundVisualViewport, { passive: true });
      }
    }

    resolveTrackingRoot(target) {
      if (!target) {
        return null;
      }
      if (this.getAnchorElement) {
        try {
          const anchor = this.getAnchorElement(target);
          if (anchor && anchor.isConnected && typeof anchor.getBoundingClientRect === "function") {
            return anchor;
          }
        } catch (_err) {
          // fall through
        }
      }
      return target;
    }

    bindTarget(nextTarget) {
      if (this.target === nextTarget) {
        return;
      }
      if (this.resizeObserver && this.trackingRoot) {
        try {
          this.resizeObserver.unobserve(this.trackingRoot);
        } catch (_err) {
          // ignore
        }
      }
      this.target = nextTarget;
      this.trackingRoot = this.resolveTrackingRoot(nextTarget);
      if (this.trackingRoot && this.resizeObserver) {
        this.resizeObserver.observe(this.trackingRoot);
        if (this.enableContinuousPositionTracking) {
          this.startPositionTracking();
        } else {
          this.stopPositionTracking();
        }
      } else {
        this.stopPositionTracking();
      }
      this.scheduleUpdate();
    }

    startPositionTracking() {
      if (this.positionTrackRaf || this.destroyed) {
        return;
      }
      const tick = () => {
        this.positionTrackRaf = 0;
        if (this.destroyed || !this.target || !this.target.isConnected) {
          this.lastTrackedRect = null;
          return;
        }

        const el = this.trackingRoot || this.target;
        if (!el || !el.isConnected) {
          this.lastTrackedRect = null;
          return;
        }
        const rect = el.getBoundingClientRect();
        const prev = this.lastTrackedRect;
        // Ignore height-only noise (inner multiline scroll / padding) — only top/left/width move the shell.
        if (
          !prev ||
          Math.abs(rect.top - prev.top) > 0.5 ||
          Math.abs(rect.left - prev.left) > 0.5 ||
          Math.abs(rect.width - prev.width) > 0.5
        ) {
          this.lastTrackedRect = {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          };
          this.scheduleUpdate();
        }

        this.positionTrackRaf = window.requestAnimationFrame(tick);
      };

      this.positionTrackRaf = window.requestAnimationFrame(tick);
    }

    stopPositionTracking() {
      if (this.positionTrackRaf) {
        window.cancelAnimationFrame(this.positionTrackRaf);
        this.positionTrackRaf = 0;
      }
      this.lastTrackedRect = null;
    }

    handleMutation() {
      const now = performance.now();
      if (now - this.lastMutationAt < 50) {
        this.scheduleUpdate();
        return;
      }
      this.lastMutationAt = now;
      this.scheduleUpdate();
    }

    handleFocusIn(event) {
      this.onTargetEvent(event.target);
      this.scheduleUpdate();
    }

    handleInput(event) {
      this.onTargetEvent(event.target);
      this.scheduleUpdate();
    }

    handleVisualViewport() {
      this.scheduleUpdate();
    }

    handleScroll(event) {
      if (this.destroyed) {
        return;
      }
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [event.target];
      const scrollRoot = path[0];
      const root = this.trackingRoot || this.target;
      if (root && scrollRoot instanceof Node) {
        if (scrollRoot === root) {
          return;
        }
        if (
          root.nodeType === Node.ELEMENT_NODE &&
          typeof root.contains === "function" &&
          root.contains(scrollRoot)
        ) {
          return;
        }
      }
      this.scheduleUpdate();
    }

    scheduleUpdate() {
      if (this.frameScheduled || this.destroyed) {
        return;
      }
      this.frameScheduled = true;
      window.requestAnimationFrame(() => {
        this.frameScheduled = false;
        if (!this.destroyed) {
          this.onUpdate();
        }
      });
    }
  }

  window.PromptlyObservers = PromptlyObservers;
})();
