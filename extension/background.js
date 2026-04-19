const DEFAULT_PROXY_BASE_URL = "https://promptly-labs.com";
const GOOGLE_ACCESS_TOKEN_BUFFER_SEC = 60;
const FIREBASE_ID_TOKEN_BUFFER_SEC = 60;
const DEFAULT_FIREBASE_WEB_API_KEY = "AIzaSyChQ2kiTwunWs9ElDYkU7Cz-i8I9dw29NI";
const DEFAULT_FIREBASE_AUTH_DOMAIN = "promptly-prod-976ef.firebaseapp.com";
const DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID = "913040005574-npbiuat4hl1d3icqoe5lmtuh34qqd8d6.apps.googleusercontent.com";
const OPTIMIZE_REWRITE_TIMEOUT_MS = 25000;
const OPTIMIZE_CREATE_TIMEOUT_MS = 95000;

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
        reject(new Error("Sign in to Chrome with your Gmail account"));
        return;
      }
      if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) {
        reject(new Error("Only Gmail Chrome profiles are allowed"));
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
  if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) {
    throw new Error("Only Gmail accounts are allowed");
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

async function getGoogleAccessTokenViaWebAuthFlowOnly() {
  const settings = await chrome.storage.sync.get(["firebaseOAuthWebClientId"]);
  const clientId =
    String(settings.firebaseOAuthWebClientId || "").trim() || DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID;
  const result = await launchGoogleWebAuthFlowOnce(clientId);
  const accessToken = String(result?.accessToken || "").trim();
  if (!accessToken) {
    throw new Error("Google sign-in returned no access token");
  }
  return {
    accessToken,
    idToken: String(result?.idToken || "").trim(),
    expiresInSec: result?.expiresInSec != null ? Number(result.expiresInSec) : null
  };
}

/**
 * Access token for API calls — never opens a browser window.
 * 1) chrome.identity silent cache (if Chrome synced after sign-in)
 * 2) token from last PROMPTLY_ENSURE_CHROME_SIGNIN (web flow often doesn't populate (1))
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

/** Set while a Google sign-in popup is open; HTTPS app page sends hash/search via onMessageExternal. */
let pendingGoogleOAuth = null;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type !== "PROMPTLY_OAUTH_BRIDGE" || !pendingGoogleOAuth) {
    return false;
  }
  if (!oauthBridgePageMatchesSender(sender.url, pendingGoogleOAuth.redirectUri)) {
    sendResponse({ ok: false });
    return false;
  }
  pendingGoogleOAuth.deliver(String(message.search || ""), String(message.hash || ""));
  sendResponse({ ok: true });
  return false;
});

/**
 * Google rejects chrome-extension:// redirect URIs. We redirect to your Promptly app base URL
 * (HTTPS / localhost) and forward tokens from that page to the service worker. The sign-in UI
 * uses a small popup aligned to the top-right of the focused window.
 */
async function launchGoogleWebAuthFlow(clientId) {
  const settings = await chrome.storage.sync.get(["proxyBaseUrl"]);
  const redirectUri = `${appBaseUrlForWebRedirects(settings.proxyBaseUrl)}/auth/extension-google-oauth`;

  return new Promise((resolve, reject) => {
    if (!chrome.windows?.create) {
      reject(new Error("Chrome windows API unavailable for sign-in"));
      return;
    }
    if (pendingGoogleOAuth) {
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

    const PANEL_W = 380;
    const PANEL_H = 580;
    const MARGIN = 12;

    let createdWindowId = null;
    let done = false;
    let timeoutId = null;
    let removedListener = null;

    function teardown() {
      pendingGoogleOAuth = null;
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

    pendingGoogleOAuth = {
      redirectUri,
      deliver(search, hash) {
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
          succeed(parsed);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
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

  const googleSession = await launchGoogleWebAuthFlowOnce(firebaseOAuthWebClientId);
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

async function readPersistedSignInState() {
  const cached = await chrome.storage.local.get(["promptlyFirebaseIdentity"]);
  const identity = cached?.promptlyFirebaseIdentity || null;
  if (!identity || !String(identity.refreshToken || "").trim()) {
    return null;
  }
  const email = String(identity.email || "").trim().toLowerCase();
  return { chromeEmail: email || null };
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
      "PROMPTLY_VERIFY_USER_SESSION",
      "PROMPTLY_GET_CREDITS",
      "PROMPTLY_CHECK_CHROME_SIGNIN",
      "PROMPTLY_ENSURE_CHROME_SIGNIN",
      "PROMPTLY_GET_ACCOUNT_STATUS"
    ].includes(message.type)
  ) {
    return false;
  }

  (async () => {
    try {
      if (message.type === "PROMPTLY_CHECK_CHROME_SIGNIN") {
        try {
          const chromeEmail = await getEffectiveSignedInEmail({ interactive: false });
          sendResponse({ ok: true, data: { chromeEmail } });
        } catch (error) {
          const persisted = await readPersistedSignInState();
          if (persisted) {
            sendResponse({ ok: true, data: persisted });
            return;
          }
          sendResponse({ ok: false, error: String(error?.message || error) });
        }
        return;
      }

      if (message.type === "PROMPTLY_ENSURE_CHROME_SIGNIN") {
        // Always use web auth flow for explicit sign-in — avoids hanging getAuthToken from SW.
        const session = await getGoogleAccessTokenViaWebAuthFlowOnly();
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
        try {
          chromeEmail = await getEffectiveSignedInEmail({ interactive: false });
        } catch (_error) {
          const persisted = await readPersistedSignInState();
          chromeEmail = String(persisted?.chromeEmail || "").trim();
        }
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

      if (message.type === "PROMPTLY_VERIFY_USER_SESSION") {
        const chromeEmail = await getEffectiveSignedInEmail({ interactive: false });
        const pageEmailHint = String(message.pageEmailHint || "").trim().toLowerCase();
        const hasAuthenticatedUi = !!message.hasAuthenticatedUi;
        if (!hasAuthenticatedUi) {
          sendResponse({ ok: false, error: "Not signed in on this AI service page" });
          return;
        }
        if (pageEmailHint && pageEmailHint !== chromeEmail) {
          sendResponse({
            ok: false,
            error: "Service account email does not match signed-in Chrome Gmail"
          });
          return;
        }
        sendResponse({ ok: true, data: { chromeEmail, pageEmailHint: pageEmailHint || null } });
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
      const requestMode = String(message.requestMode || "rewrite").trim() || "rewrite";

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

      if (!prompt && !userInstruction) {
        sendResponse({ ok: false, error: "Prompt and instruction are empty" });
        return;
      }

      const optimizeUrl = buildApiUrl(baseUrl, "/api/optimize");
      const optimizeInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-promptly-live-config": "1",
          ...apiAuthHeaders
        },
        body: JSON.stringify({
          prompt,
          user_instruction: userInstruction,
          request_mode: requestMode
        })
      };
      const optimizeTimeoutMs = requestMode === "create" ? OPTIMIZE_CREATE_TIMEOUT_MS : OPTIMIZE_REWRITE_TIMEOUT_MS;
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
          requestMode === "create"
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
      if (!body.optimized_prompt) {
        sendResponse({ ok: false, error: "No optimized_prompt returned" });
        return;
      }
      sendResponse({ ok: true, data: body });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();

  return true;
});
