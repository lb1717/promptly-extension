(() => {
  const STORAGE_KEY = "promptly:tutorial_completed_v1";
  const STEP_COUNT = 8;

  const STEP_META = [
    {
      id: "welcome",
      stepClass: "is-tutorial-step-welcome",
      locks: ["all-ui"]
    },
    {
      id: "buttons",
      stepClass: "is-tutorial-step-buttons",
      locks: ["all-ui"]
    },
    {
      id: "improve",
      stepClass: "is-tutorial-step-improve",
      locks: ["generate", "auto", "settings", "tab-toggle"]
    },
    {
      id: "auto",
      stepClass: "is-tutorial-step-auto",
      locks: ["improve", "generate", "settings"]
    },
    {
      id: "generate",
      stepClass: "is-tutorial-step-generate",
      locks: ["improve", "auto", "settings"]
    },
    {
      id: "drag",
      stepClass: "is-tutorial-step-drag",
      locks: ["improve", "generate", "auto", "settings"]
    },
    {
      id: "settings",
      stepClass: "is-tutorial-step-settings",
      locks: ["improve", "generate", "auto"],
      panelPosition: "left-of-settings"
    },
    {
      id: "done",
      stepClass: "is-tutorial-step-done",
      locks: ["all-ui"]
    }
  ];

  function readStorageLocal(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime.lastError) {
            resolve(undefined);
            return;
          }
          resolve(result?.[key]);
        });
      } catch (_error) {
        resolve(undefined);
      }
    });
  }

  function writeStorageLocal(key, value) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch (_error) {
        resolve(false);
      }
    });
  }

  function buildFurtherImproveHintHtml() {
    return (
      "<div class='promptly-tutorial-further-improve-hint' aria-hidden='true'>" +
      "<span class='promptly-further-improve-chip promptly-tutorial-preview-fi-chip'><span class='promptly-fi-chip-text'>Concise Output Mode</span></span>" +
      "<span class='promptly-further-improve-chip promptly-tutorial-preview-fi-chip'><span class='promptly-fi-chip-text'>In-Depth Explanation</span></span>" +
      "</div>"
    );
  }

  function buildTutorialSuccessCheckmarkHtml() {
    return (
      "<div class='promptly-tutorial-success-check' aria-hidden='true'>" +
      "<svg viewBox='0 0 96 96' fill='none' xmlns='http://www.w3.org/2000/svg'>" +
      "<circle cx='48' cy='48' r='44' stroke='currentColor' stroke-width='4' opacity='0.25'></circle>" +
      "<path d='M28 50 L42 64 L70 34' stroke='currentColor' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'></path>" +
      "</svg></div>"
    );
  }

  function buildImproveButtonPreviewHtml() {
    return (
      "<div class='promptly-tutorial-step-visual'>" +
      "<span class='promptly-tutorial-preview-chip-wrap promptly-tutorial-preview-chip-wrap-step'>" +
      "<span class='promptly-auto-button promptly-tutorial-preview-chip' aria-hidden='true'>" +
      "<span class='promptly-auto-text-window'>" +
      "<span class='promptly-auto-text-track'>" +
      "<span class='promptly-auto-text-line'>Improve Prompt</span>" +
      "</span></span></span></span></div>"
    );
  }

  function buildAutoModePreviewHtml() {
    return (
      "<div class='promptly-tutorial-step-visual'>" +
      "<span class='promptly-tutorial-preview-tab-strip' aria-hidden='true'>" +
      "<span class='promptly-tab-auto-label'>Auto</span>" +
      "<span class='promptly-tab-auto-switch' data-enabled='true'></span>" +
      "</span></div>"
    );
  }

  function buildAutoModeChipHtml() {
    return (
      "<span class='promptly-tutorial-preview-tab-strip' aria-hidden='true'>" +
      "<span class='promptly-tab-auto-label'>Auto</span>" +
      "<span class='promptly-tab-auto-switch' data-enabled='true'></span>" +
      "</span>"
    );
  }

  function buildPreviewRow(label, description, visualHtml) {
    return (
      "<div class='promptly-tutorial-preview-row'>" +
      "<div class='promptly-tutorial-preview-copy'>" +
      `<div class='promptly-tutorial-preview-label'>${label}</div>` +
      `<div class='promptly-tutorial-preview-desc'>${description}</div>` +
      "</div>" +
      `<div class='promptly-tutorial-preview-visual'>${visualHtml}</div>` +
      "</div>"
    );
  }

  function buildButtonsPreviewHtml(settingsIconUrl) {
    const gearSrc = String(settingsIconUrl || "").replace(/ /g, "%20");
    const improveVisual =
      "<span class='promptly-tutorial-preview-chip-wrap'>" +
      "<span class='promptly-auto-button promptly-tutorial-preview-chip' aria-hidden='true'>" +
      "<span class='promptly-auto-text-window'>" +
      "<span class='promptly-auto-text-track'>" +
      "<span class='promptly-auto-text-line'>Improve Prompt</span>" +
      "</span></span></span></span>";
    const generateVisual =
      "<span class='promptly-tutorial-preview-chip-wrap'>" +
      "<span class='promptly-rewrite-send promptly-tutorial-preview-chip' aria-hidden='true'>" +
      "<span class='promptly-rewrite-send-text-window'>" +
      "<span class='promptly-rewrite-send-text-track'>" +
      "<span class='promptly-rewrite-send-text-line'>Generate Prompt</span>" +
      "</span></span></span></span>";
    const autoVisual = buildAutoModeChipHtml();
    const settingsVisual =
      "<span class='promptly-tutorial-preview-tab-strip' aria-hidden='true'>" +
      "<span class='promptly-tab-settings'>" +
      (gearSrc
        ? `<img class='promptly-tab-settings-icon' src='${gearSrc}' alt='' />`
        : "<span class='promptly-tab-settings-icon'></span>") +
      "</span></span>";
    const tokenVisual =
      "<span class='promptly-tutorial-preview-tab-strip' aria-hidden='true'>" +
      "<span class='promptly-tab-credit-wrap'>" +
      "<span class='promptly-tab-credit-meter promptly-tutorial-preview-credit-meter'></span>" +
      "</span></span>";

    return (
      "<div class='promptly-tutorial-controls-preview'>" +
      buildPreviewRow(
        "Improve Prompt",
        "Press to improve the current prompt in the prompt box.",
        improveVisual
      ) +
      buildPreviewRow(
        "Generate Prompt",
        "Describe the prompt you want to write, then press to generate that prompt.",
        generateVisual
      ) +
      buildPreviewRow(
        "Auto mode",
        "Press to turn Auto mode on so prompts are automatically improved when you send them.",
        autoVisual
      ) +
      buildPreviewRow(
        "Settings",
        "Press to open the Promptly settings page.",
        settingsVisual
      ) +
      buildPreviewRow("Token usage", "Shows your Promptly plan usage.", tokenVisual) +
      "</div>"
    );
  }

  class PromptlyTutorial {
    constructor({ root, onStepEnter, onStepExit, onStepSkip, onComplete }) {
      this.root = root;
      this.onStepEnter = typeof onStepEnter === "function" ? onStepEnter : () => {};
      this.onStepExit = typeof onStepExit === "function" ? onStepExit : () => {};
      this.onStepSkip = typeof onStepSkip === "function" ? onStepSkip : () => {};
      this.onComplete = typeof onComplete === "function" ? onComplete : () => {};
      this.active = false;
      this.stepIndex = 0;
      this.improveInitialDone = false;
      this.furtherImproveDone = false;
      this.promptSentDone = false;
      this.autoDone = false;
      this.generateDone = false;
      this.settingsOpened = false;
      this.settingsClosedAfterOpen = false;
      this.settingsIconUrl = `${chrome.runtime.getURL("content/ui/images/gear.png")}?v=1`;

      this.panel = document.createElement("aside");
      this.panel.className = "promptly-tutorial-panel";
      this.panel.setAttribute("aria-hidden", "true");
      this.panel.innerHTML =
        "<div class='promptly-tutorial-progress' role='progressbar'></div>" +
        "<div class='promptly-tutorial-body'></div>" +
        "<div class='promptly-tutorial-footer'>" +
        "<button type='button' class='promptly-tutorial-back'>Back</button>" +
        "<div class='promptly-tutorial-footer-end'>" +
        "<button type='button' class='promptly-tutorial-skip'>Skip</button>" +
        "<button type='button' class='promptly-tutorial-next'>Next</button>" +
        "</div></div>";

      this.progressEl = this.panel.querySelector(".promptly-tutorial-progress");
      this.bodyEl = this.panel.querySelector(".promptly-tutorial-body");
      this.backBtn = this.panel.querySelector(".promptly-tutorial-back");
      this.skipBtn = this.panel.querySelector(".promptly-tutorial-skip");
      this.nextBtn = this.panel.querySelector(".promptly-tutorial-next");

      this.backBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.goBack();
      });
      this.skipBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.skipCurrentStep();
      });
      this.nextBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.goNext();
      });
      this.panel.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      this.renderProgressBars();
      this.root.append(this.panel);
    }

    renderProgressBars() {
      if (!this.progressEl) {
        return;
      }
      this.progressEl.innerHTML = "";
      for (let i = 0; i < STEP_COUNT; i += 1) {
        const bar = document.createElement("span");
        bar.className = "promptly-tutorial-progress-bar";
        bar.dataset.index = String(i);
        this.progressEl.append(bar);
      }
    }

    async isCompleted() {
      const value = await readStorageLocal(STORAGE_KEY);
      return value === true || value === "1" || value === 1;
    }

    async markCompleted() {
      await writeStorageLocal(STORAGE_KEY, true);
    }

    async resetCompleted() {
      await writeStorageLocal(STORAGE_KEY, false);
    }

    isActive() {
      return this.active;
    }

    getStepId() {
      return STEP_META[this.stepIndex]?.id || "welcome";
    }

    getImprovePhase() {
      if (!this.improveInitialDone) {
        return "initial";
      }
      if (!this.furtherImproveDone) {
        return "further";
      }
      if (!this.promptSentDone) {
        return "send";
      }
      return "complete";
    }

    allows(action) {
      if (!this.active) {
        return true;
      }
      const meta = STEP_META[this.stepIndex];
      if (!meta) {
        return false;
      }
      if (meta.locks.includes("all-ui")) {
        return false;
      }
      if (meta.id === "improve") {
        const phase = this.getImprovePhase();
        if (phase === "initial") {
          return action === "improve";
        }
        if (phase === "further") {
          return action === "further-improve";
        }
        if (phase === "send") {
          return action === "native-send";
        }
        return false;
      }
      if (action === "improve") {
        return meta.id === "improve";
      }
      if (action === "generate") {
        return meta.id === "generate";
      }
      if (action === "auto") {
        return meta.id === "auto";
      }
      if (action === "settings") {
        return meta.id === "settings";
      }
      if (action === "tab-toggle") {
        return false;
      }
      if (action === "drag") {
        return meta.id === "drag";
      }
      return false;
    }

    canGoNext() {
      const meta = STEP_META[this.stepIndex];
      if (!meta) {
        return false;
      }
      if (meta.id === "improve") {
        return this.promptSentDone;
      }
      if (meta.id === "auto") {
        return this.autoDone;
      }
      if (meta.id === "generate") {
        return this.generateDone;
      }
      if (meta.id === "settings") {
        return this.settingsClosedAfterOpen;
      }
      if (meta.id === "done") {
        return true;
      }
      return true;
    }

    async start(options = {}) {
      const force = !!options.force;
      if (!force && (await this.isCompleted())) {
        return false;
      }
      this.active = true;
      this.stepIndex = 0;
      this.improveInitialDone = false;
      this.furtherImproveDone = false;
      this.promptSentDone = false;
      this.autoDone = false;
      this.generateDone = false;
      this.settingsOpened = false;
      this.settingsClosedAfterOpen = false;
      this.panel.setAttribute("aria-hidden", "false");
      this.root.classList.add("is-tutorial-active");
      this.applyStepClasses();
      this.renderStep();
      this.onStepEnter(this.getStepId(), this.stepIndex);
      return true;
    }

    async restart() {
      this.root.classList.remove("is-tutorial-active");
      STEP_META.forEach((meta) => {
        this.root.classList.remove(meta.stepClass);
      });
      this.root.classList.remove("is-tutorial-panel-left");
      ["initial", "further", "send", "complete"].forEach((phase) => {
        this.root.classList.remove(`is-tutorial-improve-phase-${phase}`);
      });
      this.active = false;
      return this.start({ force: true });
    }

    async finish() {
      if (!this.active) {
        return;
      }
      this.onStepExit(this.getStepId(), this.stepIndex);
      this.active = false;
      this.root.classList.remove("is-tutorial-active");
      STEP_META.forEach((meta) => {
        this.root.classList.remove(meta.stepClass);
      });
      this.root.classList.remove("is-tutorial-panel-left");
      ["initial", "further", "send", "complete"].forEach((phase) => {
        this.root.classList.remove(`is-tutorial-improve-phase-${phase}`);
      });
      this.panel.setAttribute("aria-hidden", "true");
      await this.markCompleted();
      this.onComplete();
    }

    goBack() {
      if (!this.active || this.stepIndex <= 0) {
        return;
      }
      this.onStepExit(this.getStepId(), this.stepIndex);
      this.stepIndex -= 1;
      this.applyStepClasses();
      this.renderStep();
      this.onStepEnter(this.getStepId(), this.stepIndex);
    }

    goNext(options = {}) {
      if (!this.active) {
        return;
      }
      const meta = STEP_META[this.stepIndex];
      if (!meta) {
        return;
      }
      if (meta.id === "done") {
        void this.finish();
        return;
      }
      if (!options.force && !this.canGoNext()) {
        return;
      }
      if (this.stepIndex >= STEP_COUNT - 1) {
        void this.finish();
        return;
      }
      this.onStepExit(meta.id, this.stepIndex);
      this.stepIndex += 1;
      this.applyStepClasses();
      this.renderStep();
      this.onStepEnter(this.getStepId(), this.stepIndex);
    }

    completeCurrentStepRequirements() {
      const stepId = this.getStepId();
      if (stepId === "improve") {
        this.improveInitialDone = true;
        this.furtherImproveDone = true;
        this.promptSentDone = true;
        return;
      }
      if (stepId === "auto") {
        this.autoDone = true;
        return;
      }
      if (stepId === "generate") {
        this.generateDone = true;
        return;
      }
      if (stepId === "settings") {
        this.settingsOpened = true;
        this.settingsClosedAfterOpen = true;
      }
    }

    skipCurrentStep() {
      if (!this.active) {
        return;
      }
      const meta = STEP_META[this.stepIndex];
      if (!meta) {
        return;
      }
      if (meta.id === "done") {
        void this.finish();
        return;
      }
      this.completeCurrentStepRequirements();
      this.onStepSkip(meta.id, this.stepIndex);
      this.goNext({ force: true });
    }

    applyStepClasses() {
      STEP_META.forEach((meta) => {
        this.root.classList.toggle(meta.stepClass, meta.id === this.getStepId());
      });
      const meta = STEP_META[this.stepIndex];
      const leftOfSettings = meta?.panelPosition === "left-of-settings" && this.settingsOpened;
      this.root.classList.toggle("is-tutorial-panel-left", !!leftOfSettings);
      ["initial", "further", "send", "complete"].forEach((phase) => {
        this.root.classList.toggle(
          `is-tutorial-improve-phase-${phase}`,
          meta?.id === "improve" && this.getImprovePhase() === phase
        );
      });
    }

    renderStep() {
      const meta = STEP_META[this.stepIndex];
      if (!meta || !this.bodyEl) {
        return;
      }
      this.progressEl?.querySelectorAll(".promptly-tutorial-progress-bar").forEach((bar, index) => {
        bar.classList.toggle("is-active", index <= this.stepIndex);
        bar.classList.toggle("is-current", index === this.stepIndex);
      });

      let title = "";
      let body = "";
      let nextLabel = "Next";

      switch (meta.id) {
        case "welcome":
          title = "Welcome to Promptly";
          body =
            "<p>This quick tutorial walks you through the essentials — improving prompts, auto mode, generating prompts, and settings.</p>" +
            "<p>It only takes a minute. Let's get started.</p>";
          nextLabel = "Get started";
          break;
        case "buttons":
          title = "Meet the controls";
          body =
            "<p>The Promptly bar sits on your chat input. Here is what each control does:</p>" +
            buildButtonsPreviewHtml(this.settingsIconUrl);
          break;
        case "improve": {
          const phase = this.getImprovePhase();
          if (phase === "complete") {
            title = "Great — first prompt improved!";
            body =
              "<p>You improved, refined, and sent your first prompt. Promptly rewrites your text to be clearer and more effective for the AI.</p>" +
              buildTutorialSuccessCheckmarkHtml();
          } else if (phase === "send") {
            title = "Send your prompt";
            body =
              "<p>Send the full prompt to the AI using the chat's <strong>Send</strong> button or <strong>Enter</strong>.</p>" +
              "<p class='promptly-tutorial-muted'>Send the message to continue.</p>";
          } else if (phase === "further") {
            title = "Refine your prompt further";
            body =
              "<p>Promptly suggests optional refinements below <strong>Advanced Prompt Builder</strong>. Press at least one to tweak tone, depth, or output style.</p>" +
              buildFurtherImproveHintHtml() +
              "<p class='promptly-tutorial-muted'>Pick one refinement chip in the Promptly panel to continue.</p>";
          } else {
            title = "Write your first prompt";
            body =
              "<p>Type a short prompt in the chat box below, then press <strong>Improve Prompt</strong>.</p>" +
              buildImproveButtonPreviewHtml() +
              "<p class='promptly-tutorial-muted'>Only Improve is enabled for this step.</p>";
          }
          break;
        }
        case "auto":
          title = this.autoDone ? "Auto mode is on" : "Turn on Auto mode";
          body = this.autoDone
            ? "<p>With Auto on, Promptly improves your prompt automatically whenever you send a message.</p>" +
              buildTutorialSuccessCheckmarkHtml()
            : "<p>Toggle <strong>Auto</strong> on the Promptly bar. It improves prompts right before you send them.</p>" +
              buildAutoModePreviewHtml() +
              "<p class='promptly-tutorial-muted'>Enable Auto to continue.</p>";
          break;
        case "generate":
          title = this.generateDone ? "Great — prompt generated!" : "Generate a prompt";
          body = this.generateDone
            ? "<p>Promptly built a full task prompt from your short description — ready to paste or send.</p>"
            : "<p>Describe what you want the AI to do in the <strong>Advanced Prompt Builder</strong> box — not a finished prompt, just a brief request.</p>" +
              "<p>Then press <strong>Generate Prompt</strong>.</p>" +
              "<p class='promptly-tutorial-muted'>Example: “Write a prompt to code a Mario Kart-like game for me.”</p>";
          break;
        case "drag":
          title = "Reposition the bar";
          body =
            "<p>You can drag the Promptly bar left or right along the chat input to find the best spot.</p>" +
            "<p class='promptly-tutorial-hint'>← Slide the bar to reposition →</p>";
          break;
        case "settings":
          title = this.settingsClosedAfterOpen
            ? "Settings explored"
            : this.settingsOpened
              ? "Close settings"
              : "Open settings";
          body = this.settingsClosedAfterOpen
            ? "<p>Nice — you found account info, model options, and visual themes.</p>"
            : this.settingsOpened
              ? "<p>Press the <strong>×</strong> in the top-right of the settings panel to close it.</p>"
              : "<p>Press the <strong>settings wheel</strong> on the Promptly bar to open your account and preferences.</p>";
          break;
        case "done":
          title = "Tutorial complete";
          body =
            "<p>Welcome to Promptly. You're ready to write sharper prompts on ChatGPT, Claude, and Gemini.</p>";
          nextLabel = "Close";
          break;
        default:
          break;
      }

      this.bodyEl.innerHTML =
        `<h2 class='promptly-tutorial-title'>${title}</h2>` +
        `<div class='promptly-tutorial-copy'>${body}</div>`;

      this.panel.classList.toggle("promptly-tutorial-panel-controls", meta.id === "buttons");

      this.backBtn.hidden = this.stepIndex === 0;
      this.skipBtn.hidden = meta.id === "done";
      this.nextBtn.textContent = nextLabel;
      this.nextBtn.disabled = !this.canGoNext();
    }

    notifyImproveSuccess() {
      if (!this.active || this.getStepId() !== "improve" || this.getImprovePhase() !== "initial") {
        return;
      }
      this.improveInitialDone = true;
      this.applyStepClasses();
      this.renderStep();
    }

    notifyImproveComposerSentEarly() {
      if (!this.active || this.getStepId() !== "improve") {
        return;
      }
      const phase = this.getImprovePhase();
      if (phase === "complete" || phase === "initial") {
        return;
      }
      this.furtherImproveDone = true;
      this.promptSentDone = true;
      this.applyStepClasses();
      this.renderStep();
    }

    reconcileImproveStep(analysis, promptText) {
      if (!this.active || this.getStepId() !== "improve") {
        return;
      }
      if (this.getImprovePhase() !== "further") {
        return;
      }
      if (analysis?.showFurtherImproveGrid) {
        return;
      }
      const trimmed = String(promptText || "").trim();
      this.furtherImproveDone = true;
      if (!trimmed) {
        this.promptSentDone = true;
      }
      this.applyStepClasses();
      this.renderStep();
    }

    notifyFurtherImproveApplied() {
      if (!this.active || this.getStepId() !== "improve" || this.getImprovePhase() !== "further") {
        return;
      }
      this.furtherImproveDone = true;
      this.applyStepClasses();
      this.renderStep();
    }

    notifyPromptSent() {
      if (!this.active || this.getStepId() !== "improve") {
        return;
      }
      const phase = this.getImprovePhase();
      if (phase === "complete" || phase === "initial") {
        return;
      }
      if (phase === "further") {
        this.furtherImproveDone = true;
      }
      this.promptSentDone = true;
      this.applyStepClasses();
      this.renderStep();
    }

    notifyAutoEnabled() {
      if (!this.active || this.getStepId() !== "auto") {
        return;
      }
      this.autoDone = true;
      this.renderStep();
    }

    notifyGenerateSuccess() {
      if (!this.active || this.getStepId() !== "generate") {
        return;
      }
      this.generateDone = true;
      this.renderStep();
    }

    notifySettingsOpened() {
      if (!this.active || this.getStepId() !== "settings") {
        return;
      }
      this.settingsOpened = true;
      this.applyStepClasses();
      this.renderStep();
    }

    notifySettingsClosed() {
      if (!this.active || this.getStepId() !== "settings") {
        return;
      }
      if (!this.settingsOpened) {
        return;
      }
      this.settingsClosedAfterOpen = true;
      this.applyStepClasses();
      this.renderStep();
    }

    destroy() {
      this.panel.remove();
    }
  }

  window.PromptlyTutorial = PromptlyTutorial;
  window.PromptlyTutorialStorageKey = STORAGE_KEY;
})();
