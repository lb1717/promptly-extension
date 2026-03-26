const promptInput = document.getElementById("promptInput");
const autoAdjustBtn = document.getElementById("autoAdjustBtn");
const undoBtn = document.getElementById("undoBtn");
const statusText = document.getElementById("statusText");
const openOptionsBtn = document.getElementById("openOptionsBtn");
const manageAccountBtn = document.getElementById("manageAccountBtn");

const DEFAULT_APP_BASE_URL = "http://localhost:3000";

async function getExtensionAccountUrl() {
  const values = await chrome.storage.sync.get(["proxyBaseUrl"]);
  const baseUrl = String(values.proxyBaseUrl || "").trim() || DEFAULT_APP_BASE_URL;
  return `${baseUrl.replace(/\/$/, "")}/auth/extension`;
}

let lastOriginalPrompt = "";

const STATUS_LINE_MAX = 140;

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? "#b91c1c" : "#334155";
}

/** Temporary: long errors do not fit status line — mirror into main textarea. TODO: remove. */
function showErrorWithOptionalPromptField(fullMessage) {
  const msg = String(fullMessage || "").trim();
  if (!msg) {
    return;
  }
  if (msg.length <= STATUS_LINE_MAX) {
    setStatus(msg, true);
    return;
  }
  const header = "[Promptly — error]\n";
  const existing = String(promptInput.value || "");
  const block = `${header}${msg}\n\n`;
  if (!(existing.includes(header) && existing.includes(msg))) {
    promptInput.value = existing ? `${block}${existing}` : block;
  }
  setStatus("Full error is in the text box above.", true);
}

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

manageAccountBtn.addEventListener("click", async () => {
  window.open(await getExtensionAccountUrl(), "_blank");
});

undoBtn.addEventListener("click", () => {
  if (!lastOriginalPrompt) {
    return;
  }
  promptInput.value = lastOriginalPrompt;
  lastOriginalPrompt = "";
  undoBtn.disabled = true;
  setStatus("Restored previous prompt.");
});

autoAdjustBtn.addEventListener("click", async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus("Enter a prompt first.", true);
    return;
  }

  autoAdjustBtn.disabled = true;
  setStatus("Optimizing...");

  try {
    const data = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "PROMPTLY_OPTIMIZE_PROMPT",
          prompt,
          userInstruction: "",
          requestMode: "rewrite"
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            reject(new Error(response?.error || "Optimize failed"));
            return;
          }
          resolve(response.data || {});
        }
      );
    });

    const optimized = String(data.optimized_prompt || "").trim();
    if (!optimized) {
      throw new Error("No optimized prompt in response");
    }

    lastOriginalPrompt = promptInput.value;
    promptInput.value = optimized;
    undoBtn.disabled = false;
    setStatus("Prompt optimized.");
  } catch (error) {
    showErrorWithOptionalPromptField(String(error.message || error));
  } finally {
    autoAdjustBtn.disabled = false;
  }
});
