/** Firefox/Safari WebExtension compatibility (Chrome alias is not always defined). */
if (typeof globalThis.browser !== "undefined" && typeof globalThis.chrome === "undefined") {
  globalThis.chrome = globalThis.browser;
}

const DEFAULT_PROXY_BASE_URL = "https://promptly-labs.com";
const GOOGLE_ACCESS_TOKEN_BUFFER_SEC = 60;
const FIREBASE_ID_TOKEN_BUFFER_SEC = 60;
const DEFAULT_FIREBASE_WEB_API_KEY = "AIzaSyChQ2kiTwunWs9ElDYkU7Cz-i8I9dw29NI";
const DEFAULT_FIREBASE_AUTH_DOMAIN = "promptly-prod-976ef.firebaseapp.com";
const DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID = "913040005574-npbiuat4hl1d3icqoe5lmtuh34qqd8d6.apps.googleusercontent.com";
// Match website prompt-engineering caps (Firebase `rewrite_timeout_ms` / `create_timeout_ms`
// normalized in promptlyBackend `loadPromptEngineeringConfig`: rewrite 8k–120k, create 10k–180k).
const OPTIMIZE_REWRITE_TIMEOUT_MS = 120000;
const OPTIMIZE_CREATE_TIMEOUT_MS = 180000;

function sanitizeOptimizeTelemetryEnvelope(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const out = {};
  const c = raw.composer_char_estimate ?? raw.composerCharEstimate;
  if (typeof c === "number" && Number.isFinite(c)) {
    out.composer_char_estimate = Math.max(0, Math.min(12000, Math.floor(c)));
  }
  const w = raw.composer_word_estimate ?? raw.composerWordEstimate;
  if (typeof w === "number" && Number.isFinite(w)) {
    out.composer_word_estimate = Math.max(0, Math.min(12000, Math.floor(w)));
  }
  if (typeof raw.host_model_label === "string") {
    let label = String(raw.host_model_label)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    if (label && !/https?:\/\//i.test(label)) {
      out.host_model_label = label;
    }
  }
  if (typeof raw.host_model_bucket === "string") {
    const b = raw.host_model_bucket.trim().slice(0, 48);
    if (b) {
      out.host_model_bucket = b;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Web-auth flow does not always populate chrome.identity.getAuthToken cache — persist token for this session. */
const SESSION_WEB_AUTH_TOKEN = "promptlyWebAuthAccessToken";
const SESSION_WEB_AUTH_EXPIRES_AT = "promptlyWebAuthExpiresAt";
const SESSION_WEB_AUTH_EMAIL = "promptlyWebAuthEmail";
/** Fallback if OAuth response omits expires_in (Google access tokens are ~1h). */
const WEB_AUTH_FALLBACK_TTL_MS = 55 * 60 * 1000;

async function clearWebAuthSessionCache() {
  const keys = [SESSION_WEB_AUTH_TOKEN, SESSION_WEB_AUTH_EXPIRES_AT, SESSION_WEB_AUTH_EMAIL];
  await Promise.all([
    chrome.storage.session.remove(keys).catch(() => {}),
    chrome.storage.local.remove(keys).catch(() => {})
  ]);
}

async function saveWebAuthSession(accessToken, chromeEmail, expiresInSec) {
  let ttlMs = WEB_AUTH_FALLBACK_TTL_MS;
  if (expiresInSec != null && Number.isFinite(Number(expiresInSec)) && Number(expiresInSec) > 120) {
    ttlMs = Math.min(Number(expiresInSec) * 1000 - 90_000, 3600 * 1000 - 60_000);
    ttlMs = Math.max(ttlMs, 3 * 60 * 1000);
  }
  const exp = Date.now() + ttlMs;
  const payload = {
    [SESSION_WEB_AUTH_TOKEN]: String(accessToken || "").trim(),
    [SESSION_WEB_AUTH_EXPIRES_AT]: exp,
    [SESSION_WEB_AUTH_EMAIL]: String(chromeEmail || "").trim().toLowerCase()
  };
  await Promise.all([
    chrome.storage.session.set(payload).catch(() => {}),
    chrome.storage.local.set(payload)
  ]);
}

async function readWebAuthSessionTokenIfValid() {
  let data = {};
  try {
    data = await chrome.storage.session.get([SESSION_WEB_AUTH_TOKEN, SESSION_WEB_AUTH_EXPIRES_AT]);
  } catch (_e) {
    data = {};
  }
  let token = String(data[SESSION_WEB_AUTH_TOKEN] || "").trim();
  let exp = Number(data[SESSION_WEB_AUTH_EXPIRES_AT] || 0);
  if (!token || exp <= Date.now() + 15_000) {
    const local = await chrome.storage.local.get([SESSION_WEB_AUTH_TOKEN, SESSION_WEB_AUTH_EXPIRES_AT]);
    token = String(local[SESSION_WEB_AUTH_TOKEN] || "").trim();
    exp = Number(local[SESSION_WEB_AUTH_EXPIRES_AT] || 0);
  }
  if (!token || exp <= Date.now() + 15_000) {
    return null;
  }
  return token;
}

function getSignedInChromeEmail() {
  return new Promise((resolve, reject) => {
    if (!chrome.identity || typeof chrome.identity.getProfileUserInfo !== "function") {
      reject(new Error("Chrome identity unavailable"));
      return;
    }
    chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, (info) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const email = String(info?.email || "").trim().toLowerCase();
      if (!email) {
        reject(new Error("Sign in to Chrome with your Google account"));
        return;
      }
      resolve(email);
    });
  });
}

async function getEmailFromGoogleAccessToken(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) {
    throw new Error("Google OAuth token was empty");
  }
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      await clearWebAuthSessionCache();
    }
    throw new Error(String(body?.error_description || body?.error?.message || "Failed to read Google userinfo"));
  }
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) {
    throw new Error("Google sign-in did not return an email");
  }
  return email;
}

