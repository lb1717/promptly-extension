import { transcribeAudio } from "./api.js";

/** @type {ReturnType<typeof createDictationController> | null} */
let activeController = null;

const MIC_SVG =
  '<svg class="mic-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V19H9v2h6v-2h-2v-1.08A7 7 0 0 0 19 11h-2Z"/></svg>';

async function ensureMicrophoneAccess(onError) {
  const appInfo = window.promptlyCompanion?.getAppInfo
    ? await window.promptlyCompanion.getAppInfo()
    : { isPackaged: true, name: "Promptly Companion" };

  if (window.promptlyCompanion?.requestMicrophoneAccess) {
    const access = await window.promptlyCompanion.requestMicrophoneAccess();
    if (!access?.granted) {
      if (access?.prompted) {
        onError?.("Microphone access was denied. Tap the mic again after allowing access.");
      } else if (access?.openedSettings) {
        const label = appInfo.isPackaged ? appInfo.name || "Promptly Companion" : "Electron";
        onError?.(
          `Enable ${label} under Privacy & Security → Microphone in System Settings, then tap the mic again.`
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

/**
 * @param {{
 *   textarea: HTMLTextAreaElement | null;
 *   micButton: HTMLButtonElement | null;
 *   getConfig: () => { apiUrl: string; token: string; client: string };
 *   onError?: (message: string) => void;
 *   onStateChange?: (active: boolean) => void;
 *   overlayMode?: "full" | "compact";
 * }} options
 */
export function createDictationController(options) {
  const { textarea, micButton, getConfig, onError, onStateChange } = options;
  const overlayMode = options.overlayMode === "compact" ? "compact" : "full";
  /** @type {MediaRecorder | null} */
  let recorder = null;
  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {Blob[]} */
  let chunks = [];
  let active = false;
  let transcribing = false;
  let baseText = "";
  /** @type {HTMLDivElement | null} */
  let statusEl = null;
  /** @type {HTMLDivElement | null} */
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
          <div class="dictation-recording-ripples" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <button type="button" class="dictation-recording-mic" aria-label="Stop recording">
            ${MIC_SVG}
          </button>
          <p class="dictation-recording-hint">Tap to stop recording</p>
          <p class="dictation-recording-transcribing hidden">Converting speech to text</p>
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

  /** @param {"idle" | "listening" | "transcribing"} state */
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
        overlay.querySelector(".dictation-recording-mic")?.classList.remove("hidden");
        overlay.querySelector(".dictation-recording-hint")?.classList.remove("hidden");
        overlay.querySelector(".dictation-recording-transcribing")?.classList.add("hidden");
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
      const bigMic = overlay.querySelector(".dictation-recording-mic");
      const hint = overlay.querySelector(".dictation-recording-hint");
      const transcribingLabel = overlay.querySelector(".dictation-recording-transcribing");

      if (state === "listening") {
        overlay.classList.remove("dictation-recording-overlay--transcribing");
        ripples?.classList.remove("hidden");
        bigMic?.classList.remove("hidden");
        hint?.classList.remove("hidden");
        transcribingLabel?.classList.add("hidden");
      } else {
        overlay.classList.add("dictation-recording-overlay--transcribing");
        ripples?.classList.add("hidden");
        bigMic?.classList.add("hidden");
        hint?.classList.add("hidden");
        transcribingLabel?.classList.remove("hidden");
      }
    } else if (compactStatus) {
      compactStatus.className =
        state === "transcribing"
          ? "dictation-status dictation-status--transcribing"
          : "dictation-status hidden";
      compactStatus.textContent = state === "transcribing" ? "converting speech to text" : "";
    }

    if (micButton) {
      micButton.setAttribute(
        "aria-label",
        state === "listening" ? "Stop dictation" : "Converting speech to text"
      );
    }
  }

  function isSupported() {
    return Boolean(
      textarea &&
      micButton &&
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined" &&
      getConfig
    );
  }

  function setRecordingUi(recording) {
    if (!micButton) return;
    micButton.classList.toggle("dictation-active", recording);
    micButton.setAttribute("aria-pressed", recording ? "true" : "false");
    if (transcribing) {
      micButton.title = "Converting speech to text…";
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
          micButton.title = "Converting speech to text…";
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

    const config = getConfig();
    if (!config?.token) {
      onError?.("Connect in Settings before using dictation.");
      resetAfterDictation();
      return;
    }

    try {
      const text = await transcribeAudio(config, blob);
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

export function stopAllDictation() {
  activeController?.stop();
}
