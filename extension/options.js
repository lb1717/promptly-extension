const proxyBaseUrlInput = document.getElementById("proxyBaseUrl");
const firebaseWebApiKeyInput = document.getElementById("firebaseWebApiKey");
const firebaseAuthDomainInput = document.getElementById("firebaseAuthDomain");
const firebaseOAuthWebClientIdInput = document.getElementById("firebaseOAuthWebClientId");
const saveBtn = document.getElementById("saveBtn");
const manageAccountBtn = document.getElementById("manageAccountBtn");
const status = document.getElementById("status");
const DEFAULT_APP_BASE_URL = "http://localhost:3000";
const DEFAULT_FIREBASE_WEB_API_KEY = "AIzaSyChQ2kiTwunWs9ElDYkU7Cz-i8I9dw29NI";
const DEFAULT_FIREBASE_AUTH_DOMAIN = "promptly-prod-976ef.firebaseapp.com";
const DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID = "575107146310-715uuvv59lrde0k340jm0btufebokk2g.apps.googleusercontent.com";

function getAccountUrl() {
  const baseUrl = String(proxyBaseUrlInput.value || "").trim() || DEFAULT_APP_BASE_URL;
  return `${baseUrl.replace(/\/$/, "")}/account`;
}

async function load() {
  const values = await chrome.storage.sync.get([
    "proxyBaseUrl",
    "firebaseWebApiKey",
    "firebaseAuthDomain",
    "firebaseOAuthWebClientId"
  ]);
  proxyBaseUrlInput.value = values.proxyBaseUrl || DEFAULT_APP_BASE_URL;
  firebaseWebApiKeyInput.value = values.firebaseWebApiKey || DEFAULT_FIREBASE_WEB_API_KEY;
  firebaseAuthDomainInput.value = values.firebaseAuthDomain || DEFAULT_FIREBASE_AUTH_DOMAIN;
  firebaseOAuthWebClientIdInput.value =
    values.firebaseOAuthWebClientId || DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID;
}

saveBtn.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    proxyBaseUrl: proxyBaseUrlInput.value.trim(),
    firebaseWebApiKey: firebaseWebApiKeyInput.value.trim(),
    firebaseAuthDomain: firebaseAuthDomainInput.value.trim(),
    firebaseOAuthWebClientId: firebaseOAuthWebClientIdInput.value.trim()
  });
  status.textContent = "Saved.";
});

manageAccountBtn.addEventListener("click", () => {
  window.open(getAccountUrl(), "_blank");
});

function showRedirectUriHint() {
  const el = document.getElementById("oauthRedirectHint");
  if (!el || !chrome.identity?.getRedirectURL) {
    return;
  }
  const primary = chrome.identity.getRedirectURL();
  const alternate = primary.endsWith("/") ? primary.slice(0, -1) : `${primary}/`;
  const extId = chrome.runtime?.id || "(reload options to see id)";
  el.innerHTML = [
    "<strong>Fix “Error 400: redirect_uri_mismatch”</strong>",
    `Open Google Cloud → <strong>APIs &amp; Services → Credentials</strong> → OAuth <strong>Web application</strong> client whose <strong>Client ID</strong> matches the field above exactly.`,
    "<br><br><strong>Authorized redirect URIs</strong> → <strong>Add URI</strong> and register <em>both</em> (exact copy):",
    `<br>1) <code style="user-select:all">${primary}</code>`,
    `<br>2) <code style="user-select:all">${alternate}</code>`,
    `<br><br>Extension ID: <code>${extId}</code>`
  ].join("");
}

load();
showRedirectUriHint();