async function getEffectiveSignedInEmail({ interactive = false } = {}) {
  try {
    return await getSignedInChromeEmail();
  } catch (_err) {
    // Continue: profile may be empty even after Google web sign-in.
  }
  if (interactive) {
    const token = await getChromeGoogleAccessToken(true);
    return await getEmailFromGoogleAccessToken(token);
  }
  const token = await getGoogleAccessTokenForApi();
  return await getEmailFromGoogleAccessToken(token);
}

function getChromeGoogleAccessToken(interactive = true) {
  return new Promise((resolve, reject) => {
    if (!chrome.identity || typeof chrome.identity.getAuthToken !== "function") {
      reject(new Error("Chrome OAuth unavailable. Reload extension after manifest update."));
      return;
    }
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const value = String(token || "").trim();
      if (!value) {
        reject(new Error("Google OAuth token was empty"));
        return;
      }
      resolve(value);
    });
  });
}

/** One Google web-auth window at a time (Sign in + any Firebase refresh fallback). */
let launchWebAuthFlowInFlight = null;

async function launchGoogleWebAuthFlowOnce(clientId) {
  if (launchWebAuthFlowInFlight) {
    return launchWebAuthFlowInFlight;
  }
  launchWebAuthFlowInFlight = (async () => {
    try {
      return await launchGoogleWebAuthFlow(clientId);
    } finally {
      launchWebAuthFlowInFlight = null;
    }
  })();
  return launchWebAuthFlowInFlight;
}

async function completeExtensionSignInWebPopup() {
  const settings = await chrome.storage.sync.get(["firebaseOAuthWebClientId"]);
  const clientId =
    String(settings.firebaseOAuthWebClientId || "").trim() || DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID;
  const raw = await launchGoogleWebAuthFlowOnce(clientId);
  if (raw && raw.kind === "firebase_email") {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAtSec =
      Number.isFinite(Number(raw.expiresAtSec)) && Number(raw.expiresAtSec) > nowSec
        ? Number(raw.expiresAtSec)
        : nowSec + 3600;
    await chrome.storage.local.set({
      promptlyFirebaseIdentity: {
        idToken: String(raw.idToken || "").trim(),
        refreshToken: String(raw.refreshToken || "").trim(),
        email: String(raw.email || "").trim().toLowerCase(),
        uid: String(raw.uid || "").trim(),
        expiresAtSec
      }
    });
    return { kind: "firebase_email", firebaseEmail: String(raw.email || "").trim().toLowerCase() };
  }
  const accessToken = String(raw?.accessToken || "").trim();
  if (!accessToken) {
    throw new Error("Google sign-in returned no access token");
  }
  return {
    kind: "google",
    accessToken,
    idToken: String(raw?.idToken || "").trim(),
    expiresInSec: raw?.expiresInSec != null ? Number(raw.expiresInSec) : null
  };
}

/**
 * Access token for API calls — never opens a browser window.
 * 1) chrome.identity silent cache (if Chrome synced after sign-in)
 * 2) token from last extension sign-in popup (Google or email/password) when applicable
 */
async function getGoogleAccessTokenForApi() {
  try {
    return await getChromeGoogleAccessToken(false);
  } catch (_ignored) {
    // fall through
  }
  const cached = await readWebAuthSessionTokenIfValid();
  if (cached) {
    return cached;
  }
  throw new Error("Not signed in");
}

