const DEFAULT_PROXY_BASE_URL = "http://localhost:3000";
const GOOGLE_ACCESS_TOKEN_BUFFER_SEC = 60;
const FIREBASE_ID_TOKEN_BUFFER_SEC = 60;
const DEFAULT_FIREBASE_WEB_API_KEY = "AIzaSyChQ2kiTwunWs9ElDYkU7Cz-i8I9dw29NI";
const DEFAULT_FIREBASE_AUTH_DOMAIN = "promptly-prod-976ef.firebaseapp.com";
const DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID = "575107146310-715uuvv59lrde0k340jm0btufebokk2g.apps.googleusercontent.com";

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

function randomString(byteLength = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function parseRedirectFragment(url) {
  const fragment = String(url || "").split("#")[1] || "";
  const params = new URLSearchParams(fragment);
  const error = String(params.get("error") || "").trim();
  if (error) {
    const description = String(params.get("error_description") || "").trim();
    throw new Error(description ? `${error}: ${description}` : error);
  }
  return {
    accessToken: String(params.get("access_token") || "").trim(),
    idToken: String(params.get("id_token") || "").trim(),
    state: String(params.get("state") || "").trim()
  };
}

function launchGoogleWebAuthFlow(clientId) {
  return new Promise((resolve, reject) => {
    if (!chrome.identity?.launchWebAuthFlow) {
      reject(new Error("Chrome web auth flow unavailable"));
      return;
    }
    const redirectUri = chrome.identity.getRedirectURL();
    const state = randomString(12);
    const nonce = randomString(12);
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "token id_token");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("prompt", "select_account");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("nonce", nonce);

    chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      try {
        const parsed = parseRedirectFragment(responseUrl || "");
        if (parsed.state !== state) {
          reject(new Error("OAuth state mismatch"));
          return;
        }
        if (!parsed.accessToken && !parsed.idToken) {
          reject(new Error("Google OAuth returned no token"));
          return;
        }
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeBaseUrl(rawValue) {
  const trimmed = String(rawValue || "").trim() || DEFAULT_PROXY_BASE_URL;
  return trimmed.replace(/\/$/, "");
}

function buildApiUrl(baseUrl, path) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (normalizedBase.endsWith("/api")) {
    return `${normalizedBase}${path.replace(/^\/api/, "")}`;
  }
  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildFirebaseRequestUri(authDomain) {
  const trimmed = String(authDomain || "").trim();
  if (!trimmed) {
    throw new Error("Missing Firebase auth domain in extension settings");
  }
  return `https://${trimmed.replace(/^https?:\/\//, "").replace(/\/$/, "")}/__/auth/handler`;
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

  const googleSession = await launchGoogleWebAuthFlow(firebaseOAuthWebClientId);
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

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get([
    "proxyBaseUrl",
    "firebaseWebApiKey",
    "firebaseAuthDomain",
    "firebaseOAuthWebClientId"
  ]);
  const next = {
    proxyBaseUrl: String(existing.proxyBaseUrl || "").trim() || DEFAULT_PROXY_BASE_URL,
    firebaseWebApiKey: String(existing.firebaseWebApiKey || "").trim() || DEFAULT_FIREBASE_WEB_API_KEY,
    firebaseAuthDomain: String(existing.firebaseAuthDomain || "").trim() || DEFAULT_FIREBASE_AUTH_DOMAIN,
    firebaseOAuthWebClientId:
      String(existing.firebaseOAuthWebClientId || "").trim() || DEFAULT_FIREBASE_WEB_OAUTH_CLIENT_ID
  };
  await chrome.storage.sync.set(next);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    !message ||
    ![
      "PROMPTLY_OPTIMIZE_PROMPT",
      "PROMPTLY_VERIFY_USER_SESSION",
      "PROMPTLY_GET_CREDITS",
      "PROMPTLY_CHECK_CHROME_SIGNIN",
      "PROMPTLY_ENSURE_CHROME_SIGNIN"
    ].includes(message.type)
  ) {
    return false;
  }

  (async () => {
    try {
      if (message.type === "PROMPTLY_CHECK_CHROME_SIGNIN") {
        try {
          const chromeEmail = await getSignedInChromeEmail();
          sendResponse({ ok: true, data: { chromeEmail } });
        } catch (error) {
          sendResponse({ ok: false, error: String(error?.message || error) });
        }
        return;
      }

      if (message.type === "PROMPTLY_ENSURE_CHROME_SIGNIN") {
        // Attempt a non-interactive check first (fast path).
        try {
          const chromeEmail = await getSignedInChromeEmail();
          sendResponse({ ok: true, data: { chromeEmail } });
          return;
        } catch (_err) {
          // Fall through to an interactive token request which will trigger
          // the Google sign-in pop-up if needed.
        }

        await getChromeGoogleAccessToken(true);
        const chromeEmail = await getSignedInChromeEmail();
        sendResponse({ ok: true, data: { chromeEmail } });
        return;
      }

      if (message.type === "PROMPTLY_VERIFY_USER_SESSION") {
        const chromeEmail = await getSignedInChromeEmail();
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

      const [chromeEmail, googleAccessToken, settings] = await Promise.all([
        getSignedInChromeEmail(),
        (async () => {
          try {
            return await getChromeGoogleAccessToken(false);
          } catch (_err) {
            return getChromeGoogleAccessToken(true);
          }
        })(),
        chrome.storage.sync.get(["proxyBaseUrl"])
      ]);
      const { proxyBaseUrl } = settings || {};
      const baseUrl = normalizeBaseUrl(proxyBaseUrl);
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
        const creditHeaders = {
          "x-promptly-client": "promptly-extension",
          "x-promptly-user-email": chromeEmail,
          "x-promptly-google-access-token": googleAccessToken
        };
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

      const response = await fetch(buildApiUrl(baseUrl, "/api/optimize"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-promptly-client": "promptly-extension",
          "x-promptly-user-email": chromeEmail,
          "x-promptly-google-access-token": googleAccessToken
        },
        body: JSON.stringify({
          prompt,
          user_instruction: userInstruction,
          request_mode: requestMode
        })
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
