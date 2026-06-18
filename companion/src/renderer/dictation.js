import { transcribeAudio } from "./api.js";

/** @type {ReturnType<typeof createDictationController> | null} */
let activeController = null;

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
 * }} options
 */
export function createDictationController(options) {
  const { textarea, micButton, getConfig, onError, onStateChange } = options;
  /** @type {MediaRecorder | null} */
  let recorder = null;
  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {Blob[]} */
  let chunks = [];
  let active = false;
  let transcribing = false;
  let baseText = "";

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
      micButton.title = "Transcribing…";
    } else {
      micButton.title = recording ? "Stop and transcribe" : "Start dictation";
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

  function stop() {
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        cleanupStream();
      }
    } else {
      cleanupStream();
    }
    active = false;
    if (!transcribing && activeController === api) {
      activeController = null;
    }
    if (!transcribing) {
      setRecordingUi(false);
    }
  }

  async function transcribeRecording() {
    if (!chunks.length) {
      onError?.("No audio captured. Try speaking a little longer.");
      return;
    }

    const mimeType = recorder?.mimeType || chunks[0]?.type || "audio/webm";
    const blob = new Blob(chunks, { type: mimeType });
    cleanupStream();

    if (blob.size < 800) {
      onError?.("No speech detected. Try again closer to the mic.");
      return;
    }

    const config = getConfig();
    if (!config?.token) {
      onError?.("Connect in Settings before using dictation.");
      return;
    }

    transcribing = true;
    setRecordingUi(false);
    if (micButton) {
      micButton.disabled = true;
    }

    try {
      const text = await transcribeAudio(config, blob);
      appendTranscript(text);
    } catch (error) {
      onError?.(String(error?.message || error || "Transcription failed."));
    } finally {
      transcribing = false;
      if (micButton) {
        micButton.disabled = false;
      }
      if (activeController === api) {
        activeController = null;
      }
      setRecordingUi(false);
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
