import { improveInitialDraft, refineWithFeedback, fetchSuggestions, fetchAccount, CREDITS_POLL_MS } from "./api.js";
import { countWords } from "./further-improve.js";
import { updateStrengthUi } from "./strength.js";
import { createDictationController, stopAllDictation } from "./dictation.js";

const PRODUCTION_API_URL = "https://promptly-labs.com";
const SIGN_IN_URL = "https://promptly-labs.com/integrations";

/** @type {{ apiUrl: string; token: string; client: string }} */
let config = { apiUrl: "", token: "", client: "promptly-cursor" };

/** @type {{ email: string | null; displayName: string | null; plan: string; credits: Record<string, unknown> | null } | null>} */
let account = null;
let creditsPollTimer = null;
let isSignedIn = false;

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
const signInGate = document.getElementById("sign-in-gate");
const signInBtn = document.getElementById("sign-in-btn");
const refreshAuthBtn = document.getElementById("refresh-auth-btn");
const permissionsDialog = document.getElementById("permissions-dialog");
const permissionsAllowBtn = document.getElementById("permissions-allow-btn");
const permissionsSkipBtn = document.getElementById("permissions-skip-btn");
const permissionsDevHint = document.getElementById("permissions-dev-hint");
const permissionsFollowupHint = document.getElementById("permissions-followup-hint");
const permissionsAppName = document.getElementById("permissions-app-name");
const settingsForm = document.getElementById("settings-form");
const settingsCancel = document.getElementById("settings-cancel");
const settingsSignOutBtn = document.getElementById("settings-sign-out-btn");
const appVersionLine = document.getElementById("app-version-line");
const accountIndicator = document.getElementById("account-indicator");
const settingsAccountName = document.getElementById("settings-account-name");
const settingsAccountEmail = document.getElementById("settings-account-email");
const settingsAccountPlan = document.getElementById("settings-account-plan");
const settingsCreditsLabel = document.getElementById("settings-credits-label");
const settingsCreditsFill = document.getElementById("settings-credits-fill");
const settingsCreditsReset = document.getElementById("settings-credits-reset");
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

let statusFadeTimer = null;

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

const draftDictation = createDictationController({
  textarea: draftInput,
  micButton: draftMicBtn,
  getConfig: () => config,
  onError: showError
});

const followUpDictation = createDictationController({
  textarea: followUpInput,
  micButton: followUpMicBtn,
  getConfig: () => config,
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
    settingsCreditsLabel.textContent = "—";
    settingsCreditsFill.style.width = "0%";
    settingsCreditsFill.removeAttribute("data-level");
    settingsCreditsReset.textContent = "Connect your account to view usage.";
    return;
  }

  const max = Math.max(1, Number(credits.max || 1));
  const used = Math.min(max, Math.max(0, Number(credits.used || 0)));
  const leftPercent =
    credits.left_percent != null
      ? Math.max(0, Math.min(100, Math.round(Number(credits.left_percent) || 0)))
      : Math.max(0, Math.min(100, Math.round(((max - used) / max) * 100)));
  const usedPercent = Math.max(0, Math.min(100, 100 - leftPercent));
  settingsCreditsLabel.textContent = `${leftPercent}% left · ${used.toLocaleString()} / ${max.toLocaleString()}`;
  settingsCreditsFill.style.width = `${usedPercent > 0 ? Math.max(1.5, usedPercent) : 0}%`;
  settingsCreditsFill.dataset.level = usedPercent >= 85 ? "high" : usedPercent >= 55 ? "mid" : "low";

  const resetLabel = String(credits.reset_label || "").trim();
  const resetDays = Math.max(0, Math.ceil(Number(credits.reset_in_days || 0) || 0));
  const resetHours = Math.max(0, Math.ceil(Number(credits.reset_in_hours || 0) || 0));
  settingsCreditsReset.textContent =
    resetLabel || (resetDays > 0 ? `Resets in ${resetDays} day${resetDays === 1 ? "" : "s"}` : resetHours > 0 ? `Resets in ${resetHours} hour${resetHours === 1 ? "" : "s"}` : "");
}

