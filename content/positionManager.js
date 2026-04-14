(() => {
  class PositionManager {
    constructor(options = {}) {
      this.margin = options.margin ?? 8;
      // Horizontal controls:
      // 1) Move Promptly bar center left/right (px).
      this.promptlyCenterOffsetX = options.promptlyCenterOffsetX ?? 20;
      // 2) Promptly bar width (px).
      this.promptlyBoxWidth = options.promptlyBoxWidth ?? 175;
      // 3) Context window width (px).
      this.contextWindowWidth = options.contextWindowWidth ?? 330;
      // 4) Context center offset from Promptly center (px).
      //    0 means context is centered on Promptly.
      this.contextCenterOffsetX = options.contextCenterOffsetX ?? 0;
      // Manual context-only nudge (positive = right, negative = left).
      this.contextManualNudgeX = options.contextManualNudgeX ?? 30;

      this.tabHeight = options.tabHeight ?? 32;
      this.anchorReferenceHeight = options.anchorReferenceHeight ?? 32;
      this.topOverlap = options.topOverlap ?? 8;
      // Hard override: content window height is fixed.
      this.fixedPopupHeight = options.fixedPopupHeight ?? 140;
      // Move Promptly tab up/down globally (negative = upward).
      this.tabGlobalOffsetY = options.tabGlobalOffsetY ?? -17;
      this.popupGap = options.popupGap ?? 4;
      this.popupVerticalBleed = options.popupVerticalBleed ?? 2;
      // Open-state top trim: moves popup top down by N px.
      this.openPopupTopTrimPx = options.openPopupTopTrimPx ?? 70;
      // Move open tab down (positive = downward).
      this.openTabDownOffsetY = options.openTabDownOffsetY ?? 20;
      // Extra px added to open popup height; bottom extends downward while top stays aligned.
      this.openPopupExtraBottomPx = options.openPopupExtraBottomPx ?? 2;
      // Open-state anchor lift (positive = move open state upward).
      this.openAnchorLiftPx = options.openAnchorLiftPx ?? 1;
      // Open-state tab lift relative to content window (positive = upward).
      this.openTabLiftPx = options.openTabLiftPx ?? 2;
      // Global manual vertical tweak (positive = downward).
      this.manualYOffset = options.manualYOffset ?? 16;
      // Minimum popup body height before vertical bleed.
      this.popupMinHeight = options.popupMinHeight ?? 56;
      // Ignore tiny anchor jitter while open.
      this.openAnchorJitterThresholdPx = options.openAnchorJitterThresholdPx ?? 4;
      this.openShiftMultiplier = options.openShiftMultiplier ?? 2;
      this.anchorPixelNudge = options.anchorPixelNudge ?? 0;
      this.lastOpenAnchorTop = null;
      this.lockedOpenTabY = null;
      // Keep tab inside chat composer horizontally on resize (px inset from anchor edges).
      this.composerHorizontalInset = options.composerHorizontalInset ?? 4;
    }

    setOpenShiftMultiplier(multiplier) {
      const next = Number(multiplier);
      if (!Number.isFinite(next)) {
        return;
      }
      this.openShiftMultiplier = this.clamp(next, 2, 10);
    }

    getOpenShiftMultiplier() {
      return this.openShiftMultiplier;
    }

    setAnchorPixelNudge(nudgePx) {
      const next = Number(nudgePx);
      if (!Number.isFinite(next)) {
        return;
      }
      this.anchorPixelNudge = this.clamp(next, -6, 6);
    }

    getAnchorPixelNudge() {
      return this.anchorPixelNudge;
    }

    setPromptlyCenterOffsetX(offsetPx) {
      const next = Number(offsetPx);
      if (!Number.isFinite(next)) {
        return;
      }
      this.promptlyCenterOffsetX = next;
    }

    getPromptlyCenterOffsetX() {
      return this.promptlyCenterOffsetX;
    }

    setContextWindowWidth(widthPx) {
      const next = Number(widthPx);
      if (!Number.isFinite(next)) {
        return;
      }
      this.contextWindowWidth = this.clamp(next, 220, 760);
    }

    getContextWindowWidth() {
      return this.contextWindowWidth;
    }

    snapToDevicePixel(value) {
      const dpr = window.devicePixelRatio || 1;
      return Math.round(value * dpr) / dpr;
    }

    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    compute(targetRect, popupHeight, isOpen = false) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const anchorLeft = targetRect.left;
      const anchorRight = targetRect.left + targetRect.width;
      const inset = Math.max(0, this.composerHorizontalInset);
      const requestedContextWidth = Math.max(220, Number(this.contextWindowWidth) || 330);
      const maxContextWidthByViewport = Math.max(220, viewportWidth - this.margin * 2);
      const maxContextWidthByComposer = Math.max(220, anchorRight - anchorLeft - inset * 2);
      const effectiveContextWindowWidth = this.snapToDevicePixel(
        this.clamp(
          requestedContextWidth,
          220,
          Math.min(maxContextWidthByViewport, maxContextWidthByComposer)
        )
      );
      const rawPromptlyCenterX =
        targetRect.left + targetRect.width / 2 + this.promptlyCenterOffsetX;

      const snappedTargetTop = this.snapToDevicePixel(targetRect.top);
      const adjustedAnchorTop = this.snapToDevicePixel(
        this.clamp(
          snappedTargetTop + this.tabGlobalOffsetY,
          this.margin,
          viewportHeight - this.margin
        )
      );

      // Mathematical alignment model:
      // promptRight = promptCenter + promptWidth / 2
      // contextCenter = promptRight - contextWidth / 2
      // -> contextRight = contextCenter + contextWidth / 2 = promptRight
      // So right edges always align regardless of width difference.
      let rawPromptlyRightEdgeX =
        rawPromptlyCenterX + this.promptlyBoxWidth / 2 + this.contextCenterOffsetX;

      // Keep the Promptly bar within the chat composer as the window/composer resizes
      // (proportionate to the anchor bar, not a fixed offset that drifts outside).
      const minRightInsideComposer = anchorLeft + inset + this.promptlyBoxWidth;
      const maxRightInsideComposer = anchorRight - inset;
      if (minRightInsideComposer <= maxRightInsideComposer) {
        rawPromptlyRightEdgeX = this.clamp(
          rawPromptlyRightEdgeX,
          minRightInsideComposer,
          maxRightInsideComposer
        );
      } else {
        // Composer narrower than tab + insets: center tab on composer.
        const anchorCenterX = anchorLeft + targetRect.width / 2;
        rawPromptlyRightEdgeX =
          anchorCenterX + this.promptlyBoxWidth / 2 + this.contextCenterOffsetX;
      }

      const minSharedRightEdgeX =
        this.margin + Math.max(this.promptlyBoxWidth, effectiveContextWindowWidth);
      const maxSharedRightEdgeX = viewportWidth - this.margin;
      const sharedRightEdgeX = this.snapToDevicePixel(
        this.clamp(rawPromptlyRightEdgeX, minSharedRightEdgeX, maxSharedRightEdgeX)
      );

      // Both horizontal positions come from one shared right edge so no other
      // lock/drag logic can desync them.
      const tabX = sharedRightEdgeX - this.promptlyBoxWidth;
      let popupX = sharedRightEdgeX - effectiveContextWindowWidth + this.contextManualNudgeX;
      const minPopupXInsideComposer = Math.max(this.margin, anchorLeft + inset);
      const maxPopupXInsideComposer = Math.min(
        viewportWidth - effectiveContextWindowWidth - this.margin,
        anchorRight - inset - effectiveContextWindowWidth
      );
      if (minPopupXInsideComposer <= maxPopupXInsideComposer) {
        popupX = this.snapToDevicePixel(
          this.clamp(popupX, minPopupXInsideComposer, maxPopupXInsideComposer)
        );
      } else {
        popupX = this.snapToDevicePixel(
          this.clamp(
            popupX,
            this.margin,
            Math.max(this.margin, viewportWidth - effectiveContextWindowWidth - this.margin)
          )
        );
      }
      let tabY = this.snapToDevicePixel(
        this.clamp(
          adjustedAnchorTop - this.tabHeight,
          this.margin,
          viewportHeight - this.tabHeight - this.margin
        )
      );

      let direction = "up";
      const requestedPopupHeight = Number(popupHeight);
      const enforcedPopupHeight = Number.isFinite(requestedPopupHeight)
        ? Math.max(64, Math.round(requestedPopupHeight))
        : this.fixedPopupHeight;
      let computedPopupY = tabY - this.popupGap - enforcedPopupHeight;
      let computedPopupHeight = enforcedPopupHeight;

      if (isOpen) {
        if (!Number.isFinite(this.lastOpenAnchorTop)) {
          this.lastOpenAnchorTop = adjustedAnchorTop;
        } else if (
          Math.abs(adjustedAnchorTop - this.lastOpenAnchorTop) >= this.openAnchorJitterThresholdPx
        ) {
          this.lastOpenAnchorTop = adjustedAnchorTop;
        }
      } else {
        this.lastOpenAnchorTop = null;
      }

      const stableOpenAnchorTop = Number.isFinite(this.lastOpenAnchorTop)
        ? this.lastOpenAnchorTop
        : adjustedAnchorTop;

      if (isOpen) {
        const extra = Math.max(0, Math.round(Number(this.openPopupExtraBottomPx) || 0));
        const basePopupBody = this.snapToDevicePixel(enforcedPopupHeight);
        // same top as before open-extra; additional px extend the bottom toward the input
        computedPopupHeight = basePopupBody + extra;
        computedPopupY = stableOpenAnchorTop - basePopupBody - this.openAnchorLiftPx;
        direction = "up";
      } else {
        this.lockedOpenTabY = null;
        // Closed/load state: keep tab exactly on top of the site prompt box.
        // Popup remains positioned above tab for consistent open transition.
        direction = "up";
        computedPopupY = this.clamp(
          tabY - this.popupGap - enforcedPopupHeight,
          this.margin,
          viewportHeight - enforcedPopupHeight - this.margin
        );
        computedPopupHeight = enforcedPopupHeight;
      }

      // Fixed-size enforcement: no extra bleed growth.
      const expandedPopupHeight = this.snapToDevicePixel(computedPopupHeight);
      const expandedPopupY = computedPopupY;
      let popupY = this.snapToDevicePixel(
        this.clamp(expandedPopupY, this.margin, viewportHeight - expandedPopupHeight - this.margin)
      );
      if (isOpen) {
        const extra = Math.max(0, Math.round(Number(this.openPopupExtraBottomPx) || 0));
        const heightForTopAnchor = Math.max(this.popupMinHeight, expandedPopupHeight - extra);
        const anchoredPopupY = stableOpenAnchorTop - heightForTopAnchor - this.openAnchorLiftPx;
        popupY = this.snapToDevicePixel(
          this.clamp(anchoredPopupY, this.margin, viewportHeight - expandedPopupHeight - this.margin)
        );
        // Keep Promptly tab directly on top of popup.
        tabY = this.snapToDevicePixel(
          this.clamp(popupY - this.tabHeight, this.margin, viewportHeight - this.tabHeight - this.margin)
        );
        if (this.openTabLiftPx !== 0) {
          tabY = this.snapToDevicePixel(
            this.clamp(
              tabY - this.openTabLiftPx,
              this.margin,
              viewportHeight - this.tabHeight - this.margin
            )
          );
        }
      } else if (this.openTabLiftPx !== 0) {
        // Keep closed mode tab at the same lifted height as open mode.
        tabY = this.snapToDevicePixel(
          this.clamp(
            tabY - this.openTabLiftPx,
            this.margin,
            viewportHeight - this.tabHeight - this.margin
          )
        );
      }

      // Manual global Y nudge for both Promptly bar and content window.
      if (this.manualYOffset !== 0) {
        popupY = this.snapToDevicePixel(
          this.clamp(
            popupY + this.manualYOffset,
            this.margin,
            viewportHeight - expandedPopupHeight - this.margin
          )
        );
        tabY = this.snapToDevicePixel(
          this.clamp(tabY + this.manualYOffset, this.margin, viewportHeight - this.tabHeight - this.margin)
        );
      }

      return {
        tabX,
        tabWidth: this.promptlyBoxWidth,
        tabY,
        popupX,
        popupWidth: effectiveContextWindowWidth,
        popupY,
        popupHeight: expandedPopupHeight,
        popupMinHeight: expandedPopupHeight,
        direction,
        viewportWidth,
        viewportHeight
      };
    }
  }

  window.PromptlyPositionManager = PositionManager;
})();
