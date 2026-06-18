import { improveInitialDraft, refineWithFeedback, fetchSuggestions } from "./api.js";
import { countWords } from "./further-improve.js";
import { updateStrengthUi } from "./strength.js";

const STORAGE_KEY = "promptly-companion-config";
const PRODUCTION_API_URL = "https://promptly-labs.com";

/** @type {{ apiUrl: string; token: string; client: string }} */
let config = { apiUrl: "", token: "", client: "promptly-cursor" };

const statusBanner = document.getElementById("status-banner");
const draftView = document.getElementById("draft-view");
const refineView = document.getElementById("refine-view");
const draftInput = document.getElementById("draft-input");
const improveBtn = document.getElementById("improve-btn");
const chipGrid = document.getElementById("chip-grid");
const promptInput = document.getElementById("prompt-input");
const copyBtn = document.getElementById("copy-btn");
const summarySlot = document.getElementById("summary-slot");
const followUpInput = document.getElementById("follow-up-input");
const refineBtn = document.getElementById("refine-btn");
const newBtn = document.getElementById("new-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsDialog = document.getElementById("settings-dialog");
const settingsForm = document.getElementById("settings-form");
const settingsCancel = document.getElementById("settings-cancel");
const apiIndicator = document.getElementById("api-indicator");
const apiUrlInput = document.getElementById("api-url-input");
const tokenInput = document.getElementById("token-input");
const clientInput = document.getElementById("client-input");
const draftStrengthTrack = document.getElementById("draft-strength-track");
const draftStrengthFill = document.getElementById("draft-strength-fill");
const promptStrengthTrack = document.getElementById("prompt-strength-track");
const promptStrengthFill = document.getElementById("prompt-strength-fill");

const appliedChipIds = new Set();
let promptAiEnhanced = false;
/** @type {Array<{ id: string; label: string; snippet: string }>} */
let suggestionOptions = [];

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

function showDraftView() {
  draftView.classList.remove("hidden");
  refineView.classList.add("hidden");
}

function showRefineView() {
  draftView.classList.add("hidden");
  refineView.classList.remove("hidden");
}

function syncDraftStrength() {
  updateStrengthUi(draftStrengthTrack, draftStrengthFill, draftInput.value, { aiEnhanced: false });
}

function syncPromptStrength() {
  updateStrengthUi(promptStrengthTrack, promptStrengthFill, promptInput.value, {
    aiEnhanced: promptAiEnhanced
  });
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
}

function unlockFollowUp(clear) {
  followUpInput.readOnly = false;
  followUpInput.classList.remove("locked");
  if (clear) {
    followUpInput.value = "";
  }
}

async function handleImprove() {
  const draft = String(draftInput.value || "").trim();
  if (!isDraftSubstantive(draft)) {
    showStatus("Write at least 3 words before improving.", "error");
    return;
  }
  if (!config.token) {
    showStatus("Connect in Settings — paste a device token (pt_…).", "error");
    settingsDialog.showModal();
    return;
  }

  improveBtn.disabled = true;
  improveBtn.textContent = "Improving…";
  showStatus("Improving your draft…", "loading");

  try {
    const { optimized } = await improveInitialDraft(config, draft);
    clearStatus();

    promptInput.value = optimized;
    resetFeedbackUi();
    promptAiEnhanced = true;
    await loadSuggestionsForPrompt(optimized);
    syncPromptStrength();
    showRefineView();
    followUpInput.focus();
  } catch (error) {
    showStatus(String(error?.message || error || "Improve failed"), "error");
  } finally {
    improveBtn.disabled = false;
    improveBtn.textContent = "Improve";
  }
}

async function handleRefine() {
  const currentPrompt = String(promptInput.value || "").trim();
  const feedback = String(followUpInput.value || "").trim();
  if (!currentPrompt) {
    showStatus("Add prompt text before refining.", "error");
    return;
  }
  if (!feedback) {
    showStatus("Add follow-up feedback first.", "error");
    return;
  }
  if (followUpInput.readOnly) {
    return;
  }

  lockFollowUp();
  refineBtn.disabled = true;
  refineBtn.textContent = "Refining…";
  showStatus("Applying your feedback…", "loading");

  try {
    const result = await refineWithFeedback(config, currentPrompt, feedback);
    clearStatus();

    promptInput.value = result.prompt;
    showSummary(result.summary);
    unlockFollowUp(true);
    promptAiEnhanced = true;
    await loadSuggestionsForPrompt(result.prompt);
    syncPromptStrength();
    followUpInput.focus();
  } catch (error) {
    showStatus(String(error?.message || error || "Refine failed"), "error");
    unlockFollowUp(false);
  } finally {
    refineBtn.disabled = false;
    refineBtn.textContent = "Apply feedback";
  }
}

function startNewSession() {
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

function openSettings() {
  apiUrlInput.value = config.apiUrl;
  tokenInput.value = config.token;
  clientInput.value = config.client;
  settingsDialog.showModal();
}

copyBtn.addEventListener("click", async () => {
  const text = String(promptInput.value || "").trim();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  const prev = copyBtn.textContent;
  copyBtn.textContent = "Copied";
  setTimeout(() => {
    copyBtn.textContent = prev;
  }, 1200);
});

newBtn.addEventListener("click", startNewSession);
settingsBtn.addEventListener("click", openSettings);
settingsCancel.addEventListener("click", () => settingsDialog.close());
settingsForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  mergeConfig({
    apiUrl: apiUrlInput.value,
    token: tokenInput.value,
    client: clientInput.value
  });
  updateApiIndicator();
  settingsDialog.close();
  clearStatus();
});

improveBtn.addEventListener("click", () => void handleImprove());
refineBtn.addEventListener("click", () => void handleRefine());

draftInput.addEventListener("keydown", (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
    ev.preventDefault();
    void handleImprove();
  }
});

followUpInput.addEventListener("keydown", (ev) => {
  if (followUpInput.readOnly) return;
  if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
    ev.preventDefault();
    void handleRefine();
  }
});

draftInput.addEventListener("input", syncDraftStrength);
promptInput.addEventListener("input", syncPromptStrength);

void bootstrapConfig().then(() => {
  syncDraftStrength();
  syncPromptStrength();
});
