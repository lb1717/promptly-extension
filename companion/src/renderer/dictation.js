/** @type {ReturnType<typeof createDictationController> | null} */
let activeController = null;

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

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
    return true;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return true;
  } catch {
    if (window.promptlyCompanion?.requestMicrophoneAccess) {
      const access = await window.promptlyCompanion.requestMicrophoneAccess();
      if (access?.openedSettings) {
        onError?.(
          "Microphone access is required. Allow Promptly Companion in the System Settings window that just opened, then tap the mic again."
        );
      } else {
        onError?.("Microphone access is required for dictation.");
      }
    } else {
      onError?.("Microphone access is required for dictation.");
    }
    return false;
  }
}

/**
 * @param {{
 *   textarea: HTMLTextAreaElement | null;
 *   micButton: HTMLButtonElement | null;
 *   onError?: (message: string) => void;
 *   onStateChange?: (active: boolean) => void;
 * }} options
 */
export function createDictationController(options) {
  const { textarea, micButton, onError, onStateChange } = options;
  /** @type {SpeechRecognition | null} */
  let recognition = null;
  let active = false;
  let baseText = "";
  let committed = "";

  function isSupported() {
    return Boolean(getSpeechRecognitionCtor() && textarea && micButton);
  }

  function setRecordingUi(recording) {
    if (!micButton) return;
    micButton.classList.toggle("dictation-active", recording);
    micButton.setAttribute("aria-pressed", recording ? "true" : "false");
    micButton.title = recording ? "Stop dictation" : "Start dictation";
    onStateChange?.(recording);
  }

  function renderTranscript(finalText, interimText) {
    if (!textarea) return;
    const prefix = baseText.trimEnd();
    const spoken = [committed, finalText, interimText].filter(Boolean).join(" ").trim();
    if (!spoken) {
      textarea.value = prefix;
    } else if (!prefix) {
      textarea.value = spoken;
    } else {
      const joiner = prefix.endsWith("\n") ? "" : " ";
      textarea.value = `${prefix}${joiner}${spoken}`;
    }
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function stop() {
    if (!active) return;
    active = false;
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.stop();
      } catch {
        /* ignore */
      }
      recognition = null;
    }
    if (activeController === api) {
      activeController = null;
    }
    setRecordingUi(false);
  }

  function handleError(errorCode) {
    const code = String(errorCode || "").trim();
    if (!code || code === "aborted" || code === "no-speech") {
      return;
    }
    if (code === "not-allowed" || code === "service-not-allowed") {
      void ensureMicrophoneAccess(onError);
      return;
    }
    onError?.(`Dictation error: ${code}`);
  }

  async function start() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || !textarea || !micButton) {
      onError?.("Dictation is not supported in this environment.");
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

    baseText = textarea.value;
    committed = "";
    recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = String(result[0]?.transcript || "");
        if (result.isFinal) {
          finalChunk += transcript;
        } else {
          interim += transcript;
        }
      }
      if (finalChunk.trim()) {
        committed = `${committed} ${finalChunk}`.trim();
      }
      renderTranscript(committed, interim.trim());
    };

    recognition.onerror = (event) => {
      handleError(event.error);
      stop();
    };

    recognition.onend = () => {
      if (!active) {
        setRecordingUi(false);
        return;
      }
      try {
        recognition?.start();
      } catch {
        stop();
      }
    };

    try {
      recognition.start();
      active = true;
      activeController = api;
      setRecordingUi(true);
    } catch (error) {
      onError?.(String(error?.message || error || "Could not start dictation."));
      stop();
    }
  }

  async function toggle() {
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
      return active;
    }
  };

  return api;
}

export function stopAllDictation() {
  activeController?.stop();
}
