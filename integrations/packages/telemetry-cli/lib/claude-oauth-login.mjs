/**
 * Claude subscription OAuth — browser login with PKCE, stored in ~/.promptly/claude-auth.json.
 * Same OAuth flow Claude Code uses; no macOS Keychain access.
 */
import { createHash, randomBytes } from "crypto";
import { createServer } from "http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { execSync } from "child_process";

const AUTH_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://api.anthropic.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const REDIRECT_PORT = 54545;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const OAUTH_SCOPE =
  "user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

export function claudeAuthJsonPath() {
  return join(homedir(), ".promptly", "claude-auth.json");
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
  return path;
}

async function exchangeCode(code, state, verifier) {
  const parsed = String(code).split("#");
  const authCode = parsed[0];
  const stateFromCode = parsed[1] || state;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      code: authCode,
      state: stateFromCode,
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error_description || body.error || `Token exchange HTTP ${res.status}`);
  }
  const expiresAt = body.expires_in ? Date.now() + Number(body.expires_in) * 1000 : null;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiresAt,
    email: body.account?.email_address || body.account?.email || null
  };
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error_description || body.error || `Token refresh HTTP ${res.status}`);
  }
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

function buildAuthUrl(state, challenge) {
  const params = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: OAUTH_SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function ensureClaudeOAuthLogin({ interactive = true, timeoutMs = 120000 } = {}) {
  const existing = readPromptlyClaudeAuth();
  if (existing?.accessToken) {
    const expiresSoon = existing.expiresAt && existing.expiresAt - Date.now() < 5 * 60 * 1000;
    if (!expiresSoon) return existing;
    if (existing.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(existing.refreshToken);
        savePromptlyClaudeAuth(refreshed);
        return refreshed;
      } catch {
        /* fall through to browser login */
      }
    }
  }

  if (!interactive) {
    return null;
  }

  const state = base64Url(randomBytes(16));
  const { verifier, challenge } = createPkce();
  const authUrl = buildAuthUrl(state, challenge);

  const tokens = await new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", REDIRECT_URI);
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
          reject(new Error("OAuth callback missing code"));
          return;
        }
        if (returnedState && returnedState !== state) {
          res.writeHead(400);
          res.end("State mismatch");
          reject(new Error("OAuth state mismatch"));
          return;
        }
        const exchanged = await exchangeCode(code, state, verifier);
        savePromptlyClaudeAuth(exchanged);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><body><h2>Claude connected</h2><p>You can close this tab and return to Promptly.</p></body></html>"
        );
        resolve(exchanged);
      } catch (err) {
        res.writeHead(500);
        res.end("Login failed");
        reject(err);
      } finally {
        server.close();
      }
    });
    server.on("error", reject);
    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      openBrowser(authUrl);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth login timed out — complete sign-in in the browser within 2 minutes"));
    }, timeoutMs);
  });

  return tokens;
}

export async function runClaudeOAuthLoginOnly() {
  const tokens = await ensureClaudeOAuthLogin({ interactive: true });
  return {
    ok: Boolean(tokens?.accessToken),
    auth_path: claudeAuthJsonPath(),
    email: tokens?.email || null
  };
}
