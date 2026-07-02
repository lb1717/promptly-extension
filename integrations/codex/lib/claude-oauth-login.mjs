/**
 * Claude subscription OAuth — browser login with PKCE, stored in ~/.promptly/claude-auth.json.
 * Matches Claude Code CLI parameters (no macOS Keychain).
 */
import { createHash, randomBytes } from "crypto";
import { createServer } from "http";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { execSync } from "child_process";

const AUTH_URL = "https://claude.com/cai/oauth/authorize";
const TOKEN_URLS = [
  "https://api.anthropic.com/v1/oauth/token",
  "https://platform.claude.com/v1/oauth/token",
  "https://console.anthropic.com/v1/oauth/token"
];
const SUCCESS_URL = "https://platform.claude.com/oauth/code/success?app=claude-code";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const OAUTH_SCOPE =
  "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";
const CLAUDE_CLI_UA = "claude-cli/2.1.9 (external, cli)";

function isQuiet() {
  return process.env.PROMPTLY_QUIET === "1";
}

function logInfo(...args) {
  if (!isQuiet()) console.log(...args);
}

export function claudeAuthJsonPath() {
  return join(homedir(), ".promptly", "claude-auth.json");
}

function pendingOAuthPath() {
  return join(homedir(), ".promptly", "claude-oauth-pending.json");
}

function readJson(path, fallback = null) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function clearPendingOAuth() {
  try {
    if (existsSync(pendingOAuthPath())) unlinkSync(pendingOAuthPath());
  } catch {
    /* ignore */
  }
}

function savePendingOAuth(data) {
  writeJson(pendingOAuthPath(), { ...data, started_at_ms: Date.now() });
}

function readPendingOAuth() {
  const row = readJson(pendingOAuthPath(), null);
  if (!row || typeof row !== "object") return null;
  if (Date.now() - (row.started_at_ms || 0) > 10 * 60 * 1000) {
    clearPendingOAuth();
    return null;
  }
  return row;
}

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createPkce() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function createOAuthState() {
  return base64Url(randomBytes(32));
}

function normalizeRedirectUri(uri) {
  if (!uri) return uri;
  try {
    const url = new URL(uri);
    url.hostname = "localhost";
    return url.toString().replace(/\/$/, "") || uri;
  } catch {
    return uri;
  }
}

function parseStoredAuth(raw) {
  if (!raw || typeof raw !== "object") return null;
  const oauth = raw.claudeAiOauth || raw.oauth || raw.tokens || raw;
  const accessToken = oauth?.accessToken || oauth?.access_token;
  const refreshToken = oauth?.refreshToken || oauth?.refresh_token || null;
  const expiresAt =
    typeof oauth?.expiresAt === "number"
      ? oauth.expiresAt
      : typeof oauth?.expires_at === "number"
        ? oauth.expires_at
        : null;
  const email = oauth?.email || raw.email || null;
  if (typeof accessToken !== "string" || accessToken.length < 20) return null;
  return { accessToken, refreshToken, expiresAt, email };
}

export function readPromptlyClaudeAuth() {
  return parseStoredAuth(readJson(claudeAuthJsonPath(), null));
}

export function clearPromptlyClaudeAuth() {
  try {
    if (existsSync(claudeAuthJsonPath())) unlinkSync(claudeAuthJsonPath());
  } catch {
    /* ignore */
  }
  clearPendingOAuth();
}

function savePromptlyClaudeAuth({ accessToken, refreshToken, expiresAt, email }) {
  const path = claudeAuthJsonPath();
  writeJson(path, {
    claudeAiOauth: {
      accessToken,
      refreshToken,
      expiresAt,
      email
    },
    updated_at_ms: Date.now()
  });
  clearPendingOAuth();
  return path;
}

async function postTokenJson(body) {
  const errors = [];
  for (const url of TOKEN_URLS) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": CLAUDE_CLI_UA
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text.slice(0, 200) };
    }
    if (res.ok) return parsed;
    errors.push(`${url}: ${parsed.error_description || parsed.error || `HTTP ${res.status}`}`);
  }
  throw new Error(errors.join(" | "));
}

async function exchangeCode({ code, state, verifier, redirectUri }) {
  const authCode = String(code).split("#")[0];
  const body = await postTokenJson({
    code: authCode,
    state,
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    redirect_uri: normalizeRedirectUri(redirectUri),
    code_verifier: verifier
  });
  const expiresAt = body.expires_in ? Date.now() + Number(body.expires_in) * 1000 : null;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiresAt,
    email: body.account?.email_address || body.account?.email || null
  };
}

