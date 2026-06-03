/** Firefox/Safari WebExtension compatibility (Chrome alias is not always defined). */
if (typeof globalThis.browser !== "undefined" && typeof globalThis.chrome === "undefined") {
  globalThis.chrome = globalThis.browser;
}

const DEFAULT_PROXY_BASE_URL = "https://promptly-labs.com";
const GOOGLE_ACCESS_TOKEN_BUFFER_SEC = 60;
const FIREBASE_ID_TOKEN_BUFFER_SEC = 60;
const FIREBASE_REFRESH_ALARM = "promptly-firebase-token-refresh";
const FIREBASE_REFRESH_LEAD_SEC = 300;

async function scheduleFirebaseTokenRefresh(identity) {
  if (!chrome.alarms?.create) {
    return;
  }
  const refreshToken = String(identity?.refreshToken || "").trim();
  const expiresAtSec = Number(identity?.expiresAtSec || 0);
  if (!refreshToken || !Number.isFinite(expiresAtSec) || expiresAtSec <= 0) {
    return;
  }
  const refreshAtSec = Math.max(
    Math.floor(Date.now() / 1000) + 60,
    expiresAtSec - FIREBASE_ID_TOKEN_BUFFER_SEC - FIREBASE_REFRESH_LEAD_SEC
  );
  await chrome.alarms.create(FIREBASE_REFRESH_ALARM, { when: refreshAtSec * 1000 }).catch(() => {});
}

async function persistFirebaseIdentity(identity) {
  const nextIdentity = identity && typeof identity === "object" ? identity : null;
  if (!nextIdentity?.idToken || !nextIdentity?.email) {
    return null;
  }
  await chrome.storage.local.set({ promptlyFirebaseIdentity: nextIdentity });
  await scheduleFirebaseTokenRefresh(nextIdentity);
  return nextIdentity;
}

