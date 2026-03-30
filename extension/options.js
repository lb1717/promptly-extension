const proxyBaseUrlInput = document.getElementById("proxyBaseUrl");
const firebaseWebApiKeyInput = document.getElementById("firebaseWebApiKey");
const firebaseAuthDomainInput = document.getElementById("firebaseAuthDomain");
const firebaseOAuthWebClientIdInput = document.getElementById("firebaseOAuthWebClientId");
const saveBtn = document.getElementById("saveBtn");
const manageAccountBtn = document.getElementById("manageAccountBtn");
const status = document.getElementById("status");
const DEFAULT_APP_BASE_URL = "https://promptly-labs.com";
const DEFAULT_FIREBASE_WEB_API_KEY = "AIzaSyChQ2kiTwunWs9ElDYkU7Cz-i8I9dw29NI";
const DEFAULT_FIREBASE_AUTH_DOMAIN = "promptly-prod-976ef.firebaseapp.com";
const DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID = "913040005574-npbiuat4hl1d3icqoe5lmtuh34qqd8d6.apps.googleusercontent.com";

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
  showRedirectUriHint();
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
  const appBase = String(proxyBaseUrlInput?.value || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api$/i, "");
  const appRoot = appBase || DEFAULT_APP_BASE_URL.replace(/\/$/, "");
  const webOAuthRedirect = `${appRoot}/auth/extension-google-oauth`;
  const signInLanding = `${appRoot}/auth/extension-sign-in`;
  const primary = chrome.identity.getRedirectURL();
  const alternate = primary.endsWith("/") ? primary.slice(0, -1) : `${primary}/`;
  const extId = chrome.runtime?.id || "(reload options to see id)";
  el.innerHTML = [
    "<strong>Fix “Error 400: redirect_uri_mismatch”</strong>",
    `Open Google Cloud → <strong>APIs &amp; Services → Credentials</strong> → OAuth <strong>Web application</strong> client whose <strong>Client ID</strong> matches the field above exactly.`,
    "<br><br><strong>Authorized redirect URIs</strong> (exact copy):",
    `<br><strong>1) OAuth callback</strong> (required — Google redirects here after you approve access):`,
    `<br><code style="user-select:all">${webOAuthRedirect}</code>`,
    `<br><br><strong>Sign-in window</strong> opens <code style="user-select:all">${signInLanding}</code> first (Promptly + Continue with Google) — <em>do not</em> add this URL to Google Cloud.`,
    "<br><strong>2–3) Chrome token cache</strong> (optional but recommended):",
    `<br><code style="user-select:all">${primary}</code>`,
    `<br><code style="user-select:all">${alternate}</code>`,
    `<br><br>If your app lives on a custom domain, add that origin to <code>externally_connectable</code> in <code>manifest.json</code> so the callback page can reach this extension.`,
    `<br><br>Extension ID: <code>${extId}</code>`
  ].join("");
}

proxyBaseUrlInput?.addEventListener("input", () => showRedirectUriHint());

load();