function updateAccountUi() {
  if (accountIndicator) {
    if (!isSignedIn) {
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
    settingsAccountName.textContent = account?.displayName || account?.email || "—";
  }
  if (settingsAccountEmail) {
    settingsAccountEmail.textContent = account?.email || "—";
  }
  if (settingsAccountPlan) {
    settingsAccountPlan.textContent = account?.plan ? String(account.plan) : "—";
  }
  updateCreditsUi();
}

function setSignedInUi(signedIn) {
  isSignedIn = Boolean(signedIn);
  if (signInGate) {
    signInGate.classList.toggle("hidden", isSignedIn);
  }
  if (!isSignedIn) {
    draftView?.classList.add("hidden");
    refineView?.classList.add("hidden");
  } else if (refineView && !refineView.classList.contains("hidden")) {
    /* keep refine view */
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
    account = null;
    setSignedInUi(false);
    stopCreditsPolling();
    return null;
  }
  try {
    account = await fetchAccount(config);
    setSignedInUi(true);
    startCreditsPolling();
    return account;
  } catch (error) {
    account = null;
    setSignedInUi(false);
    stopCreditsPolling();
    if (!silent) {
      showError(String(error?.message || error || "Could not verify your Promptly account."));
    }
    return null;
  }
}

async function refreshAuthFromDisk() {
  if (window.promptlyCompanion?.saveSettings) {
    await window.promptlyCompanion.saveSettings({ signedOut: false });
  }
  if (window.promptlyCompanion?.refreshConfig) {
    const defaults = await window.promptlyCompanion.refreshConfig();
    mergeConfig({
      apiUrl: resolveApiUrl(null, defaults),
      token: defaults?.token || "",
      client: defaults?.client || "promptly-cursor"
    });
  } else {
    await bootstrapConfig();
  }
  await refreshAccount();
  if (isSignedIn) {
    clearStatus();
    showSuccess("Connected to Promptly.");
  }
}

function openSignInPage() {
  if (window.promptlyCompanion?.openExternal) {
    void window.promptlyCompanion.openExternal(SIGN_IN_URL);
    return;
  }
  window.open(SIGN_IN_URL, "_blank", "noopener,noreferrer");
}

async function signOut() {
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

async function autoPasteToHost(text) {
  const result = await pasteToHostPrompt(text);
  if (result?.ok) {
    const host = result.host ? ` into ${result.host}` : "";
    showSuccess(`Pasted${host}`);
  } else if (result?.error) {
    showError(String(result.error));
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
    setSignedInUi(false);
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

function renderChips() {
  chipGrid.innerHTML = "";
  appliedChipIds.clear();
  for (const opt of suggestionOptions) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.id = opt.id;

    const labelSpan = document.createElement("span");
    labelSpan.textContent = opt.label;
    chip.appendChild(labelSpan);

    chip.addEventListener("click", () => {
      if (appliedChipIds.has(opt.id)) return;
      const current = String(promptInput.value || "").trim();
      const snippet = String(opt.snippet || "").trim();
      promptInput.value = current ? `${current}\n\n${snippet}` : snippet;
      appliedChipIds.add(opt.id);
      chip.classList.add("applied");
      labelSpan.textContent = opt.label;
      const check = document.createElement("span");
      check.className = "chip-check";
      check.textContent = "✓";
      check.setAttribute("aria-hidden", "true");
      chip.appendChild(check);
      chip.setAttribute("aria-disabled", "true");
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
  if (!isSignedIn || !config.token) {
    showError("Sign in to Promptly to improve prompts.");
    openSignInPage();
    return;
  }
  if (isCreditsHardExhausted(account?.credits)) {
    showError("Weekly token limit reached. Resets Sunday UTC.");
    return;
  }

  clearStatus();
  improveBtn.disabled = true;
  improveBtn.textContent = "Improving…";
  setDraftBusy(true);

  try {
    const { optimized, credits } = await improveInitialDraft(config, draft);
    if (credits) applyCredits(credits);

    promptInput.value = optimized;
    resetFeedbackUi();
    promptAiEnhanced = true;
    showRefineView();
    await loadSuggestionsForPrompt(optimized);
    syncPromptStrength();
    followUpInput.focus();
    await autoPasteToHost(optimized);
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
  if (!isSignedIn || !config.token) {
    showError("Sign in to Promptly to continue.");
    openSignInPage();
    return;
  }
  if (isCreditsHardExhausted(account?.credits)) {
    showError("Weekly token limit reached. Resets Sunday UTC.");
    return;
  }

  clearStatus();
  lockFollowUp();
  refineBtn.disabled = true;
  refineBtn.textContent = "Applying feedback…";
  setPromptBusy(true);

  try {
    const result = await refineWithFeedback(config, currentPrompt, feedback);
    if (result.credits) applyCredits(result.credits);

    promptInput.value = result.prompt;
    showSummary(result.summary);
    unlockFollowUp(true);
    promptAiEnhanced = true;
    syncPromptStrength();
    followUpInput.focus();
    await autoPasteToHost(result.prompt);
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
  appVersionLine.textContent = `Version ${version} · ${runtime}`;
}

async function loadSettingsIntoForm() {
  if (!window.promptlyCompanion?.getSettings) {
    return;
  }
  const settings = await window.promptlyCompanion.getSettings();
  if (autoOpenClaude) autoOpenClaude.checked = Boolean(settings.autoOpen?.claude_code);
  if (autoOpenCodex) autoOpenCodex.checked = Boolean(settings.autoOpen?.codex);
  if (autoOpenCursor) autoOpenCursor.checked = Boolean(settings.autoOpen?.cursor);
  if (openOnLaunch) openOnLaunch.checked = settings.openOnCompanionLaunch !== false;
  if (settingsSignOutBtn) {
    settingsSignOutBtn.disabled = !isSignedIn;
  }
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
  clearStatus();
  if (pasteBtn) {
    pasteBtn.disabled = true;
    pasteBtn.textContent = "Pasting…";
  }
  try {
    await autoPasteToHost(text);
  } finally {
    if (pasteBtn) {
      pasteBtn.disabled = false;
      pasteBtn.textContent = "Paste";
    }
  }
});

signInBtn?.addEventListener("click", () => openSignInPage());
refreshAuthBtn?.addEventListener("click", () => void refreshAuthFromDisk());
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
settingsSignOutBtn?.addEventListener("click", () => void signOut());
settingsForm?.addEventListener("submit", (ev) => {
  ev.preventDefault();
  void saveCompanionSettingsFromForm();
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
  await refreshAccount({ silent: true });
  await maybeShowPermissionsOnboarding();
});