async function refreshAccessToken(refreshToken) {
  const body = await postTokenJson({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  const expiresAt = body.expires_in ? Date.now() + Number(body.expires_in) * 1000 : null;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || refreshToken,
    expiresAt,
    email: body.account?.email_address || body.account?.email || null
  };
}

function openBrowser(url) {
  try {
    if (process.platform === "darwin") execSync(`open ${JSON.stringify(url)}`, { stdio: "ignore" });
    else if (process.platform === "win32") execSync(`start "" ${JSON.stringify(url)}`, { stdio: "ignore", shell: true });
    else execSync(`xdg-open ${JSON.stringify(url)}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function buildAuthUrl(state, challenge, redirectUri) {
  const params = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: normalizeRedirectUri(redirectUri),
    scope: OAUTH_SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function htmlError(message) {
  const safe = String(message).replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch]);
  return `<html><body style="font-family:system-ui;padding:2rem"><h2>Login failed</h2><p>${safe}</p><p style="color:#666">Close this tab and run sync again from Promptly.</p></body></html>`;
}

function htmlSuccess() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Signed in</title></head><body style="font-family:system-ui;padding:2rem;text-align:center"><h2>Signed in to Claude</h2><p>You can close this tab — setup continues in Terminal automatically.</p><script>setTimeout(function(){try{window.close()}catch(e){}},600);</script></body></html>`;
}

async function probeClaudeUsageToken(accessToken) {
  if (!accessToken) return false;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "anthropic-beta": "oauth-2025-04-20",
    Accept: "application/json",
    "User-Agent": CLAUDE_CLI_UA
  };
  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", { headers });
    return res.ok;
  } catch {
    return false;
  }
}

async function completeFromCallbackUrl(callbackUrl) {
  const pending = readPendingOAuth();
  if (!pending?.verifier || !pending?.redirect_uri) {
    throw new Error("No pending Claude login session. Run usage-sync again to start a fresh login.");
  }
  const url = new URL(callbackUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) throw new Error("Callback URL is missing ?code=");
  if (state && state !== pending.state) throw new Error("Callback state does not match the pending login session.");
  return exchangeCode({
    code,
    state: state || pending.state,
    verifier: pending.verifier,
    redirectUri: pending.redirect_uri
  });
}

export async function ensureClaudeOAuthLogin({
  interactive = true,
  timeoutMs = 120000,
  callbackUrl = null,
  forceBrowser = false
} = {}) {
  if (forceBrowser && !callbackUrl) {
    clearPromptlyClaudeAuth();
  }

  const existing = readPromptlyClaudeAuth();
  if (existing?.accessToken && !callbackUrl && !forceBrowser) {
    const expiresSoon = existing.expiresAt && existing.expiresAt - Date.now() < 5 * 60 * 1000;
    if (!expiresSoon) return existing;
    if (existing.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(existing.refreshToken);
        savePromptlyClaudeAuth(refreshed);
        return refreshed;
      } catch {
        clearPromptlyClaudeAuth();
        /* fall through to browser login */
      }
    } else {
      clearPromptlyClaudeAuth();
    }
  }

  if (callbackUrl) {
    const tokens = await completeFromCallbackUrl(callbackUrl);
    savePromptlyClaudeAuth(tokens);
    return tokens;
  }

  if (!interactive) {
    return null;
  }

  const state = createOAuthState();
  const { verifier, challenge } = createPkce();

  const tokens = await new Promise((resolve, reject) => {
    let settled = false;
    let redirectUri = "";
    let pollAuth = null;
    let timer = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (pollAuth) clearInterval(pollAuth);
      try {
        server.close();
      } catch {
        /* ignore */
      }
      fn(value);
    };

    pollAuth = setInterval(async () => {
      if (settled) return;
      const saved = readPromptlyClaudeAuth();
      if (!saved?.accessToken) return;
      if (saved.expiresAt && saved.expiresAt - Date.now() < 60_000) return;
      try {
        if (await probeClaudeUsageToken(saved.accessToken)) {
          logInfo("✓ Claude sign-in complete — continuing setup…");
          finish(resolve, saved);
        }
      } catch {
        /* ignore */
      }
    }, 500);

    const server = createServer(async (req, res) => {
      try {
        const host = req.headers.host || "localhost";
        const url = new URL(req.url || "/", `http://${host}`);
        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        if (!code) {
          res.writeHead(400);
          res.end("Missing authorization code");
          finish(reject, new Error("OAuth callback missing code"));
          return;
        }
        if (returnedState && returnedState !== state) {
          res.writeHead(400);
          res.end("State mismatch");
          finish(reject, new Error("OAuth state mismatch"));
          return;
        }
        const exchanged = await exchangeCode({
          code,
          state: returnedState || state,
          verifier,
          redirectUri
        });
        savePromptlyClaudeAuth(exchanged);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlSuccess());
        logInfo("✓ Claude sign-in complete — continuing setup…");
        finish(resolve, exchanged);
      } catch (err) {
        const message = String(err?.message || err);
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlError(message));
        finish(reject, new Error(message));
      }
    });

    server.on("error", (err) => finish(reject, err));

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        finish(reject, new Error("Could not start OAuth callback server"));
        return;
      }
      redirectUri = `http://localhost:${address.port}/callback`;
      savePendingOAuth({ state, verifier, redirect_uri: redirectUri });
      const authUrl = buildAuthUrl(state, challenge, redirectUri);
      logInfo("Opening browser for Claude subscription sign-in…");
      logInfo("Setup continues automatically when sign-in finishes — you do not need to close the browser.");
      if (!openBrowser(authUrl)) {
        logInfo(`Open this URL to sign in:\n${authUrl}`);
      }
    });

    timer = setTimeout(() => {
      finish(reject, new Error("OAuth login timed out — complete sign-in in the browser within 2 minutes"));
    }, timeoutMs);
  });

  return tokens;
}

export async function runClaudeOAuthLoginOnly({ callbackUrl = null } = {}) {
  const tokens = await ensureClaudeOAuthLogin({ interactive: true, callbackUrl });
  return {
    ok: Boolean(tokens?.accessToken),
    auth_path: claudeAuthJsonPath(),
    email: tokens?.email || null
  };
}