function randomString(byteLength = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function parseOAuthCallbackParams(search, hash) {
  const q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const qerr = String(q.get("error") || "").trim();
  if (qerr) {
    const description = String(q.get("error_description") || "").trim();
    throw new Error(description ? `${qerr}: ${description}` : qerr);
  }
  const fragment = String(hash || "").replace(/^#/, "");
  const params = new URLSearchParams(fragment);
  const error = String(params.get("error") || "").trim();
  if (error) {
    const description = String(params.get("error_description") || "").trim();
    throw new Error(description ? `${error}: ${description}` : error);
  }
  const expRaw = params.get("expires_in");
  let expiresInSec = null;
  if (expRaw != null && String(expRaw).trim() !== "") {
    const n = Number(expRaw);
    if (Number.isFinite(n) && n > 0) {
      expiresInSec = n;
    }
  }
  return {
    accessToken: String(params.get("access_token") || "").trim(),
    idToken: String(params.get("id_token") || "").trim(),
    state: String(params.get("state") || "").trim(),
    expiresInSec
  };
}

function appBaseUrlForWebRedirects(rawValue) {
  let b = normalizeManagedBaseUrl(rawValue);
  if (b.endsWith("/api")) {
    b = b.slice(0, -4);
  }
  return b.replace(/\/$/, "");
}

function oauthBridgePageMatchesSender(senderUrl, redirectUri) {
  try {
    const pageRaw = String(senderUrl || "").split("#")[0];
    const wantRaw = String(redirectUri || "").split("#")[0];
    const page = new URL(pageRaw);
    const want = new URL(wantRaw);
    const sameOrigin = page.origin === want.origin;
    const pn = page.pathname.replace(/\/$/, "") || "/";
    const wn = want.pathname.replace(/\/$/, "") || "/";
    return sameOrigin && pn === wn;
  } catch (_e) {
    const page = String(senderUrl || "").split("#")[0];
    const want = String(redirectUri || "").split("#")[0];
    return page === want || page.startsWith(`${want}?`);
  }
}

function extensionSignInPageMatchesSender(senderUrl) {
  try {
    const pageRaw = String(senderUrl || "").split("#")[0];
    const page = new URL(pageRaw);
    const path = (page.pathname.replace(/\/$/, "") || "/").toLowerCase();
    if (path !== "/auth/extension-sign-in") {
      return false;
    }
    const host = page.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "promptly-labs.com" && page.protocol === "https:") {
      return true;
    }
    if (host.endsWith(".vercel.app") && page.protocol === "https:") {
      return true;
    }
    if ((host === "localhost" || host === "127.0.0.1") && page.protocol === "http:" && page.port === "3000") {
      return true;
    }
    return false;
  } catch (_e) {
    return false;
  }
}

/** Set while extension sign-in popup is open (Google OAuth and/or email-password on the app). */
let pendingExtensionSignIn = null;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type === "PROMPTLY_OAUTH_BRIDGE") {
    if (!pendingExtensionSignIn) {
      return false;
    }
    if (!oauthBridgePageMatchesSender(sender.url, pendingExtensionSignIn.redirectUri)) {
      sendResponse({ ok: false });
      return false;
    }
    pendingExtensionSignIn.deliverOAuth(String(message.search || ""), String(message.hash || ""));
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "PROMPTLY_FIREBASE_EMAIL_SESSION") {
    if (!pendingExtensionSignIn) {
      sendResponse({ ok: false, error: "No pending sign-in" });
      return false;
    }
    if (!extensionSignInPageMatchesSender(sender.url)) {
      sendResponse({ ok: false });
      return false;
    }
    const csrf = String(message.signin_csrf || "").trim();
    if (!csrf || csrf !== pendingExtensionSignIn.csrf) {
      sendResponse({ ok: false, error: "Sign-in session mismatch" });
      return false;
    }
    const idToken = String(message.idToken || "").trim();
    const refreshToken = String(message.refreshToken || "").trim();
    const email = String(message.email || "").trim().toLowerCase();
    const uid = String(message.uid || "").trim();
    const expiresAtSec = Number(message.expiresAtSec);
    if (!idToken || !refreshToken || !email || !uid) {
      sendResponse({ ok: false, error: "Incomplete Firebase session" });
      return false;
    }
    pendingExtensionSignIn.deliverFirebaseEmail({
      idToken,
      refreshToken,
      email,
      uid,
      expiresAtSec: Number.isFinite(expiresAtSec) ? expiresAtSec : null
    });
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

/**
 * Google rejects chrome-extension:// redirect URIs. We redirect to your Promptly app base URL
 * (HTTPS / localhost) and forward tokens from that page to the service worker. The sign-in UI
 * uses a small popup aligned to the top-right of the focused window.
 */
async function launchGoogleWebAuthFlow(clientId) {
  const settings = await chrome.storage.sync.get(["proxyBaseUrl", "firebaseWebApiKey"]);
  const redirectUri = `${appBaseUrlForWebRedirects(settings.proxyBaseUrl)}/auth/extension-google-oauth`;
  const firebaseWebApiKey =
    String(settings.firebaseWebApiKey || "").trim() || DEFAULT_FIREBASE_WEB_API_KEY;

  return new Promise((resolve, reject) => {
    if (!chrome.windows?.create) {
      reject(new Error("Chrome windows API unavailable for sign-in"));
      return;
    }
    if (pendingExtensionSignIn) {
      reject(new Error("Another sign-in is already in progress."));
      return;
    }

    const csrf = randomString(12);
    const state = `${csrf}|${chrome.runtime.id}`;
    const nonce = randomString(12);
    const signInPageUrl = new URL(
      `${appBaseUrlForWebRedirects(settings.proxyBaseUrl)}/auth/extension-sign-in`
    );
    signInPageUrl.searchParams.set("client_id", clientId);
    signInPageUrl.searchParams.set("redirect_uri", redirectUri);
    signInPageUrl.searchParams.set("state", state);
    signInPageUrl.searchParams.set("nonce", nonce);
    signInPageUrl.searchParams.set("extension_id", chrome.runtime.id);
    signInPageUrl.searchParams.set("signin_csrf", csrf);
    if (firebaseWebApiKey) {
      signInPageUrl.searchParams.set("firebase_api_key", firebaseWebApiKey);
    }

    const PANEL_W = 400;
    const PANEL_H = 720;
    const MARGIN = 12;

    let createdWindowId = null;
    let done = false;
    let timeoutId = null;
    let removedListener = null;

    function teardown() {
      pendingExtensionSignIn = null;
      if (timeoutId) {
        globalThis.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (removedListener) {
        try {
          chrome.windows.onRemoved.removeListener(removedListener);
        } catch (_e) {
          /* ignore */
        }
        removedListener = null;
      }
    }

    function closePanel() {
      if (createdWindowId == null) {
        return;
      }
      const id = createdWindowId;
      createdWindowId = null;
      chrome.windows.remove(id).catch(() => {});
    }

    function fail(err) {
      if (done) {
        return;
      }
      done = true;
      teardown();
      closePanel();
      reject(err instanceof Error ? err : new Error(String(err)));
    }

    function succeed(parsed) {
      if (done) {
        return;
      }
      done = true;
      teardown();
      closePanel();
      resolve(parsed);
    }

    pendingExtensionSignIn = {
      redirectUri,
      csrf,
      deliverOAuth(search, hash) {
        if (done) {
          return;
        }
        try {
          const parsed = parseOAuthCallbackParams(search, hash);
          const rawState = parsed.state;
          const pipe = rawState.lastIndexOf("|");
          if (pipe < 0) {
            fail(new Error("OAuth state mismatch"));
            return;
          }
          const stateCsrf = rawState.slice(0, pipe);
          const stateExt = rawState.slice(pipe + 1);
          if (stateExt !== chrome.runtime.id || stateCsrf !== csrf) {
            fail(new Error("OAuth state mismatch"));
            return;
          }
          if (!parsed.accessToken && !parsed.idToken) {
            fail(new Error("Google OAuth returned no token"));
            return;
          }
          succeed({
            kind: "google",
            accessToken: parsed.accessToken,
            idToken: parsed.idToken,
            expiresInSec: parsed.expiresInSec
          });
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      },
      deliverFirebaseEmail(payload) {
        if (done) {
          return;
        }
        const idToken = String(payload?.idToken || "").trim();
        const refreshToken = String(payload?.refreshToken || "").trim();
        const email = String(payload?.email || "").trim().toLowerCase();
        const uid = String(payload?.uid || "").trim();
        const nowSec = Math.floor(Date.now() / 1000);
        const exp = Number(payload?.expiresAtSec);
        const expiresAtSec = Number.isFinite(exp) && exp > nowSec ? exp : nowSec + 3600;
        if (!idToken || !refreshToken || !email || !uid) {
          fail(new Error("Incomplete email sign-in"));
          return;
        }
        succeed({
          kind: "firebase_email",
          idToken,
          refreshToken,
          email,
          uid,
          expiresAtSec
        });
      }
    };

    timeoutId = globalThis.setTimeout(() => fail(new Error("Sign-in timed out")), 120000);

    removedListener = (windowId) => {
      if (windowId === createdWindowId && !done) {
        fail(new Error("Sign-in cancelled"));
      }
    };
    chrome.windows.onRemoved.addListener(removedListener);

    const openPanel = (left, top) => {
      const createOpts = {
        url: signInPageUrl.toString(),
        type: "popup",
        width: PANEL_W,
        height: PANEL_H,
        focused: true
      };
      if (typeof left === "number" && typeof top === "number") {
        createOpts.left = left;
        createOpts.top = top;
      }
      chrome.windows.create(createOpts, (win) => {
        if (chrome.runtime.lastError) {
          fail(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!win?.id) {
          fail(new Error("Failed to open sign-in window"));
          return;
        }
        createdWindowId = win.id;
        // Best-effort: keep the sign-in popup surfaced above the current browsing flow.
        // Chrome does not expose a true cross-platform always-on-top flag for extension popups.
        chrome.windows.update(createdWindowId, { focused: true, drawAttention: true }).catch(() => {});
        globalThis.setTimeout(() => {
          if (createdWindowId != null && !done) {
            chrome.windows.update(createdWindowId, { focused: true }).catch(() => {});
          }
        }, 250);
      });
    };

    chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (w) => {
      if (chrome.runtime.lastError || !w) {
        openPanel();
        return;
      }
      const left = Math.max(0, (w.left || 0) + (w.width || 1280) - PANEL_W - MARGIN);
      const top = Math.max(0, (w.top || 0) + MARGIN);
      openPanel(left, top);
    });
  });
}

function normalizeBaseUrl(rawValue) {
  const trimmed = String(rawValue || "").trim() || DEFAULT_PROXY_BASE_URL;
  return trimmed.replace(/\/$/, "");
}

function isWorkersDevBase(normalizedBase) {
  const b = String(normalizedBase || "").toLowerCase();
  return /\.workers\.dev(\/|$)/.test(b);
}

function isAllowedManagedHost(normalizedBase) {
  try {
    const parsed = new URL(normalizedBase);
    const host = String(parsed.hostname || "").toLowerCase();
    if (host === "promptly-labs.com" || host === "www.promptly-labs.com") {
      return true;
    }
    if (host === "localhost" || host === "127.0.0.1") {
      return true;
    }
    /** Preview deploys (`*.vercel.app`) must be allowed — otherwise telemetry silently rewrote URL to prod and dashboards looked empty vs that site login. */
    if (host === "vercel.app" || host.endsWith(".vercel.app")) {
      return true;
    }
    return false;
  } catch (_error) {
    return false;
  }
}

function normalizeManagedBaseUrl(rawValue) {
  const normalized = normalizeBaseUrl(rawValue);
  // Only allow managed production host (or localhost for local development).
  // Any other host can bypass website admin prompt-engineering controls.
  if (isWorkersDevBase(normalized) || !isAllowedManagedHost(normalized)) {
    return DEFAULT_PROXY_BASE_URL;
  }
  return normalized;
}

async function getManagedProxyBaseUrl() {
  const settings = await chrome.storage.sync.get(["proxyBaseUrl"]);
  const raw = String(settings?.proxyBaseUrl || "").trim();
  const normalizedRaw = normalizeBaseUrl(raw);
  const managed = normalizeManagedBaseUrl(raw);
  if (managed !== normalizedRaw) {
    await chrome.storage.sync.set({ proxyBaseUrl: managed });
  }
  return managed;
}

/**
 * Cloudflare worker (and similar) serves POST /optimize and GET /credits — not Next’s /api/… prefix.
 * When the proxy base points at that host, map /api/optimize → /optimize so requests succeed.
 */
function usesDirectApiPaths(normalizedBase) {
  const b = String(normalizedBase || "").toLowerCase();
  if (b.endsWith("/api")) {
    return false;
  }
  return /:(8787)(\/|$)/.test(b) || /\.workers\.dev(\/|$)/.test(b);
}

function buildApiUrl(baseUrl, path) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  let p = path.startsWith("/") ? path : `/${path}`;
  if (normalizedBase.endsWith("/api")) {
    return `${normalizedBase}${p.replace(/^\/api/, "")}`;
  }
  if (usesDirectApiPaths(normalizedBase) && p.startsWith("/api/")) {
    p = `/${p.slice(5)}`;
  }
  return `${normalizedBase}${p}`;
}

async function buildManageAccountUrl() {
  const baseUrl = await getManagedProxyBaseUrl();
  const accountUrl = `${baseUrl.replace(/\/$/, "")}/account`;
  try {
    const identity = await getFirebaseIdentityForApi(false);
    const idToken = String(identity?.idToken || "").trim();
    if (!idToken) {
      return accountUrl;
    }
    const response = await fetch(buildApiUrl(baseUrl, "/api/account/extension-auth-link"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-promptly-client": "promptly-extension",
        Authorization: `Bearer ${idToken}`
      },
      body: "{}"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return accountUrl;
    }
    const customToken = String(body?.customToken || "").trim();
    if (!customToken) {
      return accountUrl;
    }
    return `${accountUrl}#promptly_ext_custom_token=${encodeURIComponent(customToken)}`;
  } catch (_error) {
    return accountUrl;
  }
}

function buildFirebaseRequestUri(authDomain) {
  const trimmed = String(authDomain || "").trim();
  if (!trimmed) {
    throw new Error("Missing Firebase auth domain in extension settings");
  }
  return `https://${trimmed.replace(/^https?:\/\//, "").replace(/\/$/, "")}/__/auth/handler`;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort("timeout"), Math.max(1000, Number(timeoutMs) || 1000));
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(Math.max(1000, Number(timeoutMs) || 1000) / 1000)}s`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function signInToFirebaseWithGoogle({
  firebaseWebApiKey,
  firebaseAuthDomain,
  googleAccessToken,
  googleIdToken
}) {
  const postParts = [];
  if (googleAccessToken) {
    postParts.push(`access_token=${encodeURIComponent(googleAccessToken)}`);
  }
  if (googleIdToken) {
    postParts.push(`id_token=${encodeURIComponent(googleIdToken)}`);
  }
  postParts.push("providerId=google.com");
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(firebaseWebApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postBody: postParts.join("&"),
        requestUri: buildFirebaseRequestUri(firebaseAuthDomain),
        returnSecureToken: true,
        returnIdpCredential: true
      })
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body?.error?.message || "Failed to sign in to Firebase"));
  }
  return body;
}

async function persistFirebaseSessionAfterGoogleWebSignIn(webSession) {
  const settings = await chrome.storage.sync.get(["firebaseWebApiKey", "firebaseAuthDomain"]);
  const firebaseWebApiKey = String(settings.firebaseWebApiKey || "").trim() || DEFAULT_FIREBASE_WEB_API_KEY;
  const firebaseAuthDomain = String(settings.firebaseAuthDomain || "").trim() || DEFAULT_FIREBASE_AUTH_DOMAIN;
  if (!firebaseWebApiKey || !firebaseAuthDomain) {
    return;
  }
  const at = String(webSession?.accessToken || "").trim();
  if (!at) {
    return;
  }
  const firebaseSession = await signInToFirebaseWithGoogle({
    firebaseWebApiKey,
    firebaseAuthDomain,
    googleAccessToken: at,
    googleIdToken: String(webSession.idToken || "").trim() || undefined
  });
  const nowSec = Math.floor(Date.now() / 1000);
  const nextIdentity = {
    idToken: String(firebaseSession.idToken || "").trim(),
    refreshToken: String(firebaseSession.refreshToken || "").trim(),
    email: String(firebaseSession.email || "").trim().toLowerCase(),
    uid: String(firebaseSession.localId || "").trim(),
    expiresAtSec: nowSec + Math.max(120, Number(firebaseSession.expiresIn || 3600))
  };
  if (nextIdentity.idToken && nextIdentity.refreshToken) {
    await chrome.storage.local.set({ promptlyFirebaseIdentity: nextIdentity });
  }
}

async function refreshFirebaseIdToken({ firebaseWebApiKey, refreshToken }) {
  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseWebApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }).toString()
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body?.error?.message || "Failed to refresh Firebase token"));
  }
  return body;
}

async function getFirebaseIdentityForApi(forceRefresh = false) {
  const [cached, settings] = await Promise.all([
    chrome.storage.local.get(["promptlyFirebaseIdentity"]),
    chrome.storage.sync.get(["firebaseWebApiKey", "firebaseAuthDomain", "firebaseOAuthWebClientId"])
  ]);
  const identity = cached.promptlyFirebaseIdentity || null;
  const firebaseWebApiKey = String(settings.firebaseWebApiKey || "").trim() || DEFAULT_FIREBASE_WEB_API_KEY;
  const firebaseAuthDomain = String(settings.firebaseAuthDomain || "").trim() || DEFAULT_FIREBASE_AUTH_DOMAIN;
  const firebaseOAuthWebClientId =
    String(settings.firebaseOAuthWebClientId || "").trim() || DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID;
  if (!firebaseWebApiKey) {
    throw new Error("Missing Firebase Web API key in extension settings");
  }
  if (!firebaseAuthDomain) {
    throw new Error("Missing Firebase auth domain in extension settings");
  }
  if (!firebaseOAuthWebClientId) {
    throw new Error("Missing Firebase Web OAuth client ID in extension settings");
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (
    !forceRefresh &&
    identity &&
    identity.idToken &&
    Number(identity.expiresAtSec || 0) - FIREBASE_ID_TOKEN_BUFFER_SEC > nowSec
  ) {
    return identity;
  }

  if (identity?.refreshToken) {
    try {
      const refreshed = await refreshFirebaseIdToken({
        firebaseWebApiKey,
        refreshToken: String(identity.refreshToken || "")
      });
      const nextIdentity = {
        idToken: String(refreshed.id_token || "").trim(),
        refreshToken: String(refreshed.refresh_token || identity.refreshToken || "").trim(),
        email: String(refreshed.user_id ? identity.email || "" : identity.email || "").trim().toLowerCase(),
        uid: String(refreshed.user_id || identity.uid || "").trim(),
        expiresAtSec: nowSec + Math.max(120, Number(refreshed.expires_in || 3600))
      };
      if (nextIdentity.idToken) {
        await chrome.storage.local.set({ promptlyFirebaseIdentity: nextIdentity });
        return nextIdentity;
      }
    } catch (_error) {
      // Fall through to fresh Google -> Firebase sign-in.
    }
  }

  const signInResult = await launchGoogleWebAuthFlowOnce(firebaseOAuthWebClientId);
  if (signInResult && signInResult.kind === "firebase_email") {
    const nowSec2 = Math.floor(Date.now() / 1000);
    const nextFromEmail = {
      idToken: String(signInResult.idToken || "").trim(),
      refreshToken: String(signInResult.refreshToken || "").trim(),
      email: String(signInResult.email || "").trim().toLowerCase(),
      uid: String(signInResult.uid || "").trim(),
      expiresAtSec:
        Number.isFinite(Number(signInResult.expiresAtSec)) && Number(signInResult.expiresAtSec) > nowSec2
          ? Number(signInResult.expiresAtSec)
          : nowSec2 + 3600
    };
    await chrome.storage.local.set({ promptlyFirebaseIdentity: nextFromEmail });
    return nextFromEmail;
  }
  const googleSession = signInResult;
  try {
    const ge = await getEmailFromGoogleAccessToken(googleSession.accessToken);
    await saveWebAuthSession(googleSession.accessToken, ge, googleSession.expiresInSec);
  } catch (_e) {
    /* ignore */
  }
  const firebaseSession = await signInToFirebaseWithGoogle({
    firebaseWebApiKey,
    firebaseAuthDomain,
    googleAccessToken: googleSession.accessToken,
    googleIdToken: googleSession.idToken
  });
  const nextIdentity = {
    idToken: String(firebaseSession.idToken || "").trim(),
    refreshToken: String(firebaseSession.refreshToken || "").trim(),
    email: String(firebaseSession.email || "").trim().toLowerCase(),
    uid: String(firebaseSession.localId || "").trim(),
    expiresAtSec: nowSec + Math.max(120, Number(firebaseSession.expiresIn || 3600))
  };
  await chrome.storage.local.set({ promptlyFirebaseIdentity: nextIdentity });
  return nextIdentity;
}

async function readPersistedFirebaseIdentityEmail() {
  const cached = await chrome.storage.local.get(["promptlyFirebaseIdentity"]);
  const identity = cached?.promptlyFirebaseIdentity || null;
  const email = String(identity?.email || "").trim().toLowerCase();
  return email || null;
}

async function readPersistedSignInState() {
  const firebaseEmail = await readPersistedFirebaseIdentityEmail();
  if (firebaseEmail) {
    return { chromeEmail: firebaseEmail, authProvider: "firebase_email" };
  }
  try {
    const chromeEmail = await getEffectiveSignedInEmail({ interactive: false });
    return { chromeEmail: String(chromeEmail || "").trim().toLowerCase() || null, authProvider: "google" };
  } catch (_error) {
    return null;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get([
    "proxyBaseUrl",
    "firebaseWebApiKey",
    "firebaseAuthDomain",
    "firebaseOAuthWebClientId"
  ]);
  const next = {
    proxyBaseUrl: normalizeManagedBaseUrl(existing.proxyBaseUrl),
    firebaseWebApiKey: String(existing.firebaseWebApiKey || "").trim() || DEFAULT_FIREBASE_WEB_API_KEY,
    firebaseAuthDomain: String(existing.firebaseAuthDomain || "").trim() || DEFAULT_FIREBASE_AUTH_DOMAIN,
    firebaseOAuthWebClientId:
      String(existing.firebaseOAuthWebClientId || "").trim() || DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID
  };
  await chrome.storage.sync.set(next);
});

chrome.runtime.onStartup.addListener(async () => {
  await getManagedProxyBaseUrl();
});

if (chrome.action && chrome.runtime && typeof chrome.runtime.openOptionsPage === "function") {
  chrome.action.onClicked.addListener((tab) => {
    const tabId = Number(tab?.id);
    if (!Number.isFinite(tabId)) {
      return;
    }
    chrome.tabs.sendMessage(
      tabId,
      { type: "PROMPTLY_OPEN_IN_PAGE_SETTINGS" },
      () => {
        if (chrome.runtime.lastError) {
          // Ignore pages where Promptly content script is not injected.
        }
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    !message ||
    ![
      "PROMPTLY_OPTIMIZE_PROMPT",
      "PROMPTLY_HOST_ACTIVITY_BATCH",
      "PROMPTLY_VERIFY_USER_SESSION",
      "PROMPTLY_GET_CREDITS",
      "PROMPTLY_CHECK_CHROME_SIGNIN",
      "PROMPTLY_ENSURE_CHROME_SIGNIN",
      "PROMPTLY_GET_ACCOUNT_STATUS",
      "PROMPTLY_GET_MANAGE_ACCOUNT_URL",
      "PROMPTLY_CLEAR_SESSION"
    ].includes(message.type)
  ) {
    return false;
  }

  (async () => {
    try {
      if (message.type === "PROMPTLY_CLEAR_SESSION") {
        await chrome.storage.local.remove(["promptlyFirebaseIdentity"]);
        await clearWebAuthSessionCache();
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "PROMPTLY_CHECK_CHROME_SIGNIN") {
        const persisted = await readPersistedSignInState();
        if (persisted) {
          sendResponse({ ok: true, data: persisted });
          return;
        }
        sendResponse({ ok: false, error: "Not signed in" });
        return;
      }

      if (message.type === "PROMPTLY_ENSURE_CHROME_SIGNIN") {
        // Always use web auth flow for explicit sign-in — avoids hanging getAuthToken from SW.
        const result = await completeExtensionSignInWebPopup();
        if (result.kind === "firebase_email") {
          sendResponse({ ok: true, data: { chromeEmail: result.firebaseEmail } });
          return;
        }
        const session = {
          accessToken: result.accessToken,
          idToken: result.idToken,
          expiresInSec: result.expiresInSec
        };
        const chromeEmail = await getEmailFromGoogleAccessToken(session.accessToken);
        await saveWebAuthSession(session.accessToken, chromeEmail, session.expiresInSec);
        try {
          await persistFirebaseSessionAfterGoogleWebSignIn(session);
        } catch (_e) {
          /* Firebase session improves long-lived API auth; ignore failures here */
        }
        sendResponse({ ok: true, data: { chromeEmail } });
        return;
      }

      if (message.type === "PROMPTLY_GET_ACCOUNT_STATUS") {
        let chromeEmail = "";
        const persisted = await readPersistedSignInState();
        chromeEmail = String(persisted?.chromeEmail || "").trim();
        let subscriptionTier = "";
        try {
          const identity = await getFirebaseIdentityForApi(false);
          const baseUrl = await getManagedProxyBaseUrl();
          const response = await fetch(buildApiUrl(baseUrl, "/api/account/billing"), {
            method: "GET",
            headers: {
              Authorization: `Bearer ${identity.idToken}`
            }
          });
          const body = await response.json().catch(() => ({}));
          if (response.ok) {
            subscriptionTier = String(body?.subscriptionTier || "").trim().toLowerCase();
          }
        } catch (_error) {
          // Keep tier empty when unavailable.
        }
        sendResponse({
          ok: true,
          data: {
            chromeEmail: chromeEmail || null,
            subscriptionTier: subscriptionTier || null
          }
        });
        return;
      }

      if (message.type === "PROMPTLY_GET_MANAGE_ACCOUNT_URL") {
        const url = await buildManageAccountUrl();
        sendResponse({ ok: true, data: { url } });
        return;
      }

      if (message.type === "PROMPTLY_VERIFY_USER_SESSION") {
        const firebaseEmail = await readPersistedFirebaseIdentityEmail();
        let sessionEmail = String(firebaseEmail || "").trim().toLowerCase();
        if (!sessionEmail) {
          try {
            sessionEmail = String(await getEffectiveSignedInEmail({ interactive: false }))
              .trim()
              .toLowerCase();
          } catch (_e) {
            sessionEmail = "";
          }
        }
        const pageEmailHint = String(message.pageEmailHint || "").trim().toLowerCase();
        const hasAuthenticatedUi = !!message.hasAuthenticatedUi;
        if (!hasAuthenticatedUi) {
          sendResponse({ ok: false, error: "Not signed in on this AI service page" });
          return;
        }
        if (!sessionEmail) {
          sendResponse({ ok: false, error: "Sign in to Promptly first — use the Sign in button on the tab." });
          return;
        }
        if (pageEmailHint && pageEmailHint !== sessionEmail) {
          sendResponse({
            ok: false,
            error: "Signed-in account on this page does not match your Promptly sign-in session"
          });
          return;
        }
        sendResponse({
          ok: true,
          data: { chromeEmail: sessionEmail || null, pageEmailHint: pageEmailHint || null }
        });
        return;
      }

      let apiAuthHeaders;
      try {
        const identity = await getFirebaseIdentityForApi(false);
        apiAuthHeaders = {
          "x-promptly-client": "promptly-extension",
          Authorization: `Bearer ${identity.idToken}`
        };
      } catch (_firebaseErr) {
        let googleAccessToken;
        try {
          googleAccessToken = await getGoogleAccessTokenForApi();
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              "Sign in with Promptly first — use the Sign in button on the tab, then try again.",
            needsSignIn: true,
            details: String(error?.message || error)
          });
          return;
        }
        const chromeEmail = await getEmailFromGoogleAccessToken(googleAccessToken);
        apiAuthHeaders = {
          "x-promptly-client": "promptly-extension",
          "x-promptly-user-email": chromeEmail,
          "x-promptly-google-access-token": googleAccessToken
        };
      }
      const baseUrl = await getManagedProxyBaseUrl();
      const prompt = String(message.prompt || "").trim();
      const userInstruction = String(message.userInstruction || "").trim();
      const rawMode = String(message.optimizeMode || "improve").trim().toLowerCase() || "improve";
      const optimizeMode = ["auto", "improve", "generate"].includes(rawMode) ? rawMode : "improve";
      const rawService = String(message.site || message.service || "").trim().toLowerCase();
      const service = ["chatgpt", "claude", "gemini"].includes(rawService) ? rawService : "unknown";

      if (!baseUrl) {
        sendResponse({
          ok: false,
          error: "Missing app base URL in extension settings"
        });
        return;
      }

      if (message.type === "PROMPTLY_GET_CREDITS") {
        const creditHeaders = { ...apiAuthHeaders };
        const hasLenEstimate =
          typeof message.estimatePromptLength === "number" &&
          typeof message.estimateInstructionLength === "number";
        if (hasLenEstimate) {
          const estPrompt = Math.max(0, Math.floor(message.estimatePromptLength));
          const estInstr = Math.max(0, Math.floor(message.estimateInstructionLength));
          creditHeaders["x-promptly-estimate-prompt-length"] = String(estPrompt);
          creditHeaders["x-promptly-estimate-instruction-length"] = String(estInstr);
        }
        const response = await fetch(buildApiUrl(baseUrl, "/api/credits"), {
          method: "GET",
          headers: creditHeaders
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          sendResponse({
            ok: false,
            error: body.error || `Proxy error (${response.status})`,
            credits: body.credits || null
          });
          return;
        }
        sendResponse({ ok: true, data: body });
        return;
      }

      if (message.type === "PROMPTLY_HOST_ACTIVITY_BATCH") {
        const events = Array.isArray(message.events) ? message.events.slice(0, 25) : [];
        if (!events.length) {
          sendResponse({ ok: true, data: { written: 0 } });
          return;
        }
        const response = await fetchWithTimeout(
          buildApiUrl(baseUrl, "/api/telemetry/host-activity"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-promptly-live-config": "1",
              ...apiAuthHeaders
            },
            body: JSON.stringify({ events })
          },
          20000
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          sendResponse({
            ok: false,
            error: body.error || `Host telemetry error (${response.status})`
          });
          return;
        }
        sendResponse({ ok: true, data: { written: body.written ?? 0 } });
        return;
      }

      if (!prompt && !userInstruction) {
        sendResponse({ ok: false, error: "Prompt and instruction are empty" });
        return;
      }

      const optimizeUrl = buildApiUrl(baseUrl, "/api/optimize");
      const telemetryPayload = sanitizeOptimizeTelemetryEnvelope(message.telemetry);
      const optimizeBodyObj = {
        prompt,
        user_instruction: userInstruction,
        optimize_mode: optimizeMode
      };
      if (telemetryPayload) {
        optimizeBodyObj.telemetry = telemetryPayload;
      }
      const optimizeInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-promptly-live-config": "1",
          "x-promptly-service": service,
          ...apiAuthHeaders
        },
        body: JSON.stringify(optimizeBodyObj)
      };
      const optimizeTimeoutMs =
        optimizeMode === "generate" ? OPTIMIZE_CREATE_TIMEOUT_MS : OPTIMIZE_REWRITE_TIMEOUT_MS;
      let response;
      try {
        response = await fetchWithTimeout(optimizeUrl, optimizeInit, optimizeTimeoutMs);
      } catch (error) {
        const message = String(error?.message || error || "");
        if (!/timed out/i.test(message)) {
          throw error;
        }
        // One retry helps absorb occasional cold starts/transient network stalls.
        const retryTimeoutMs =
          optimizeMode === "generate"
            ? OPTIMIZE_CREATE_TIMEOUT_MS + 10000
            : OPTIMIZE_REWRITE_TIMEOUT_MS + 5000;
        response = await fetchWithTimeout(optimizeUrl, optimizeInit, retryTimeoutMs);
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        sendResponse({
          ok: false,
          error: body.error || `Proxy error (${response.status})`,
          credits: body.credits || null
        });
        return;
      }
      if (body.insufficient === true || body.compose_status === "insufficient") {
        sendResponse({
          ok: false,
          error: String(body.compose_message || body.error || "Description is not enough to generate a prompt.")
        });
        return;
      }
      const rawOut = typeof body.optimized_prompt === "string" ? body.optimized_prompt : "";
      const trimmedOut = rawOut.trim();
      const fallback =
        optimizeMode === "generate"
          ? String(userInstruction || prompt || "").trim()
          : String(prompt || userInstruction || "").trim();
      const optimized_prompt = trimmedOut || fallback;
      if (!optimized_prompt) {
        sendResponse({ ok: false, error: "No optimized_prompt returned" });
        return;
      }
      sendResponse({ ok: true, data: { ...body, optimized_prompt } });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();

  return true;
});
