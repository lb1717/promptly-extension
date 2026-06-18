import { improveInitialDraft, refineWithFeedback, fetchSuggestions } from "./api.js";
import { countWords } from "./further-improve.js";
import { updateStrengthUi } from "./strength.js";
import { createDictationController, stopAllDictation } from "./dictation.js";

const STORAGE_KEY = "promptly-companion-config";
const PRODUCTION_API_URL = "https://promptly-labs.com";

/** @type {{ apiUrl: string; token: string; client: string }} */
let config = { apiUrl: "", token: "", client: "promptly-cursor" };

const statusBanner = document.getElementById("status-banner");
const draftView = document.getElementById("draft-view");
const refineView = document.getElementById("refine-view");
const draftInput = document.getElementById("draft-input");
const draftMicBtn = document.getElementById("draft-mic-btn");
const improveBtn = document.getElementById("improve-btn");
const chipGrid = document.getElementById("chip-grid");
const promptInput = document.getElementById("prompt-input");
const copyBtn = document.getElementById("copy-btn");
const pasteBtn = document.getElementById("paste-btn");
const summarySlot = document.getElementById("summary-slot");
const followUpInput = document.getElementById("follow-up-input");
const followUpMicBtn = document.getElementById("follow-up-mic-btn");
const refineBtn = document.getElementById("refine-btn");
const newPromptBtn = document.getElementById("new-prompt-btn");
const newBtn = document.getElementById("new-btn");
const collapseBtn = document.getElementById("collapse-btn");
const closeBtn = document.getElementById("close-btn");
const appShell = document.getElementById("app-shell");
const miniExpandBtn = document.getElementById("mini-expand-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsDialog = document.getElementById("settings-dialog");
const permissionsDialog = document.getElementById("permissions-dialog");
const permissionsAllowBtn = document.getElementById("permissions-allow-btn");
const permissionsSkipBtn = document.getElementById("permissions-skip-btn");
const permissionsDevHint = document.getElementById("permissions-dev-hint");
const permissionsFollowupHint = document.getElementById("permissions-followup-hint");
const permissionsAppName = document.getElementById("permissions-app-name");
const settingsForm = document.getElementById("settings-form");
const settingsCancel = document.getElementById("settings-cancel");
const apiIndicator = document.getElementById("api-indicator");
const apiUrlInput = document.getElementById("api-url-input");
const tokenInput = document.getElementById("token-input");
const clientInput = document.getElementById("client-input");
const autoOpenClaude = document.getElementById("auto-open-claude");
const autoOpenCodex = document.getElementById("auto-open-codex");
const autoOpenCursor = document.getElementById("auto-open-cursor");
const openOnLaunch = document.getElementById("open-on-launch");
const draftStrengthTrack = document.getElementById("draft-strength-track");
const draftStrengthFill = document.getElementById("draft-strength-fill");
const promptStrengthTrack = document.getElementById("prompt-strength-track");
const promptStrengthFill = document.getElementById("prompt-strength-fill");

const draftWordCount = document.getElementById("draft-word-count");
const promptWordCount = document.getElementById("prompt-word-count");
const draftBusyOverlay = document.getElementById("draft-busy-overlay");
const promptBusyOverlay = document.getElementById("prompt-busy-overlay");

const appliedChipIds = new Set();
let promptAiEnhanced = false;
/** @type {Array<{ id: string; label: string; snippet: string }>} */
let suggestionOptions = [];

const draftDictation = createDictationController({
  textarea: draftInput,
  micButton: draftMicBtn,
  onError: showError
});

const followUpDictation = createDictationController({
  textarea: followUpInput,
  micButton: followUpMicBtn,
  onError: showError
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

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function mergeConfig(partial) {
  config = {
    apiUrl: String(partial?.apiUrl || config.apiUrl || "").trim(),
    token: String(partial?.token || config.token || "").trim(),
    client: String(partial?.client || config.client || "promptly-cursor").trim()
  };
  saveConfig();
}

function updateApiIndicator() {
  if (!apiIndicator) return;
  const url = String(config.apiUrl || "").trim();
  if (!url) {
    apiIndicator.textContent = "Not connected";
    apiIndicator.className = "api-indicator";
    return;
  }
  let label = url;
  let kind = "prod";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      kind = "local";
      label = `local ${parsed.port || "3000"}`;
    } else {
      label = parsed.hostname.replace(/^www\./, "");
    }
  } catch {
    /* keep raw url */
  }
  apiIndicator.textContent = label;
  apiIndicator.className = `api-indicator ${kind}`;
  apiIndicator.title = `API: ${url}`;
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
  const stored = loadStoredConfig();
  if (window.promptlyCompanion?.getConfig) {
    const defaults = await window.promptlyCompanion.getConfig();
    const apiUrl = resolveApiUrl(stored, defaults);
    mergeConfig({
      apiUrl,
      token: stored?.token || defaults.token,
      client: stored?.client || defaults.client
    });
    if (stored?.apiUrl && isLocalApiUrl(stored.apiUrl) && apiUrl !== stored.apiUrl) {
      saveConfig();
    }
  } else if (stored) {
    mergeConfig({
      ...stored,
      apiUrl: isLocalApiUrl(stored.apiUrl) ? PRODUCTION_API_URL : stored.apiUrl
    });
  } else {
    mergeConfig({ apiUrl: PRODUCTION_API_URL, token: "", client: "promptly-cursor" });
  }
  updateApiIndicator();
}

function isDraftSubstantive(text) {
  return countWords(text) >= 3;
}

function showStatus(message, kind = "loading") {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${kind}`;
  statusBanner.classList.remove("hidden");
}

function clearStatus() {
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

function renderChips() {
  chipGrid.innerHTML = "";
  appliedChipIds.clear();
  for (const opt of suggestionOptions) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = opt.label;
    chip.dataset.id = opt.id;
    chip.addEventListener("click", () => {
      if (appliedChipIds.has(opt.id)) return;
      const current = String(promptInput.value || "").trim();
      const snippet = String(opt.snippet || "").trim();
      promptInput.value = current ? `${current}\n\n${snippet}` : snippet;
      appliedChipIds.add(opt.id);
      chip.classList.add("applied");
      promptInput.focus();
      syncPromptStrength();
    });
    chipGrid.appendChild(chip);
  }
}

async function loadSuggestionsForPrompt(text) {
  if (!config.token) {
    suggestionOptions = [];
    renderChips();
    return;
  }
  chipGrid.innerHTML = '<span class="chip-loading">Loading suggestions…</span>';
  try {
    suggestionOptions = await fetchSuggestions(config, text);
  } catch {
    suggestionOptions = [];
  }
  renderChips();
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
    showError("Connect in Settings — paste a device token (pt_…).");
    settingsDialog.showModal();
    return;
  }

  clearStatus();
  improveBtn.disabled = true;
  improveBtn.textContent = "Improving…";
  setDraftBusy(true);

  try {
    const { optimized } = await improveInitialDraft(config, draft);

    promptInput.value = optimized;
    resetFeedbackUi();
    promptAiEnhanced = true;
    showRefineView();
    await loadSuggestionsForPrompt(optimized);
    syncPromptStrength();
    followUpInput.focus();
  } catch (error) {
    showError(String(error?.message || error || "Improve failed"));
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

  clearStatus();
  lockFollowUp();
  refineBtn.disabled = true;
  refineBtn.textContent = "Applying feedback…";
  setPromptBusy(true);

  try {
    const result = await refineWithFeedback(config, currentPrompt, feedback);

    promptInput.value = result.prompt;
    showSummary(result.summary);
    unlockFollowUp(true);
    promptAiEnhanced = true;
    syncPromptStrength();
    followUpInput.focus();
  } catch (error) {
    showError(String(error?.message || error || "Refine failed"));
    unlockFollowUp(false);
  } finally {
    setPromptBusy(false);
    refineBtn.disabled = false;
    refineBtn.textContent = "Apply feedback";
  }
}

function startNewSession() {
  stopAllDictation();
  setDraftBusy(false);
  setPromptBusy(false);
  draftInput.value = "";
  promptInput.value = "";
  resetFeedbackUi();
  chipGrid.innerHTML = "";
  suggestionOptions = [];
  appliedChipIds.clear();
  promptAiEnhanced = false;
  syncDraftStrength();
  syncPromptStrength();
  clearStatus();
  showDraftView();
  draftInput.focus();
}

let isCollapsed = false;

function applyCollapsedUi(collapsed) {
  const next = Boolean(collapsed);
  isCollapsed = next;
  document.body.classList.toggle("collapsed", next);
  if (appShell) {
    appShell.classList.toggle("hidden", next);
  }
  if (miniExpandBtn) {
    miniExpandBtn.classList.toggle("hidden", !next);
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

async function maybeShowPermissionsOnboarding() {
  if (!permissionsDialog || !window.promptlyCompanion?.getSettings) {
    return;
  }
  const settings = await window.promptlyCompanion.getSettings();
  if (settings.permissionsOnboardingComplete) {
    return;
  }

  const appInfo = window.promptlyCompanion.getAppInfo
    ? await window.promptlyCompanion.getAppInfo()
    : { name: "Promptly Companion", isPackaged: true };

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
    permissionsAllowBtn.textContent = "Requesting…";
  }
  try {
    const result = await window.promptlyCompanion.requestAllPermissions();
    const needsSettings =
      !result?.microphone?.granted || !result?.accessibility?.granted;
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
  apiUrlInput.value = config.apiUrl;
  tokenInput.value = config.token;
  clientInput.value = config.client;
  void loadSettingsIntoForm();
  settingsDialog.showModal();
}

async function loadSettingsIntoForm() {
  if (!window.promptlyCompanion?.getSettings) {
    return;
  }
  const settings = await window.promptlyCompanion.getSettings();
  if (autoOpenClaude) autoOpenClaude.checked = Boolean(settings.autoOpen?.claude_code);
  if (autoOpenCodex) autoOpenCodex.checked = Boolean(settings.autoOpen?.codex);
  if (autoOpenCursor) autoOpenCursor.checked = Boolean(settings.autoOpen?.cursor);
  if (openOnLaunch) openOnLaunch.checked = Boolean(settings.openOnCompanionLaunch);
}

async function saveCompanionSettingsFromForm() {
  if (!window.promptlyCompanion?.saveSettings) {
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
  if (!window.promptlyCompanion?.pasteToHost) {
    showError("Paste is only available in the desktop app on macOS.");
    return;
  }
  clearStatus();
  if (pasteBtn) {
    pasteBtn.disabled = true;
    pasteBtn.textContent = "Pasting…";
  }
  try {
    const result = await window.promptlyCompanion.pasteToHost(text);
    if (!result?.ok) {
      showError(String(result?.error || "Paste failed"));
      return;
    }
    const host = result.host ? ` into ${result.host}` : "";
    showSuccess(`Pasted${host}`);
  } catch (error) {
    showError(String(error?.message || error || "Paste failed"));
  } finally {
    if (pasteBtn) {
      pasteBtn.disabled = false;
      pasteBtn.textContent = "Paste";
    }
  }
});

newBtn?.addEventListener("click", () => {
  if (window.promptlyCompanion?.openNewWindow) {
    void window.promptlyCompanion.openNewWindow();
    return;
  }
  startNewSession();
});
collapseBtn?.addEventListener("click", () => void setCollapsed(true));
miniExpandBtn?.addEventListener("click", () => void setCollapsed(false));
closeBtn?.addEventListener("click", () => {
  if (window.promptlyCompanion?.closeWindow) {
    void window.promptlyCompanion.closeWindow();
  }
});
newPromptBtn?.addEventListener("click", startNewSession);
settingsBtn?.addEventListener("click", openSettings);
settingsCancel?.addEventListener("click", () => settingsDialog.close());
settingsForm?.addEventListener("submit", (ev) => {
  ev.preventDefault();
  mergeConfig({
    apiUrl: apiUrlInput.value,
    token: tokenInput.value,
    client: clientInput.value
  });
  void saveCompanionSettingsFromForm();
  updateApiIndicator();
  settingsDialog.close();
  clearStatus();
});

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
  syncDraftStrength();
  syncPromptStrength();
  await maybeShowPermissionsOnboarding();
});
