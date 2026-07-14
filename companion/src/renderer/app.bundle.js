(() => {
  // src/renderer/api.js
  var OPTIMIZE_TIMEOUT_MS = 45e3;
  var CREDITS_POLL_MS = 45e3;
  function companionHeaders(config2) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${String(config2.token || "").trim()}`,
      "x-promptly-client": config2.client || config2.clientHeader || "promptly-cursor",
      "x-promptly-live-config": "1"
    };
  }
  function buildOptimizeError(body, status) {
    const error = new Error(String(body.error || `Optimize failed (${status})`));
    if (body.credits) {
      error.credits = body.credits;
    }
    if (status === 401) {
      error.needsSignIn = true;
    }
    if (status === 429) {
      error.outOfTokens = true;
    }
    return error;
  }
  async function fetchAccount(config2) {
    const base = String(config2.apiUrl || "").replace(/\/$/, "");
    const auth = String(config2.token || "").trim();
    if (!base || !auth) {
      throw new Error("Sign in to Promptly to use Companion.");
    }
    const response = await fetch(`${base}/api/companion/account`, {
      method: "GET",
      headers: companionHeaders(config2),
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(body.error || `Account lookup failed (${response.status})`));
      if (response.status === 401) {
        error.needsSignIn = true;
      }
      throw error;
    }
    return {
      email: body.email || null,
      displayName: body.displayName || null,
      plan: body.plan || "free",
      credits: body.credits || null,
      deviceTool: body.deviceTool || null
    };
  }
  async function optimizePrompt({
    apiUrl,
    token,
    clientHeader,
    client,
    prompt,
    promptFeedback = "",
    optimizeMode = "improve"
  }) {
    const base = String(apiUrl || "").replace(/\/$/, "");
    const auth = String(token || "").trim();
    if (!base) throw new Error("API URL is required.");
    if (!auth) throw new Error("Auth token is required. Add PROMPTLY_DEVICE_TOKEN or pair an IDE integration.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPTIMIZE_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${base}/api/companion/optimize`, {
        method: "POST",
        headers: companionHeaders({ token: auth, client: client || clientHeader }),
        body: JSON.stringify({
          prompt: String(prompt || "").trim(),
          prompt_feedback: String(promptFeedback || "").trim(),
          optimize_mode: optimizeMode
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Request timed out \u2014 try a shorter prompt.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw buildOptimizeError(body, response.status);
    }
    const optimized = String(body.optimized_prompt || "").trim();
    if (!optimized) {
      throw new Error("Empty response from Promptly.");
    }
    return {
      optimized,
      refineSummary: String(body.refine_summary || "").trim(),
      credits: body.credits || null
    };
  }
  async function improveInitialDraft(config2, draft) {
    return optimizePrompt({ ...config2, prompt: draft, optimizeMode: "improve" });
  }
  async function refineWithFeedback(config2, currentPrompt, promptFeedback) {
    const { optimized, refineSummary, credits } = await optimizePrompt({
      apiUrl: config2.apiUrl,
      token: config2.token,
      clientHeader: config2.client || config2.clientHeader,
      prompt: currentPrompt,
      promptFeedback,
      optimizeMode: "refine"
    });
    return {
      prompt: optimized,
      summary: refineSummary || "Updated the prompt based on your feedback.",
      credits
    };
  }
  var TRANSCRIBE_TIMEOUT_MS = 45e3;
  var MAX_AUDIO_BYTES = 12 * 1024 * 1024;
  async function transcribeAudio(config2, audioBlob) {
    const base = String(config2.apiUrl || "").replace(/\/$/, "");
    const auth = String(config2.token || "").trim();
    if (!base) throw new Error("API URL is required.");
    if (!auth) throw new Error("Auth token is required.");
    if (!audioBlob || audioBlob.size < 1) throw new Error("No audio to transcribe.");
    if (audioBlob.size > MAX_AUDIO_BYTES) {
      throw new Error("Recording is too long. Stop dictation sooner and try again.");
    }
    const formData = new FormData();
    const filename = audioBlob.type?.includes("mp4") ? "speech.m4a" : audioBlob.type?.includes("ogg") ? "speech.ogg" : "speech.webm";
    formData.append("audio", audioBlob, filename);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${base}/api/companion/transcribe`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth}`,
          "x-promptly-client": config2.client || config2.clientHeader || "promptly-cursor",
          "x-promptly-live-config": "1"
        },
        body: formData,
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Transcription timed out \u2014 try a shorter recording.");
      }
      const message = String(error?.message || error || "");
      if (/failed to fetch|network error|load failed/i.test(message)) {
        throw new Error(
          "Could not reach Promptly transcription. Check your connection and try again in a minute."
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(body.error || `Transcription failed (${response.status})`));
    }
    const text = String(body.text || "").trim();
    if (!text) {
      throw new Error("No speech detected in the recording.");
    }
    return text;
  }

  // src/renderer/further-improve.js
  function countWords(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  // src/renderer/strength.js
  function simplePromptHash(str) {
    let h = 2166136261 >>> 0;
    const s = String(str || "");
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function computePromptStrengthPercent(promptText, { aiEnhanced = false } = {}) {
    const trimmed = String(promptText || "").trim();
    const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const charCount = trimmed.length;
    const h = simplePromptHash(trimmed);
    if (aiEnhanced) {
      const v = 96 + h % 5;
      return Math.max(0, Math.min(100, Math.round(v)));
    }
    const cap = 59;
    if (wordCount === 0) {
      return Math.max(0, Math.min(22, Math.round(2 + h % 18)));
    }
    const asymptotic = 1 - Math.exp(-wordCount / 11.5);
    let base = asymptotic * cap * 0.9;
    const organic = Math.sin(wordCount * 0.092 + 0.35) * 2.1 + Math.sin(charCount * 0.016 + wordCount * 0.058) * 1.45 + Math.sin(Math.sqrt(wordCount) * 1.5 + 0.7) * 0.95;
    base += organic * 0.52;
    base = Math.max(7, Math.min(cap, base));
    return Math.round(base);
  }
  function strengthLevel(percent) {
    if (percent >= 70) return "high";
    if (percent >= 40) return "mid";
    return "low";
  }
  function updateStrengthUi(trackEl, fillEl, promptText, { aiEnhanced = false } = {}) {
    if (!trackEl || !fillEl) return;
    const percent = computePromptStrengthPercent(promptText, { aiEnhanced });
    fillEl.style.width = `${percent}%`;
    fillEl.dataset.level = strengthLevel(percent);
    trackEl.dataset.aiEnhanced = aiEnhanced ? "true" : "false";
  }

  // src/renderer/dictation.js
  var activeController = null;
  var MIC_SVG = '<svg class="mic-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V19H9v2h6v-2h-2v-1.08A7 7 0 0 0 19 11h-2Z"/></svg>';
  async function ensureMicrophoneAccess(onError) {
    const appInfo = window.promptlyCompanion?.getAppInfo ? await window.promptlyCompanion.getAppInfo() : { isPackaged: true, name: "Promptly Companion" };
    if (window.promptlyCompanion?.requestMicrophoneAccess) {
      const access = await window.promptlyCompanion.requestMicrophoneAccess();
      if (!access?.granted) {
        if (access?.prompted) {
          onError?.("Microphone access was denied. Tap the mic again after allowing access.");
        } else if (access?.openedSettings) {
          const label = appInfo.isPackaged ? appInfo.name || "Promptly Companion" : "Electron";
          onError?.(
            `Enable ${label} under Privacy & Security \u2192 Microphone in System Settings, then tap the mic again.`
          );
        } else {
          onError?.("Microphone access is required for dictation.");
        }
        return false;
      }
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.("Microphone capture is not available in this environment.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return true;
    } catch {
      onError?.("Microphone access is required for dictation.");
      return false;
    }
  }
  function pickRecorderMimeType() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
      return "";
    }
    for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "";
  }
  function createDictationController(options) {
    const { textarea, micButton, getConfig, onError, onStateChange } = options;
    const overlayMode = options.overlayMode === "compact" ? "compact" : "full";
    let recorder = null;
    let stream = null;
    let chunks = [];
    let active = false;
    let transcribing = false;
    let baseText = "";
    let statusEl = null;
    let recordingOverlay = null;
    let defaultPlaceholder = "";
    if (textarea) {
      defaultPlaceholder = textarea.placeholder || "";
      textarea.dataset.defaultPlaceholder = defaultPlaceholder;
    }
    function ensureStatusElement() {
      if (overlayMode !== "compact" || !textarea?.parentElement) return null;
      if (statusEl?.isConnected) return statusEl;
      statusEl = textarea.parentElement.querySelector(".dictation-status");
      if (!statusEl) {
        statusEl = document.createElement("div");
        statusEl.className = "dictation-status hidden";
        statusEl.setAttribute("aria-live", "polite");
        statusEl.setAttribute("aria-atomic", "true");
        textarea.insertAdjacentElement("afterend", statusEl);
      }
      return statusEl;
    }
    function ensureRecordingOverlay() {
      if (overlayMode !== "full" || !textarea?.parentElement) return null;
      if (recordingOverlay?.isConnected) return recordingOverlay;
      const host = textarea.parentElement;
      recordingOverlay = host.querySelector(".dictation-recording-overlay");
      if (!recordingOverlay) {
        recordingOverlay = document.createElement("div");
        recordingOverlay.className = "dictation-recording-overlay hidden";
        recordingOverlay.innerHTML = `
        <div class="dictation-recording-stage">
          <div class="dictation-recording-mic-wrap">
            <div class="dictation-recording-ripples" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
            <button type="button" class="dictation-recording-mic" aria-label="Stop recording">
              ${MIC_SVG}
            </button>
          </div>
          <p class="dictation-recording-hint">Tap to stop recording</p>
        </div>
      `;
        const stopFromOverlay = (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (active && !transcribing) {
            stop();
          }
        };
        recordingOverlay.addEventListener("click", stopFromOverlay);
        recordingOverlay.querySelector(".dictation-recording-mic")?.addEventListener("click", stopFromOverlay);
        host.appendChild(recordingOverlay);
      }
      return recordingOverlay;
    }
    function setDictationVisualState(state) {
      if (!textarea) return;
      const placeholder = textarea.dataset.defaultPlaceholder || defaultPlaceholder;
      const overlay = ensureRecordingOverlay();
      const compactStatus = ensureStatusElement();
      if (state === "idle") {
        textarea.placeholder = placeholder;
        textarea.removeAttribute("aria-busy");
        textarea.classList.remove("dictation-field-active");
        if (overlay) {
          overlay.classList.add("hidden");
          overlay.classList.remove("dictation-recording-overlay--transcribing");
          overlay.querySelector(".dictation-recording-ripples")?.classList.remove("hidden");
          const hint = overlay.querySelector(".dictation-recording-hint");
          if (hint) {
            hint.textContent = "Tap to stop recording";
            hint.classList.remove("dictation-recording-hint--transcribing");
          }
        }
        if (compactStatus) {
          compactStatus.textContent = "";
          compactStatus.className = "dictation-status hidden";
        }
        if (micButton) {
          micButton.setAttribute("aria-label", "Start dictation");
        }
        return;
      }
      textarea.placeholder = "";
      textarea.setAttribute("aria-busy", "true");
      textarea.classList.toggle("dictation-field-active", state === "listening");
      if (overlayMode === "full" && overlay) {
        overlay.classList.remove("hidden");
        const ripples = overlay.querySelector(".dictation-recording-ripples");
        const hint = overlay.querySelector(".dictation-recording-hint");
        if (state === "listening") {
          overlay.classList.remove("dictation-recording-overlay--transcribing");
          ripples?.classList.remove("hidden");
          if (hint) {
            hint.textContent = "Tap to stop recording";
            hint.classList.remove("dictation-recording-hint--transcribing");
          }
        } else {
          overlay.classList.add("dictation-recording-overlay--transcribing");
          ripples?.classList.add("hidden");
          if (hint) {
            hint.textContent = "Converting to text";
            hint.classList.add("dictation-recording-hint--transcribing");
          }
        }
      } else if (compactStatus) {
        compactStatus.className = state === "transcribing" ? "dictation-status dictation-status--transcribing" : "dictation-status hidden";
        compactStatus.textContent = state === "transcribing" ? "Converting to text" : "";
      }
      if (micButton) {
        micButton.setAttribute(
          "aria-label",
          state === "listening" ? "Stop dictation" : "Converting to text"
        );
      }
    }
    function isSupported() {
      return Boolean(
        textarea && micButton && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined" && getConfig
      );
    }
    function setRecordingUi(recording) {
      if (!micButton) return;
      micButton.classList.toggle("dictation-active", recording);
      micButton.setAttribute("aria-pressed", recording ? "true" : "false");
      if (transcribing) {
        micButton.title = "Converting to text\u2026";
        setDictationVisualState("transcribing");
      } else if (recording) {
        micButton.title = "Stop dictation";
        setDictationVisualState("listening");
      } else {
        micButton.title = "Start dictation";
        setDictationVisualState("idle");
      }
      onStateChange?.(recording || transcribing);
    }
    function appendTranscript(text) {
      if (!textarea) return;
      const spoken = String(text || "").trim();
      if (!spoken) return;
      const prefix = baseText.trimEnd();
      if (!prefix) {
        textarea.value = spoken;
      } else {
        const joiner = prefix.endsWith("\n") ? "" : " ";
        textarea.value = `${prefix}${joiner}${spoken}`;
      }
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    function cleanupStream() {
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        stream = null;
      }
      recorder = null;
      chunks = [];
    }
    function resetAfterDictation() {
      transcribing = false;
      if (micButton) {
        micButton.disabled = false;
      }
      if (activeController === api) {
        activeController = null;
      }
      setDictationVisualState("idle");
      setRecordingUi(false);
    }
    function stop() {
      if (transcribing) {
        cleanupStream();
        active = false;
        resetAfterDictation();
        return;
      }
      const stoppingRecorder = Boolean(recorder && recorder.state !== "inactive");
      if (stoppingRecorder) {
        try {
          setDictationVisualState("transcribing");
          if (micButton) {
            micButton.classList.remove("dictation-active");
            micButton.setAttribute("aria-pressed", "false");
            micButton.title = "Converting to text\u2026";
          }
          onStateChange?.(true);
          recorder.stop();
        } catch {
          cleanupStream();
          resetAfterDictation();
        }
      } else {
        cleanupStream();
        if (!transcribing) {
          resetAfterDictation();
        }
      }
      active = false;
      if (!transcribing && !stoppingRecorder && activeController === api) {
        activeController = null;
      }
    }
    async function transcribeRecording() {
      transcribing = true;
      setDictationVisualState("transcribing");
      if (micButton) {
        micButton.disabled = true;
        micButton.classList.remove("dictation-active");
        micButton.setAttribute("aria-pressed", "false");
      }
      onStateChange?.(true);
      if (!chunks.length) {
        onError?.("No audio captured. Try speaking a little longer.");
        resetAfterDictation();
        return;
      }
      const mimeType = recorder?.mimeType || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });
      cleanupStream();
      if (blob.size < 800) {
        onError?.("No speech detected. Try again closer to the mic.");
        resetAfterDictation();
        return;
      }
      const config2 = getConfig();
      if (!config2?.token) {
        onError?.("Connect in Settings before using dictation.");
        resetAfterDictation();
        return;
      }
      try {
        const text = await transcribeAudio(config2, blob);
        appendTranscript(text);
      } catch (error) {
        onError?.(String(error?.message || error || "Transcription failed."));
      } finally {
        resetAfterDictation();
      }
    }
    async function start() {
      if (!textarea || !micButton) {
        onError?.("Dictation is not available.");
        return;
      }
      if (textarea.readOnly || textarea.disabled) {
        return;
      }
      const allowed = await ensureMicrophoneAccess(onError);
      if (!allowed) {
        return;
      }
      if (activeController && activeController !== api) {
        activeController.stop();
      }
      const mimeType = pickRecorderMimeType();
      if (!mimeType) {
        onError?.("Audio recording is not supported in this environment.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        baseText = textarea.value;
        recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (event) => {
          if (event.data?.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onstop = () => {
          void transcribeRecording();
        };
        recorder.onerror = () => {
          onError?.("Recording failed. Try the mic again.");
          stop();
        };
        recorder.start();
        active = true;
        activeController = api;
        setRecordingUi(true);
      } catch (error) {
        cleanupStream();
        onError?.(String(error?.message || error || "Could not start recording."));
        stop();
      }
    }
    async function toggle() {
      if (transcribing) {
        return;
      }
      if (active) {
        stop();
        return;
      }
      await start();
    }
    const api = {
      isSupported,
      toggle,
      stop,
      get isActive() {
        return active || transcribing;
      }
    };
    return api;
  }
  function stopAllDictation() {
    activeController?.stop();
  }

  // src/renderer/app.js
  var PRODUCTION_API_URL = "https://promptly-labs.com";
  function normalizeApiUrl(url) {
    return String(url || "").trim().replace(/\/$/, "");
  }
  function getSignInUrl(apiUrl) {
    const base = normalizeApiUrl(apiUrl) || PRODUCTION_API_URL;
    return `${base}/auth/companion`;
  }
  function getAccountPageUrl(apiUrl) {
    const base = normalizeApiUrl(apiUrl) || PRODUCTION_API_URL;
    return `${base}/account`;
  }
  function getStatisticsPageUrl(apiUrl) {
    const base = normalizeApiUrl(apiUrl) || PRODUCTION_API_URL;
    return `${base}/account/statistics`;
  }
  function openExternalUrl(url) {
    if (window.promptlyCompanion?.openExternal) {
      void window.promptlyCompanion.openExternal(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }
  var config = { apiUrl: "", token: "", client: "promptly-cursor" };
  var account = null;
  var creditsPollTimer = null;
  var isSignedIn = false;
  var loadingSettingsForm = false;
  var statusBanner = document.getElementById("status-banner");
  var draftView = document.getElementById("draft-view");
  var refineView = document.getElementById("refine-view");
  var draftInput = document.getElementById("draft-input");
  var draftMicBtn = document.getElementById("draft-mic-btn");
  var improveBtn = document.getElementById("improve-btn");
  var promptInput = document.getElementById("prompt-input");
  var copyBtn = document.getElementById("copy-btn");
  var pasteBtn = document.getElementById("paste-btn");
  var summarySlot = document.getElementById("summary-slot");
  var followUpInput = document.getElementById("follow-up-input");
  var followUpMicBtn = document.getElementById("follow-up-mic-btn");
  var refineBtn = document.getElementById("refine-btn");
  var newPromptBtn = document.getElementById("new-prompt-btn");
  var newBtn = document.getElementById("new-btn");
  var collapseBtn = document.getElementById("collapse-btn");
  var closeBtn = document.getElementById("close-btn");
  var appShell = document.getElementById("app-shell");
  var collapsedBar = document.getElementById("collapsed-bar");
  var windowResizeGrip = document.getElementById("window-resize-grip");
  var settingsBtn = document.getElementById("settings-btn");
  var settingsDialog = document.getElementById("settings-dialog");
  var signInGate = document.getElementById("sign-in-gate");
  var signInBtn = document.getElementById("sign-in-btn");
  var permissionsDialog = document.getElementById("permissions-dialog");
  var permissionsAllowBtn = document.getElementById("permissions-allow-btn");
  var permissionsSkipBtn = document.getElementById("permissions-skip-btn");
  var permissionsDevHint = document.getElementById("permissions-dev-hint");
  var permissionsFollowupHint = document.getElementById("permissions-followup-hint");
  var permissionsAppName = document.getElementById("permissions-app-name");
  var settingsCloseBtn = document.getElementById("settings-close-btn");
  var settingsSignOutBtn = document.getElementById("settings-sign-out-btn");
  var settingsStatisticsBtn = document.getElementById("settings-statistics-btn");
  var settingsManageAccountBtn = document.getElementById("settings-manage-account-btn");
  var appVersionLine = document.getElementById("app-version-line");
  var accountIndicator = document.getElementById("account-indicator");
  var settingsAccountName = document.getElementById("settings-account-name");
  var settingsAccountEmail = document.getElementById("settings-account-email");
  var settingsAccountPlan = document.getElementById("settings-account-plan");
  var settingsCreditsLabel = document.getElementById("settings-credits-label");
  var settingsCreditsFill = document.getElementById("settings-credits-fill");
  var settingsCreditsReset = document.getElementById("settings-credits-reset");
  var autoOpenClaude = document.getElementById("auto-open-claude");
  var autoOpenCodex = document.getElementById("auto-open-codex");
  var autoOpenCursor = document.getElementById("auto-open-cursor");
  var openOnLaunch = document.getElementById("open-on-launch");
  var draftStrengthTrack = document.getElementById("draft-strength-track");
  var draftStrengthFill = document.getElementById("draft-strength-fill");
  var promptStrengthTrack = document.getElementById("prompt-strength-track");
  var promptStrengthFill = document.getElementById("prompt-strength-fill");
  var draftWordCount = document.getElementById("draft-word-count");
  var promptWordCount = document.getElementById("prompt-word-count");
  var draftBusyOverlay = document.getElementById("draft-busy-overlay");
  var promptBusyOverlay = document.getElementById("prompt-busy-overlay");
  var promptAiEnhanced = false;
  var statusFadeTimer = null;
  var authBootstrapPending = true;
  var signInPollTimer = null;
  var hasEstablishedSession = false;
  var userSignedOutExplicitly = false;
  function scheduleStatusFade(ms = 4200) {
    if (statusFadeTimer) {
      clearTimeout(statusFadeTimer);
      statusFadeTimer = null;
    }
    statusFadeTimer = setTimeout(() => {
      statusBanner.classList.add("fading");
      setTimeout(() => clearStatus(), 380);
    }, ms);
  }
  function showStatus(message, kind = "loading", options = {}) {
    const { autoFade = kind === "error" || kind === "success" } = options;
    if (statusFadeTimer) {
      clearTimeout(statusFadeTimer);
      statusFadeTimer = null;
    }
    statusBanner.classList.remove("fading");
    statusBanner.textContent = message;
    statusBanner.className = `status-banner ${kind}`;
    statusBanner.classList.remove("hidden");
    if (autoFade) {
      scheduleStatusFade();
    }
  }
  var draftDictation = createDictationController({
    textarea: draftInput,
    micButton: draftMicBtn,
    getConfig: () => config,
    onError: showError,
    overlayMode: "full"
  });
  var followUpDictation = createDictationController({
    textarea: followUpInput,
    micButton: followUpMicBtn,
    getConfig: () => config,
    onError: showError,
    overlayMode: "compact"
  });
  function setupDictationUi() {
    for (const [controller, button] of [
      [draftDictation, draftMicBtn],
      [followUpDictation, followUpMicBtn]
    ]) {
      if (!button) continue;
      if (!controller.isSupported()) {
        button.classList.add("hidden");
        continue;
      }
      button.classList.remove("hidden");
      button.addEventListener("click", () => controller.toggle());
    }
  }
  function mergeConfig(partial) {
    config = {
      apiUrl: String(partial?.apiUrl || config.apiUrl || "").trim(),
      token: String(partial?.token || config.token || "").trim(),
      client: String(partial?.client || config.client || "promptly-cursor").trim()
    };
  }
  function isCreditsHardExhausted(credits) {
    return Boolean(credits?.hard_exhausted);
  }
  function applyCredits(credits) {
    if (!credits) return;
    if (account) {
      account.credits = credits;
    } else {
      account = { email: null, displayName: null, plan: "free", credits };
    }
    updateAccountUi();
    updateCreditsUi();
  }
  function updateCreditsUi() {
    const credits = account?.credits;
    if (!settingsCreditsFill || !settingsCreditsLabel || !settingsCreditsReset) return;
    if (!credits) {
      settingsCreditsLabel.textContent = "\u2014";
      settingsCreditsFill.style.width = "0%";
      settingsCreditsFill.removeAttribute("data-level");
      settingsCreditsReset.textContent = "Connect your account to view usage.";
      return;
    }
    const max = Math.max(1, Number(credits.max || 1));
    const used = Math.min(max, Math.max(0, Number(credits.used || 0)));
    const leftPercent = credits.left_percent != null ? Math.max(0, Math.min(100, Math.round(Number(credits.left_percent) || 0))) : Math.max(0, Math.min(100, Math.round((max - used) / max * 100)));
    const usedPercent = Math.max(0, Math.min(100, 100 - leftPercent));
    settingsCreditsLabel.textContent = `${leftPercent}% left \xB7 ${used.toLocaleString()} / ${max.toLocaleString()}`;
    settingsCreditsFill.style.width = `${usedPercent > 0 ? Math.max(1.5, usedPercent) : 0}%`;
    settingsCreditsFill.dataset.level = usedPercent >= 85 ? "high" : usedPercent >= 55 ? "mid" : "low";
    const resetLabel = String(credits.reset_label || "").trim();
    const resetDays = Math.max(0, Math.ceil(Number(credits.reset_in_days || 0) || 0));
    const resetHours = Math.max(0, Math.ceil(Number(credits.reset_in_hours || 0) || 0));
    settingsCreditsReset.textContent = resetLabel || (resetDays > 0 ? `Resets in ${resetDays} day${resetDays === 1 ? "" : "s"}` : resetHours > 0 ? `Resets in ${resetHours} hour${resetHours === 1 ? "" : "s"}` : "");
  }
  function markSessionEstablished() {
    hasEstablishedSession = true;
    userSignedOutExplicitly = false;
  }
  function shouldKeepWorkspaceVisible() {
    return hasEstablishedSession && !userSignedOutExplicitly;
  }
  function updateAccountUi() {
    if (accountIndicator) {
      if (!isSignedIn && !shouldKeepWorkspaceVisible()) {
        accountIndicator.textContent = "Sign in required";
        accountIndicator.className = "brand-account";
        accountIndicator.title = "Sign in to Promptly";
        return;
      }
      const label = account?.displayName || account?.email || "Connected";
      accountIndicator.textContent = label;
      accountIndicator.className = "brand-account signed-in";
      accountIndicator.title = account?.email ? `Signed in as ${account.email}` : "Signed in";
    }
    if (settingsAccountName) {
      settingsAccountName.textContent = account?.displayName || account?.email || "\u2014";
    }
    if (settingsAccountEmail) {
      settingsAccountEmail.textContent = account?.email || "\u2014";
    }
    if (settingsAccountPlan) {
      settingsAccountPlan.textContent = account?.plan ? String(account.plan) : "\u2014";
    }
    updateCreditsUi();
  }
  function setSignedInUi(signedIn) {
    if (signedIn) {
      isSignedIn = true;
      markSessionEstablished();
    } else if (!shouldKeepWorkspaceVisible()) {
      isSignedIn = false;
    }
    if (signInGate) {
      const hideGate = shouldKeepWorkspaceVisible() || isSignedIn || authBootstrapPending;
      signInGate.classList.toggle("hidden", hideGate);
    }
    if (!isSignedIn && !shouldKeepWorkspaceVisible()) {
      draftView?.classList.add("hidden");
      refineView?.classList.add("hidden");
    } else if (refineView && !refineView.classList.contains("hidden")) {
    } else {
      showDraftView();
    }
    updateAccountUi();
  }
  function stopCreditsPolling() {
    if (creditsPollTimer) {
      clearInterval(creditsPollTimer);
      creditsPollTimer = null;
    }
  }
  function startCreditsPolling() {
    stopCreditsPolling();
    if (!isSignedIn || !config.token) return;
    creditsPollTimer = setInterval(() => {
      void refreshAccount({ silent: true });
    }, CREDITS_POLL_MS);
  }
  async function refreshAccount(options = {}) {
    const { silent = false } = options;
    if (!config.token) {
      if (!shouldKeepWorkspaceVisible()) {
        account = null;
        setSignedInUi(false);
        stopCreditsPolling();
      }
      return null;
    }
    try {
      account = await fetchAccount(config);
      setSignedInUi(true);
      startCreditsPolling();
      return account;
    } catch (error) {
      if (shouldKeepWorkspaceVisible()) {
        if (silent) {
          return account;
        }
        await reloadCredentialsFromDisk();
        if (config.token) {
          try {
            account = await fetchAccount(config);
            setSignedInUi(true);
            startCreditsPolling();
            return account;
          } catch {
          }
        }
      }
      account = null;
      if (!shouldKeepWorkspaceVisible()) {
        setSignedInUi(false);
        stopCreditsPolling();
      }
      if (!silent) {
        showError(String(error?.message || error || "Could not verify your Promptly account."));
      }
      return null;
    }
  }
  async function reloadCredentialsFromDisk() {
    if (window.promptlyCompanion?.refreshConfig) {
      const defaults = await window.promptlyCompanion.refreshConfig();
      mergeConfig({
        apiUrl: resolveApiUrl(null, defaults),
        token: defaults?.token || "",
        client: defaults?.client || "promptly-cursor"
      });
      return;
    }
    await bootstrapConfig();
  }
  function stopSignInPoll() {
    if (signInPollTimer) {
      clearInterval(signInPollTimer);
      signInPollTimer = null;
    }
  }
  function startSignInPoll() {
    stopSignInPoll();
    signInPollTimer = setInterval(() => {
      void attemptAutoConnectFromDisk({ silent: true }).then((connected) => {
        if (connected) {
          stopSignInPoll();
          clearStatus();
          showSuccess("Connected to Promptly.");
        }
      });
    }, 2e3);
  }
  async function attemptAutoConnectFromDisk(options = {}) {
    const { silent = true, notifyOnSuccess = false, clearSignedOut = true } = options;
    if (isSignedIn && config.token) return true;
    if (clearSignedOut && window.promptlyCompanion?.saveSettings) {
      await window.promptlyCompanion.saveSettings({ signedOut: false });
      userSignedOutExplicitly = false;
    }
    await reloadCredentialsFromDisk();
    if (!config.token) return false;
    await refreshAccount({ silent });
    if (isSignedIn || shouldKeepWorkspaceVisible()) {
      if (notifyOnSuccess) {
        clearStatus();
        showSuccess("Connected to Promptly.");
      }
      return true;
    }
    return false;
  }
  async function ensureAuthForAction() {
    await reloadCredentialsFromDisk();
    if (config.token) {
      await refreshAccount({ silent: true });
      if (config.token) return true;
    }
    showError("Sign in to Promptly to continue.");
    openSignInPage();
    return false;
  }
  async function tryRestoreSession(options = {}) {
    const { silent = true } = options;
    if (isSignedIn) return true;
    const settings = window.promptlyCompanion?.getSettings ? await window.promptlyCompanion.getSettings() : null;
    if (settings?.signedOut) return false;
    await reloadCredentialsFromDisk();
    if (!config.token) return false;
    await refreshAccount({ silent });
    return isSignedIn;
  }
  function openSignInPage() {
    const url = getSignInUrl(config.apiUrl);
    showStatus("Finish sign-in in your browser \u2014 this app connects automatically.", "loading", {
      autoFade: false
    });
    openExternalUrl(url);
    startSignInPoll();
  }
  function openAccountPage() {
    openExternalUrl(getAccountPageUrl(config.apiUrl));
  }
  function openStatisticsPage() {
    openExternalUrl(getStatisticsPageUrl(config.apiUrl));
  }
  function closeSettings() {
    settingsDialog?.close();
  }
  async function signOut() {
    stopSignInPoll();
    hasEstablishedSession = false;
    userSignedOutExplicitly = true;
    if (window.promptlyCompanion?.saveSettings) {
      await window.promptlyCompanion.saveSettings({ signedOut: true });
    }
    mergeConfig({ token: "" });
    account = null;
    stopCreditsPolling();
    setSignedInUi(false);
    settingsDialog?.close();
    clearStatus();
  }
  async function pasteToHostPrompt(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) {
      return { ok: false, error: "Nothing to paste." };
    }
    if (!window.promptlyCompanion?.pasteToHost) {
      return { ok: false, error: "Paste is only available in the desktop app on macOS." };
    }
    try {
      return await window.promptlyCompanion.pasteToHost(trimmed);
    } catch (error) {
      return { ok: false, error: String(error?.message || error || "Paste failed") };
    }
  }
  async function autoPasteToHost(text, options = {}) {
    const { silent = true } = options;
    const result = await pasteToHostPrompt(text);
    if (!result?.ok && result?.error) {
      if (!silent) {
        showError(String(result.error));
      }
    } else if (result?.ok && !silent) {
      showSuccess("Pasted");
    }
    return result;
  }
  function mapPromptlyError(error) {
    if (error?.outOfTokens || /weekly api token limit|token limit reached/i.test(String(error?.message || ""))) {
      return "Weekly token limit reached. Resets Sunday UTC.";
    }
    if (error?.needsSignIn || /auth token|sign in/i.test(String(error?.message || ""))) {
      return "Sign in to Promptly to continue.";
    }
    return String(error?.message || error || "Request failed");
  }
  function handleApiError(error) {
    if (error?.credits) {
      applyCredits(error.credits);
    }
    const message = mapPromptlyError(error);
    showError(message);
    if (error?.needsSignIn) {
      if (shouldKeepWorkspaceVisible()) {
        void ensureAuthForAction();
      } else {
        setSignedInUi(false);
      }
    }
  }
  function isLocalApiUrl(url) {
    try {
      const hostname = new URL(String(url || "")).hostname;
      return hostname === "localhost" || hostname === "127.0.0.1";
    } catch {
      return false;
    }
  }
  function resolveApiUrl(stored, defaults) {
    if (defaults?.isDevMode && defaults?.devApiUrl) {
      return defaults.devApiUrl;
    }
    const productionUrl = String(defaults?.productionApiUrl || PRODUCTION_API_URL).trim() || PRODUCTION_API_URL;
    const storedUrl = String(stored?.apiUrl || "").trim();
    if (storedUrl && !isLocalApiUrl(storedUrl)) {
      return storedUrl;
    }
    return String(defaults?.apiUrl || productionUrl).trim() || productionUrl;
  }
  async function bootstrapConfig() {
    let defaults = null;
    if (window.promptlyCompanion?.getConfig) {
      defaults = await window.promptlyCompanion.getConfig();
    }
    const apiUrl = resolveApiUrl(null, defaults);
    mergeConfig({
      apiUrl,
      token: defaults?.token || "",
      client: defaults?.client || "promptly-cursor"
    });
  }
  function isDraftSubstantive(text) {
    return countWords(text) >= 3;
  }
  function clearStatus() {
    if (statusFadeTimer) {
      clearTimeout(statusFadeTimer);
      statusFadeTimer = null;
    }
    statusBanner.classList.remove("fading");
    statusBanner.textContent = "";
    statusBanner.className = "status-banner hidden";
  }
  function showError(message) {
    showStatus(message, "error");
  }
  function setDraftBusy(busy) {
    if (draftBusyOverlay) {
      draftBusyOverlay.classList.toggle("hidden", !busy);
      draftBusyOverlay.setAttribute("aria-hidden", busy ? "false" : "true");
    }
    draftInput.readOnly = busy;
    if (draftMicBtn) {
      draftMicBtn.disabled = busy;
      if (busy) draftDictation.stop();
    }
  }
  function setPromptBusy(busy) {
    if (promptBusyOverlay) {
      promptBusyOverlay.classList.toggle("hidden", !busy);
      promptBusyOverlay.setAttribute("aria-hidden", busy ? "false" : "true");
    }
    promptInput.readOnly = busy;
  }
  function showDraftView() {
    draftView.classList.remove("hidden");
    refineView.classList.add("hidden");
  }
  function showRefineView() {
    draftView.classList.add("hidden");
    refineView.classList.remove("hidden");
  }
  function formatWordCount(text) {
    const n = countWords(text);
    return n === 1 ? "1 word" : `${n} words`;
  }
  function updateWordCountLabel(el, text) {
    if (!el) return;
    el.textContent = formatWordCount(text);
  }
  function syncDraftStrength() {
    updateStrengthUi(draftStrengthTrack, draftStrengthFill, draftInput.value, { aiEnhanced: false });
    updateWordCountLabel(draftWordCount, draftInput.value);
  }
  function syncPromptStrength() {
    updateStrengthUi(promptStrengthTrack, promptStrengthFill, promptInput.value, {
      aiEnhanced: promptAiEnhanced
    });
    updateWordCountLabel(promptWordCount, promptInput.value);
  }
  function resetFeedbackUi() {
    summarySlot.value = "";
    summarySlot.classList.add("hidden");
    followUpInput.value = "";
    followUpInput.readOnly = false;
    followUpInput.classList.remove("locked");
  }
  function showSummary(text) {
    const msg = String(text || "").trim();
    if (!msg) {
      summarySlot.value = "";
      summarySlot.classList.add("hidden");
      return;
    }
    summarySlot.value = msg;
    summarySlot.classList.remove("hidden");
  }
  function lockFollowUp() {
    followUpInput.readOnly = true;
    followUpInput.classList.add("locked");
    followUpDictation.stop();
    if (followUpMicBtn) followUpMicBtn.disabled = true;
  }
  function unlockFollowUp(clear) {
    followUpInput.readOnly = false;
    followUpInput.classList.remove("locked");
    if (followUpMicBtn) followUpMicBtn.disabled = !followUpDictation.isSupported();
    if (clear) {
      followUpInput.value = "";
    }
  }
  async function handleImprove() {
    stopAllDictation();
    const draft = String(draftInput.value || "").trim();
    if (!isDraftSubstantive(draft)) {
      showError("Write at least 3 words before improving.");
      return;
    }
    if (!config.token) {
      const ready = await ensureAuthForAction();
      if (!ready || !config.token) return;
    }
    if (isCreditsHardExhausted(account?.credits)) {
      showError("Weekly token limit reached. Resets Sunday UTC.");
      return;
    }
    clearStatus();
    improveBtn.disabled = true;
    improveBtn.textContent = "Improving\u2026";
    setDraftBusy(true);
    try {
      const { optimized, credits } = await improveInitialDraft(config, draft);
      if (credits) applyCredits(credits);
      promptInput.value = optimized;
      resetFeedbackUi();
      promptAiEnhanced = true;
      showRefineView();
      syncPromptStrength();
      const pastePromise = autoPasteToHost(optimized);
      await pastePromise;
      followUpInput.focus();
    } catch (error) {
      handleApiError(error);
    } finally {
      setDraftBusy(false);
      improveBtn.disabled = false;
      improveBtn.textContent = "Improve";
    }
  }
  async function handleRefine() {
    stopAllDictation();
    const currentPrompt = String(promptInput.value || "").trim();
    const feedback = String(followUpInput.value || "").trim();
    if (!currentPrompt) {
      showError("Add prompt text before refining.");
      return;
    }
    if (!feedback) {
      showError("Add follow-up feedback first.");
      return;
    }
    if (followUpInput.readOnly) {
      return;
    }
    if (!config.token) {
      const ready = await ensureAuthForAction();
      if (!ready || !config.token) return;
    }
    if (isCreditsHardExhausted(account?.credits)) {
      showError("Weekly token limit reached. Resets Sunday UTC.");
      return;
    }
    clearStatus();
    lockFollowUp();
    refineBtn.disabled = true;
    refineBtn.textContent = "Applying feedback\u2026";
    setPromptBusy(true);
    try {
      const result = await refineWithFeedback(config, currentPrompt, feedback);
      if (result.credits) applyCredits(result.credits);
      promptInput.value = result.prompt;
      showSummary(result.summary);
      promptAiEnhanced = true;
      syncPromptStrength();
      await autoPasteToHost(result.prompt);
      unlockFollowUp(true);
      followUpInput.focus();
    } catch (error) {
      handleApiError(error);
      unlockFollowUp(false);
    } finally {
      setPromptBusy(false);
      refineBtn.disabled = false;
      refineBtn.textContent = "Apply Feedback";
    }
  }
  function startNewSession() {
    stopAllDictation();
    setDraftBusy(false);
    setPromptBusy(false);
    draftInput.value = "";
    promptInput.value = "";
    resetFeedbackUi();
    promptAiEnhanced = false;
    syncDraftStrength();
    syncPromptStrength();
    clearStatus();
    showDraftView();
    draftInput.focus();
  }
  var isCollapsed = false;
  var COLLAPSED_DRAG_THRESHOLD_PX = 6;
  var collapsedPointer = null;
  function applyCollapsedUi(collapsed) {
    const next = Boolean(collapsed);
    isCollapsed = next;
    document.body.classList.toggle("collapsed", next);
    if (appShell) {
      appShell.classList.toggle("hidden", next);
    }
    if (collapsedBar) {
      collapsedBar.classList.toggle("hidden", !next);
    }
  }
  async function setCollapsed(collapsed) {
    const next = Boolean(collapsed);
    if (isCollapsed === next) {
      return;
    }
    if (next && settingsDialog.open) {
      settingsDialog.close();
    }
    if (!window.promptlyCompanion?.setCollapsed) {
      applyCollapsedUi(next);
      return;
    }
    const result = await window.promptlyCompanion.setCollapsed(next);
    if (result?.ok) {
      applyCollapsedUi(next);
    }
  }
  function clearCollapsedPointerListeners(listeners) {
    window.removeEventListener("pointermove", listeners.onMove);
    window.removeEventListener("pointerup", listeners.onUp);
    window.removeEventListener("pointercancel", listeners.onUp);
  }
  function setupWindowHeightResize() {
    if (!windowResizeGrip || !window.promptlyCompanion?.getWindowBounds || !window.promptlyCompanion?.setWindowSize) {
      return;
    }
    let resizePointer = null;
    const onMove = (event) => {
      if (!resizePointer || event.pointerId !== resizePointer.pointerId) {
        return;
      }
      const deltaY = event.screenY - resizePointer.startY;
      void window.promptlyCompanion.setWindowSize({
        height: resizePointer.startHeight + deltaY
      });
    };
    const onUp = (event) => {
      if (!resizePointer || event.pointerId !== resizePointer.pointerId) {
        return;
      }
      resizePointer = null;
      windowResizeGrip.classList.remove("is-dragging");
      try {
        windowResizeGrip.releasePointerCapture(event.pointerId);
      } catch {
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    windowResizeGrip.addEventListener("pointerdown", (event) => {
      if (isCollapsed || event.button !== 0 || resizePointer) {
        return;
      }
      event.preventDefault();
      void window.promptlyCompanion.getWindowBounds().then((bounds) => {
        if (!bounds || resizePointer) {
          return;
        }
        resizePointer = {
          pointerId: event.pointerId,
          startY: event.screenY,
          startHeight: bounds.height
        };
        windowResizeGrip.classList.add("is-dragging");
        windowResizeGrip.setPointerCapture(event.pointerId);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });
    });
  }
  function setupCollapsedBarInteraction() {
    if (!collapsedBar) {
      return;
    }
    collapsedBar.addEventListener("keydown", (event) => {
      if (!isCollapsed) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void setCollapsed(false);
      }
    });
    collapsedBar.addEventListener("pointerdown", (event) => {
      if (!isCollapsed || event.button !== 0 || collapsedPointer) {
        return;
      }
      event.preventDefault();
      void beginCollapsedPointer(event);
    });
  }
  async function beginCollapsedPointer(event) {
    if (!window.promptlyCompanion?.getWindowBounds || !window.promptlyCompanion?.setWindowPosition) {
      return;
    }
    const bounds = await window.promptlyCompanion.getWindowBounds();
    if (!bounds) {
      return;
    }
    collapsedPointer = {
      pointerId: event.pointerId,
      offsetX: event.screenX - bounds.x,
      offsetY: event.screenY - bounds.y,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false
    };
    collapsedBar.classList.remove("is-dragging");
    collapsedBar.setPointerCapture(event.pointerId);
    const onMove = (moveEvent) => {
      if (!collapsedPointer || moveEvent.pointerId !== collapsedPointer.pointerId) {
        return;
      }
      const dx = moveEvent.clientX - collapsedPointer.startX;
      const dy = moveEvent.clientY - collapsedPointer.startY;
      if (!collapsedPointer.dragging) {
        if (Math.hypot(dx, dy) < COLLAPSED_DRAG_THRESHOLD_PX) {
          return;
        }
        collapsedPointer.dragging = true;
        collapsedBar.classList.add("is-dragging");
      }
      void window.promptlyCompanion.setWindowPosition({
        x: moveEvent.screenX - collapsedPointer.offsetX,
        y: moveEvent.screenY - collapsedPointer.offsetY
      });
    };
    const onUp = (upEvent) => {
      if (!collapsedPointer || upEvent.pointerId !== collapsedPointer.pointerId) {
        return;
      }
      const wasDrag = collapsedPointer.dragging;
      collapsedPointer = null;
      collapsedBar.classList.remove("is-dragging");
      try {
        collapsedBar.releasePointerCapture(upEvent.pointerId);
      } catch {
      }
      clearCollapsedPointerListeners({ onMove, onUp });
      if (!wasDrag) {
        void setCollapsed(false);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }
  async function maybeShowPermissionsOnboarding() {
    if (!permissionsDialog || !window.promptlyCompanion?.getSettings) {
      return;
    }
    const settings = await window.promptlyCompanion.getSettings();
    if (settings.permissionsOnboardingComplete) {
      return;
    }
    const appInfo = window.promptlyCompanion.getAppInfo ? await window.promptlyCompanion.getAppInfo() : { name: "Promptly Companion", isPackaged: true };
    if (permissionsAppName) {
      permissionsAppName.textContent = appInfo.name || "Promptly Companion";
    }
    if (permissionsDevHint) {
      permissionsDevHint.classList.toggle("hidden", Boolean(appInfo.isPackaged));
    }
    if (permissionsFollowupHint) {
      permissionsFollowupHint.classList.add("hidden");
    }
    permissionsDialog.showModal();
  }
  async function handlePermissionsAllow() {
    if (!window.promptlyCompanion?.requestAllPermissions) {
      await finishPermissionsOnboarding();
      return;
    }
    if (permissionsAllowBtn) {
      permissionsAllowBtn.disabled = true;
      permissionsAllowBtn.textContent = "Requesting\u2026";
    }
    try {
      const result = await window.promptlyCompanion.requestAllPermissions();
      const needsSettings = !result?.microphone?.granted || !result?.accessibility?.granted;
      if (needsSettings && permissionsFollowupHint) {
        permissionsFollowupHint.classList.remove("hidden");
        if (permissionsAppName) {
          permissionsAppName.textContent = result?.appName || "Promptly Companion";
        }
        showError(
          `Enable ${result?.appName || "Promptly Companion"} under Microphone and Accessibility in the System Settings window, then tap Allow access again or continue.`
        );
        return;
      }
      clearStatus();
      await finishPermissionsOnboarding();
    } finally {
      if (permissionsAllowBtn) {
        permissionsAllowBtn.disabled = false;
        permissionsAllowBtn.textContent = "Allow access";
      }
    }
  }
  async function finishPermissionsOnboarding() {
    if (window.promptlyCompanion?.completePermissionsOnboarding) {
      await window.promptlyCompanion.completePermissionsOnboarding();
    }
    permissionsDialog?.close();
  }
  permissionsAllowBtn?.addEventListener("click", () => void handlePermissionsAllow());
  permissionsSkipBtn?.addEventListener("click", () => void finishPermissionsOnboarding());
  function openSettings() {
    void loadSettingsIntoForm();
    void updateAppVersionLine();
    updateAccountUi();
    settingsDialog.showModal();
  }
  async function updateAppVersionLine() {
    if (!appVersionLine || !window.promptlyCompanion?.getAppInfo) {
      return;
    }
    const appInfo = await window.promptlyCompanion.getAppInfo();
    const version = String(appInfo?.version || "").trim() || "unknown";
    const runtime = appInfo?.isPackaged ? "installed" : "dev (Electron)";
    appVersionLine.textContent = `Version ${version} \xB7 ${runtime}`;
  }
  async function loadSettingsIntoForm() {
    if (!window.promptlyCompanion?.getSettings) {
      return;
    }
    const settings = await window.promptlyCompanion.getSettings();
    loadingSettingsForm = true;
    if (autoOpenClaude) autoOpenClaude.checked = Boolean(settings.autoOpen?.claude_code);
    if (autoOpenCodex) autoOpenCodex.checked = Boolean(settings.autoOpen?.codex);
    if (autoOpenCursor) autoOpenCursor.checked = Boolean(settings.autoOpen?.cursor);
    if (openOnLaunch) openOnLaunch.checked = settings.openOnCompanionLaunch !== false;
    loadingSettingsForm = false;
    if (settingsSignOutBtn) {
      settingsSignOutBtn.disabled = !isSignedIn;
    }
  }
  async function saveCompanionSettingsFromForm() {
    if (loadingSettingsForm || !window.promptlyCompanion?.saveSettings) {
      return;
    }
    await window.promptlyCompanion.saveSettings({
      autoOpen: {
        claude_code: Boolean(autoOpenClaude?.checked),
        codex: Boolean(autoOpenCodex?.checked),
        cursor: Boolean(autoOpenCursor?.checked)
      },
      openOnCompanionLaunch: Boolean(openOnLaunch?.checked)
    });
  }
  function wireSettingsAutoSave() {
    for (const input of [autoOpenClaude, autoOpenCodex, autoOpenCursor, openOnLaunch]) {
      input?.addEventListener("change", () => {
        void saveCompanionSettingsFromForm();
      });
    }
  }
  function showSuccess(message) {
    showStatus(message, "success");
  }
  copyBtn?.addEventListener("click", async () => {
    const text = String(promptInput.value || "").trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    const prev = copyBtn.textContent;
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = prev;
    }, 1200);
  });
  pasteBtn?.addEventListener("click", async () => {
    const text = String(promptInput.value || "").trim();
    if (!text) {
      showError("Add prompt text before pasting.");
      return;
    }
    clearStatus();
    if (pasteBtn) {
      pasteBtn.disabled = true;
      pasteBtn.textContent = "Pasting\u2026";
    }
    try {
      await autoPasteToHost(text, { silent: false });
    } finally {
      if (pasteBtn) {
        pasteBtn.disabled = false;
        pasteBtn.textContent = "Paste";
      }
    }
  });
  signInBtn?.addEventListener("click", () => openSignInPage());
  newBtn?.addEventListener("click", () => {
    if (window.promptlyCompanion?.openNewWindow) {
      void window.promptlyCompanion.openNewWindow();
      return;
    }
    startNewSession();
  });
  collapseBtn?.addEventListener("click", () => void setCollapsed(true));
  closeBtn?.addEventListener("click", () => {
    if (window.promptlyCompanion?.closeWindow) {
      void window.promptlyCompanion.closeWindow();
    }
  });
  newPromptBtn?.addEventListener("click", startNewSession);
  settingsBtn?.addEventListener("click", openSettings);
  settingsCloseBtn?.addEventListener("click", closeSettings);
  settingsStatisticsBtn?.addEventListener("click", () => openStatisticsPage());
  settingsManageAccountBtn?.addEventListener("click", () => openAccountPage());
  settingsSignOutBtn?.addEventListener("click", () => void signOut());
  wireSettingsAutoSave();
  improveBtn?.addEventListener("click", () => void handleImprove());
  refineBtn?.addEventListener("click", () => void handleRefine());
  draftInput?.addEventListener("keydown", (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
      ev.preventDefault();
      void handleImprove();
    }
  });
  followUpInput?.addEventListener("keydown", (ev) => {
    if (followUpInput.readOnly) return;
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
      ev.preventDefault();
      void handleRefine();
    }
  });
  draftInput?.addEventListener("input", syncDraftStrength);
  promptInput?.addEventListener("input", syncPromptStrength);
  void bootstrapConfig().then(async () => {
    setupDictationUi();
    setupCollapsedBarInteraction();
    setupWindowHeightResize();
    syncDraftStrength();
    syncPromptStrength();
    await refreshAccount({ silent: true });
    if (!isSignedIn) {
      await tryRestoreSession({ silent: true });
    }
    if (!isSignedIn) {
      await attemptAutoConnectFromDisk({ silent: true });
    }
    authBootstrapPending = false;
    if (isSignedIn) {
      markSessionEstablished();
    }
    setSignedInUi(isSignedIn);
    await maybeShowPermissionsOnboarding();
  });
  window.promptlyCompanion?.onWindowFocus?.(() => {
    if (userSignedOutExplicitly) return;
    void (async () => {
      await reloadCredentialsFromDisk();
      if (config.token) {
        await refreshAccount({ silent: true });
        return;
      }
      if (shouldKeepWorkspaceVisible()) {
        await attemptAutoConnectFromDisk({ silent: true });
        return;
      }
      const connected = await tryRestoreSession({ silent: true });
      if (!connected) {
        await attemptAutoConnectFromDisk({ silent: true });
      }
    })();
  });
})();