async function ensureFirebaseTokenFreshness() {
  try {
    const cached = await chrome.storage.local.get(["promptlyFirebaseIdentity"]);
    const identity = cached?.promptlyFirebaseIdentity || null;
    if (!identity?.refreshToken) {
      return;
    }
    const refreshed = await getFirebaseIdentityForApi(false);
    await scheduleFirebaseTokenRefresh(refreshed);
  } catch (_error) {
    const cached = await chrome.storage.local.get(["promptlyFirebaseIdentity"]);
    await scheduleFirebaseTokenRefresh(cached?.promptlyFirebaseIdentity || null);
  }
}

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === FIREBASE_REFRESH_ALARM) {
      void ensureFirebaseTokenFreshness();
    }
  });
}

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
  const dd = raw.draft_duration_ms ?? raw.draftDurationMs;
  if (typeof dd === "number" && Number.isFinite(dd)) {
    out.draft_duration_ms = Math.max(0, Math.min(7_200_000, Math.floor(dd)));
  }
  const da = raw.draft_active_ms ?? raw.draftActiveMs;
  if (typeof da === "number" && Number.isFinite(da)) {
    out.draft_active_ms = Math.max(0, Math.min(7_200_000, Math.floor(da)));
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

const EXTENSION_SIGNIN_SUCCESS_DELAY_MS = 1000;

/** One extension sign-in tab at a time. */
let launchExtensionSignInTabInFlight = null;

async function launchExtensionSignInTabOnce(options = {}) {
  if (launchExtensionSignInTabInFlight) {
    return launchExtensionSignInTabInFlight;
  }
  launchExtensionSignInTabInFlight = (async () => {
    try {
      return await launchExtensionSignInTab(options);
    } finally {
      launchExtensionSignInTabInFlight = null;
    }
  })();
  return launchExtensionSignInTabInFlight;
}

async function completeExtensionSignInTab(options = {}) {
  const raw = await launchExtensionSignInTabOnce(options);
  if (raw?.kind === "website_sync") {
    return raw;
  }
  throw new Error("Extension sign-in did not complete");
}

async function focusExistingExtensionSignInTab(appBaseUrl) {
  const prefix = `${appBaseUrl}/auth/extension`;
  const tabs = await chrome.tabs.query({ url: `${prefix}*` }).catch(() => []);
  const match = (tabs || []).find((tab) => String(tab.url || "").includes("/auth/extension"));
  if (!match?.id) {
    return false;
  }
  await chrome.tabs.update(match.id, { active: true }).catch(() => {});
  if (match.windowId != null) {
    await chrome.windows.update(match.windowId, { focused: true }).catch(() => {});
  }
  return true;
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

function extensionAuthPageMatchesSender(senderUrl) {
  try {
    const pageRaw = String(senderUrl || "").split("#")[0];
    const page = new URL(pageRaw);
    const path = (page.pathname.replace(/\/$/, "") || "/").toLowerCase();
    if (path !== "/auth/extension-sign-in" && path !== "/auth/extension") {
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

/** Set while extension sign-in tab is open. */
let pendingExtensionSignIn = null;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type === "PROMPTLY_WEBSITE_SESSION_SYNC") {
    if (!promptlyWebsitePageMatchesSender(sender.url)) {
      sendResponse({ ok: false, error: "Invalid sender" });
      return false;
    }
    (async () => {
      try {
        const idToken = String(message.idToken || "").trim();
        const email = String(message.email || "").trim().toLowerCase();
        const uid = String(message.uid || "").trim();
        const expiresAtSec = Number(message.expiresAtSec);
        if (!idToken || !email) {
          sendResponse({ ok: false, error: "Incomplete session" });
          return;
        }
        const existing = await chrome.storage.local.get(["promptlyFirebaseIdentity"]);
        const prev = existing?.promptlyFirebaseIdentity || {};
        const nextIdentity = {
          ...prev,
          idToken,
          email,
          uid: uid || String(prev.uid || "").trim(),
          expiresAtSec:
            Number.isFinite(expiresAtSec) && expiresAtSec > Math.floor(Date.now() / 1000)
              ? expiresAtSec
              : Math.floor(Date.now() / 1000) + 3600,
          refreshToken: String(message.refreshToken || prev.refreshToken || "").trim()
        };
        await persistFirebaseIdentity(nextIdentity);
        prefetchUserCredits();
        const csrf = String(message.signin_csrf || "").trim();
        if (pendingExtensionSignIn && csrf && csrf === pendingExtensionSignIn.csrf) {
          pendingExtensionSignIn.deliverWebsiteSession({
            email,
            idToken,
            uid,
            expiresAtSec: nextIdentity.expiresAtSec
          });
        }
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
    })();
    return true;
  }
  if (message?.type === "PROMPTLY_OAUTH_BRIDGE") {
    sendResponse({ ok: false, error: "Legacy OAuth bridge is no longer used for extension sign-in" });
    return false;
  }
  if (message?.type === "PROMPTLY_FIREBASE_EMAIL_SESSION") {
    if (!pendingExtensionSignIn) {
      sendResponse({ ok: false, error: "No pending sign-in" });
      return false;
    }
    if (!extensionAuthPageMatchesSender(sender.url)) {
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
 * Opens /auth/extension in a new browser tab. The website syncs Firebase session back via
 * PROMPTLY_WEBSITE_SESSION_SYNC; we show a success screen briefly, then return to the AI tab.
 */
async function launchExtensionSignInTab(options = {}) {
  const settings = await chrome.storage.sync.get(["proxyBaseUrl"]);
  const appBaseUrl = appBaseUrlForWebRedirects(settings.proxyBaseUrl);
  const successUrl = `${appBaseUrl}/auth/extension/success`;
  const preferredOriginTabId =
    typeof options.originTabId === "number" && Number.isFinite(options.originTabId) ? options.originTabId : null;

  return new Promise((resolve, reject) => {
    if (!chrome.tabs?.create) {
      reject(new Error("Browser tabs API unavailable for sign-in"));
      return;
    }
    if (pendingExtensionSignIn) {
      void focusExistingExtensionSignInTab(appBaseUrl);
      reject(new Error("Sign-in is already open in another tab — finish there or close it and try again."));
      return;
    }

    const csrf = randomString(12);
    const signInPageUrl = new URL(`${appBaseUrl}/auth/extension`);
    signInPageUrl.searchParams.set("extension_id", chrome.runtime.id);
    signInPageUrl.searchParams.set("signin_csrf", csrf);
    const signInPageUrlString = signInPageUrl.toString();

    let originTabId = null;
    let signInTabId = null;
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
          chrome.tabs.onRemoved.removeListener(removedListener);
        } catch (_e) {
          /* ignore */
        }
        removedListener = null;
      }
    }

    function fail(err) {
      if (done) {
        return;
      }
      done = true;
      teardown();
      reject(err instanceof Error ? err : new Error(String(err)));
    }

    function succeed(parsed) {
      if (done) {
        return;
      }
      done = true;
      teardown();
      void (async () => {
        try {
          let activeSignInTabId = signInTabId;
          if (activeSignInTabId == null) {
            const matchingTabs = await chrome.tabs.query({ url: `${appBaseUrl}/auth/extension*` }).catch(() => []);
            const match = (matchingTabs || []).find((tab) =>
              String(tab.url || "").includes(`signin_csrf=${encodeURIComponent(csrf)}`)
            );
            activeSignInTabId = match?.id ?? null;
          }
          if (activeSignInTabId != null) {
            await chrome.tabs.update(activeSignInTabId, { url: successUrl }).catch(() => {});
          }
          await new Promise((r) => globalThis.setTimeout(r, EXTENSION_SIGNIN_SUCCESS_DELAY_MS));
          if (originTabId != null) {
            await chrome.tabs.update(originTabId, { active: true }).catch(() => {});
          }
          if (activeSignInTabId != null) {
            await chrome.tabs.remove(activeSignInTabId).catch(() => {});
          }
        } finally {
          resolve(parsed);
        }
      })();
    }

    pendingExtensionSignIn = {
      csrf,
      signInPageUrl: signInPageUrlString,
      deliverWebsiteSession(payload) {
        if (done) {
          return;
        }
        const email = String(payload?.email || "").trim().toLowerCase();
        const idToken = String(payload?.idToken || "").trim();
        if (!email || !idToken) {
          fail(new Error("Incomplete website sign-in"));
          return;
        }
        succeed({
          kind: "website_sync",
          email,
          idToken,
          uid: String(payload?.uid || "").trim(),
          expiresAtSec: Number(payload?.expiresAtSec || 0)
        });
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
        void persistFirebaseIdentity({
            idToken,
            refreshToken,
            email,
            uid,
            expiresAtSec
          })
          .then(() => {
            succeed({ kind: "website_sync", email, idToken, uid, expiresAtSec });
          })
          .catch((error) => {
            fail(error instanceof Error ? error : new Error(String(error)));
          });
      }
    };

    timeoutId = globalThis.setTimeout(() => fail(new Error("Sign-in timed out")), 120000);

    removedListener = (tabId) => {
      if (tabId === signInTabId && !done) {
        fail(new Error("Sign-in cancelled"));
      }
    };
    chrome.tabs.onRemoved.addListener(removedListener);

    const openSignInTab = () => {
      chrome.tabs.create({ url: signInPageUrlString, active: true }, (tab) => {
        if (chrome.runtime.lastError) {
          fail(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!tab?.id) {
          fail(new Error("Failed to open sign-in tab"));
          return;
        }
        signInTabId = tab.id;
      });
    };

    if (preferredOriginTabId != null) {
      originTabId = preferredOriginTabId;
      openSignInTab();
      return;
    }

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        fail(new Error(chrome.runtime.lastError.message));
        return;
      }
      const activeTab = Array.isArray(tabs) ? tabs[0] : null;
      if (activeTab?.id != null) {
        originTabId = activeTab.id;
      }
      openSignInTab();
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

async function buildExtensionAuthUrl(path = "/account") {
  const baseUrl = await getManagedProxyBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const targetUrl = `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
  try {
    const session = await getPromptlySession({ requireFreshToken: true });
    if (!session.signedIn || !session.idToken) {
      return targetUrl;
    }
    const response = await fetch(buildApiUrl(baseUrl, "/api/account/extension-auth-link"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-promptly-client": "promptly-extension",
        Authorization: `Bearer ${session.idToken}`
      },
      body: "{}"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return targetUrl;
    }
    const customToken = String(body?.customToken || "").trim();
    if (!customToken) {
      return targetUrl;
    }
    return `${targetUrl}#promptly_ext_custom_token=${encodeURIComponent(customToken)}`;
  } catch (_error) {
    return targetUrl;
  }
}

async function buildManageAccountUrl() {
  return buildExtensionAuthUrl("/account");
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

const CREDITS_CACHE_TTL_MS = 10_000;
const CREDITS_PERSIST_TTL_MS = 120_000;
const CREDITS_FETCH_TIMEOUT_MS = 12_000;
const CREDITS_STORAGE_KEY = "promptlyLastCredits";
/** @type {{ email: string, credits: object, fetchedAt: number } | null} */
let creditsCacheEntry = null;

function writeCreditsCache(email, credits) {
  const key = String(email || "").trim().toLowerCase();
  if (!key || !credits) {
    return;
  }
  const fetchedAt = Date.now();
  creditsCacheEntry = { email: key, credits, fetchedAt };
  void chrome.storage.local.set({
    [CREDITS_STORAGE_KEY]: { email: key, credits, fetchedAt }
  });
}

function clearCreditsCache() {
  creditsCacheEntry = null;
  void chrome.storage.local.remove(CREDITS_STORAGE_KEY);
}

async function readPersistedCreditsCache(email) {
  const key = String(email || "").trim().toLowerCase();
  if (!key) {
    return null;
  }
  if (creditsCacheEntry && creditsCacheEntry.email === key) {
    if (Date.now() - creditsCacheEntry.fetchedAt <= CREDITS_CACHE_TTL_MS) {
      return creditsCacheEntry.credits;
    }
  }
  const stored = await chrome.storage.local.get([CREDITS_STORAGE_KEY]);
  const row = stored?.[CREDITS_STORAGE_KEY] || null;
  if (!row?.credits || String(row.email || "").trim().toLowerCase() !== key) {
    return null;
  }
  if (Date.now() - Number(row.fetchedAt || 0) > CREDITS_PERSIST_TTL_MS) {
    return null;
  }
  creditsCacheEntry = {
    email: key,
    credits: row.credits,
    fetchedAt: Number(row.fetchedAt || 0)
  };
  return row.credits;
}

function promptlyWebsitePageMatchesSender(senderUrl) {
  try {
    const page = new URL(String(senderUrl || "").split("#")[0]);
    const host = page.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "promptly-labs.com" && page.protocol === "https:") {
      return true;
    }
    if (host.endsWith(".vercel.app") && page.protocol === "https:") {
      return true;
    }
    if ((host === "localhost" || host === "127.0.0.1") && page.protocol === "http:") {
      return true;
    }
    return false;
  } catch (_error) {
    return false;
  }
}

async function rebuildFirebaseIdentityFromGoogleSession() {
  const accessToken = await readWebAuthSessionTokenIfValid();
  if (!accessToken) {
    return null;
  }
  try {
    await persistFirebaseSessionAfterGoogleWebSignIn({ accessToken, idToken: "" });
  } catch (_error) {
    return null;
  }
  const reloaded = await chrome.storage.local.get(["promptlyFirebaseIdentity"]);
  const rebuilt = reloaded.promptlyFirebaseIdentity || null;
  if (!rebuilt?.idToken) {
    return null;
  }
  return rebuilt;
}

function sessionFromFirebaseIdentity(identity, authProvider = "firebase") {
  const email = String(identity?.email || "").trim().toLowerCase();
  const idToken = String(identity?.idToken || "").trim();
  if (!email || !idToken) {
    return null;
  }
  return {
    signedIn: true,
    email,
    chromeEmail: email,
    uid: String(identity?.uid || "").trim() || null,
    idToken,
    refreshToken: String(identity?.refreshToken || "").trim() || null,
    expiresAtSec: Number(identity?.expiresAtSec || 0) || 0,
    authProvider
  };
}

function signedOutPromptlySession() {
  return {
    signedIn: false,
    email: null,
    chromeEmail: null,
    uid: null,
    idToken: null,
    refreshToken: null,
    expiresAtSec: 0,
    authProvider: null
  };
}

async function getPromptlySession(options = {}) {
  const requireFreshToken = options.requireFreshToken !== false;
  const nowSec = Math.floor(Date.now() / 1000);
  const cached = await chrome.storage.local.get(["promptlyFirebaseIdentity"]);
  const identity = cached?.promptlyFirebaseIdentity || null;
  const cachedSession = sessionFromFirebaseIdentity(identity);
  const cachedTokenIsFresh =
    cachedSession && Number(cachedSession.expiresAtSec || 0) - FIREBASE_ID_TOKEN_BUFFER_SEC > nowSec;

  if (cachedSession && cachedTokenIsFresh) {
    return cachedSession;
  }

  if (identity?.refreshToken) {
    try {
      const refreshedIdentity = await getFirebaseIdentityForApi(true);
      const refreshedSession = sessionFromFirebaseIdentity(refreshedIdentity, "firebase_refresh");
      if (refreshedSession) {
        return refreshedSession;
      }
    } catch (_refreshError) {
      if (!options.requireFreshToken && cachedSession) {
        return cachedSession;
      }
    }
  }

  const rebuilt = await rebuildFirebaseIdentityFromGoogleSession();
  const rebuiltSession = sessionFromFirebaseIdentity(rebuilt, "google_web_rebuild");
  if (rebuiltSession && (!requireFreshToken || Number(rebuiltSession.expiresAtSec || 0) - FIREBASE_ID_TOKEN_BUFFER_SEC > nowSec)) {
    return rebuiltSession;
  }

  if (!requireFreshToken && cachedSession && String(identity?.refreshToken || "").trim()) {
    return cachedSession;
  }

  return signedOutPromptlySession();
}

async function getPromptlyApiAuthHeaders(options = {}) {
  const session = await getPromptlySession({ requireFreshToken: options.requireFreshToken !== false });
  if (!session.signedIn || !session.idToken) {
    const err = new Error("Sign in with Promptly first — use the Sign in button on the tab, then try again.");
    err.needsSignIn = true;
    throw err;
  }
  return {
    session,
    headers: {
      "x-promptly-client": "promptly-extension",
      Authorization: `Bearer ${session.idToken}`
    }
  };
}

async function fetchUserCreditsFromApi(message = {}, options = {}) {
  const baseUrl = await getManagedProxyBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing app base URL in extension settings");
  }

  const { session, headers: authHeaders } = await getPromptlyApiAuthHeaders({ requireFreshToken: true });
  const accountEmail = String(session.email || "").trim().toLowerCase();
  const skipCache = options.skipCache !== true && options.forceRefresh !== true;
  if (skipCache && accountEmail) {
    const cached = await readPersistedCreditsCache(accountEmail);
    if (cached) {
      return {
        credits: cached,
        creditSource: "cache",
        authProvider: session.authProvider || null,
        hasIdToken: !!session.idToken
      };
    }
  }

  const estimateHeaders = buildCreditEstimateHeaders(message);
  let body = {};
  let credits = null;
  let creditSource = "";
  let authStatus = 0;

  const accountResponse = await fetchWithTimeout(
    buildApiUrl(baseUrl, "/api/account/credits"),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.idToken}`,
        ...estimateHeaders
      }
    },
    CREDITS_FETCH_TIMEOUT_MS
  );
  authStatus = accountResponse.status;
  body = await accountResponse.json().catch(() => ({}));
  if (accountResponse.ok && body?.credits) {
    credits = body.credits;
    creditSource = "account";
  }

  if (!credits) {
    const extensionResponse = await fetchWithTimeout(
      buildApiUrl(baseUrl, "/api/credits"),
      { method: "GET", headers: { ...authHeaders, ...estimateHeaders } },
      CREDITS_FETCH_TIMEOUT_MS
    );
    authStatus = extensionResponse.status;
    body = await extensionResponse.json().catch(() => ({}));
    if (extensionResponse.ok && body?.credits) {
      credits = body.credits;
      creditSource = "extension";
    }
  }

  if (!credits) {
    if (accountEmail) {
      const stale = await readPersistedCreditsCache(accountEmail);
      if (stale) {
        return {
          credits: stale,
          creditSource: "stale-cache",
          authProvider: session.authProvider || null,
          hasIdToken: !!session.idToken
        };
      }
    }
    const err = new Error(String(body?.error || "Unable to load credits"));
    if (authStatus === 401) {
      err.needsSignIn = true;
    }
    throw err;
  }

  writeCreditsCache(accountEmail, credits);
  return {
    credits,
    creditSource,
    authProvider: session.authProvider || null,
    hasIdToken: !!session.idToken
  };
}

function buildCreditEstimateHeaders(message) {
  const headers = {};
  const hasLenEstimate =
    typeof message?.estimatePromptLength === "number" &&
    typeof message?.estimateInstructionLength === "number";
  if (!hasLenEstimate) {
    return headers;
  }
  headers["x-promptly-estimate-prompt-length"] = String(
    Math.max(0, Math.floor(message.estimatePromptLength))
  );
  headers["x-promptly-estimate-instruction-length"] = String(
    Math.max(0, Math.floor(message.estimateInstructionLength))
  );
  return headers;
}

function prefetchUserCredits() {
  void fetchUserCreditsFromApi({}, { skipCache: true }).catch(() => {});
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
    await persistFirebaseIdentity(nextIdentity);
  }
}

async function refreshFirebaseIdToken({ firebaseWebApiKey, refreshToken }) {
  const response = await fetchWithTimeout(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseWebApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }).toString()
    },
    8000
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
  if (!firebaseWebApiKey) {
    throw new Error("Missing Firebase Web API key in extension settings");
  }
  if (!firebaseAuthDomain) {
    throw new Error("Missing Firebase auth domain in extension settings");
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

  if (!identity?.refreshToken) {
    const rebuilt = await rebuildFirebaseIdentityFromGoogleSession();
    if (
      rebuilt?.idToken &&
      Number(rebuilt.expiresAtSec || 0) - FIREBASE_ID_TOKEN_BUFFER_SEC > nowSec
    ) {
      return rebuilt;
    }
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
        await persistFirebaseIdentity(nextIdentity);
        return nextIdentity;
      }
    } catch (_error) {
      try {
        const webToken = await readWebAuthSessionTokenIfValid();
        if (webToken) {
          await persistFirebaseSessionAfterGoogleWebSignIn({
            accessToken: webToken,
            idToken: String(identity.idToken || "")
          });
          const reloaded = await chrome.storage.local.get(["promptlyFirebaseIdentity"]);
          const rebuilt = reloaded.promptlyFirebaseIdentity || null;
          if (
            rebuilt?.idToken &&
            Number(rebuilt.expiresAtSec || 0) - FIREBASE_ID_TOKEN_BUFFER_SEC > nowSec
          ) {
            return rebuilt;
          }
        }
      } catch (_rebuildError) {
        // Silent only — never open the sign-in popup from background API calls.
      }
    }
  }

  throw new Error("Not signed in");
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
  void ensureFirebaseTokenFreshness();
});

chrome.runtime.onStartup.addListener(async () => {
  await getManagedProxyBaseUrl();
  void ensureFirebaseTokenFreshness();
});

if (chrome.action && chrome.tabs && typeof chrome.tabs.create === "function") {
  chrome.action.onClicked.addListener(() => {
    getManagedProxyBaseUrl()
      .then((baseUrl) => {
        chrome.tabs.create({ url: baseUrl || DEFAULT_PROXY_BASE_URL });
      })
      .catch(() => {
        chrome.tabs.create({ url: DEFAULT_PROXY_BASE_URL });
      });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    !message ||
    ![
      "PROMPTLY_OPTIMIZE_PROMPT",
      "PROMPTLY_HOST_ACTIVITY_BATCH",
      "PROMPTLY_HOST_WATCH_SYNC",
      "PROMPTLY_VERIFY_USER_SESSION",
      "PROMPTLY_GET_CREDITS",
      "PROMPTLY_CHECK_CHROME_SIGNIN",
      "PROMPTLY_ENSURE_CHROME_SIGNIN",
      "PROMPTLY_GET_ACCOUNT_STATUS",
      "PROMPTLY_GET_MANAGE_ACCOUNT_URL",
      "PROMPTLY_GET_STATISTICS_URL",
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
        if (chrome.alarms?.clear) {
          await chrome.alarms.clear(FIREBASE_REFRESH_ALARM).catch(() => {});
        }
        clearCreditsCache();
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "PROMPTLY_GET_CREDITS") {
        try {
          const creditResult = await fetchUserCreditsFromApi(message, {
            skipCache: message.forceRefresh === true
          });
          sendResponse({
            ok: true,
            data: {
              ok: true,
              credits: creditResult.credits,
              creditSource: creditResult.creditSource,
              authProvider: creditResult.authProvider,
              hasIdToken: creditResult.hasIdToken
            }
          });
        } catch (error) {
          sendResponse({
            ok: false,
            error: String(error?.message || error),
            needsSignIn: !!error?.needsSignIn
          });
        }
        return;
      }

      if (message.type === "PROMPTLY_CHECK_CHROME_SIGNIN") {
        const session = await getPromptlySession({ requireFreshToken: false });
        if (!session.signedIn) {
          sendResponse({ ok: false, error: "Not signed in" });
          return;
        }
        const data = {
          chromeEmail: session.email,
          authProvider: session.authProvider || null,
          hasIdToken: !!session.idToken
        };
        if (!session.idToken) {
          const fresh = await getPromptlySession({ requireFreshToken: true });
          data.hasIdToken = !!fresh.idToken;
        }
        if (message.includeCredits) {
          try {
            const creditResult = await fetchUserCreditsFromApi(message, { skipCache: false });
            data.credits = creditResult.credits;
            data.creditSource = creditResult.creditSource;
          } catch (_creditsError) {
            data.credits = await readPersistedCreditsCache(session.email);
            data.creditSource = data.credits ? "stale-cache" : null;
          }
        }
        sendResponse({ ok: true, data });
        return;
      }

      if (message.type === "PROMPTLY_ENSURE_CHROME_SIGNIN") {
        const existingSession = await getPromptlySession({ requireFreshToken: false });
        if (existingSession.signedIn) {
          prefetchUserCredits();
          sendResponse({
            ok: true,
            data: {
              chromeEmail: existingSession.email,
              authProvider: existingSession.authProvider || null,
              hasIdToken: !!existingSession.idToken
            }
          });
          return;
        }
        // Explicit sign-in only — opens a website tab when no persisted session exists.
        const originTabId = typeof _sender?.tab?.id === "number" ? _sender.tab.id : null;
        await completeExtensionSignInTab({ originTabId });
        const nextSession = await getPromptlySession({ requireFreshToken: false });
        if (!nextSession.signedIn) {
          sendResponse({ ok: false, error: "Sign-in failed" });
          return;
        }
        prefetchUserCredits();
        sendResponse({
          ok: true,
          data: {
            chromeEmail: nextSession.email,
            authProvider: nextSession.authProvider || "website_sync",
            hasIdToken: !!nextSession.idToken
          }
        });
        return;
      }

      if (message.type === "PROMPTLY_GET_ACCOUNT_STATUS") {
        const session = await getPromptlySession({ requireFreshToken: true });
        if (!session.signedIn || !session.idToken) {
          sendResponse({ ok: false, error: "Not signed in" });
          return;
        }
        let subscriptionTier = "";
        try {
          const baseUrl = await getManagedProxyBaseUrl();
          const response = await fetch(buildApiUrl(baseUrl, "/api/account/billing"), {
            method: "GET",
            headers: {
              Authorization: `Bearer ${session.idToken}`
            }
          });
          const body = await response.json().catch(() => ({}));
          if (response.ok) {
            subscriptionTier = String(body?.subscriptionTier || "").trim().toLowerCase();
          }
        } catch (_error) {
          // Keep tier empty when billing is unavailable; user remains signed in.
        }
        sendResponse({
          ok: true,
          data: {
            chromeEmail: session.email,
            subscriptionTier: subscriptionTier || null,
            authProvider: session.authProvider || null,
            hasIdToken: !!session.idToken
          }
        });
        return;
      }

      if (message.type === "PROMPTLY_GET_MANAGE_ACCOUNT_URL") {
        const url = await buildManageAccountUrl();
        sendResponse({ ok: true, data: { url } });
        return;
      }

      if (message.type === "PROMPTLY_GET_STATISTICS_URL") {
        const url = await buildExtensionAuthUrl("/account/statistics");
        sendResponse({ ok: true, data: { url } });
        return;
      }

      if (message.type === "PROMPTLY_VERIFY_USER_SESSION") {
        const session = await getPromptlySession({ requireFreshToken: false });
        const sessionEmail = String(session.email || "").trim().toLowerCase();
        if (!sessionEmail) {
          sendResponse({ ok: false, error: "Sign in to Promptly first — use the Sign in button on the tab." });
          return;
        }
        sendResponse({
          ok: true,
          data: {
            chromeEmail: sessionEmail || null,
            authProvider: session.authProvider || null,
            hasIdToken: !!session.idToken
          }
        });
        return;
      }

      let apiAuthHeaders;
      try {
        const auth = await getPromptlyApiAuthHeaders({ requireFreshToken: true });
        apiAuthHeaders = auth.headers;
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

      if (message.type === "PROMPTLY_HOST_WATCH_SYNC") {
        const tabId = _sender?.tab?.id;
        const watches = Array.isArray(message.watches) ? message.watches.slice(0, 8) : [];
        if (typeof tabId === "number") {
          await chrome.storage.session.set({ [`promptlyHostWatches:${tabId}`]: watches });
        }
        sendResponse({ ok: true });
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
          credits: body.credits || null,
          needsSignIn: response.status === 401
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
