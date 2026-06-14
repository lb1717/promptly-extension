/**
 * Claude subscription OAuth — browser login with PKCE, stored in ~/.promptly/claude-auth.json.
 * Matches Claude Code CLI parameters (no macOS Keychain).
 */
import { createHash, randomBytes } from "crypto";
import { createServer } from "http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { execSync } from "child_process";

const AUTH_URL = "https://claude.com/cai/oauth/authorize";
const TOKEN_URLS = [
  "https://platform.claude.com/v1/oauth/token",
  "https://api.anthropic.com/v1/oauth/token"
];
const SUCCESS_URL = "https://platform.claude.com/oauth/code/success?app=claude-code";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const OAUTH_SCOPE =
  "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";
const CLAUDE_CLI_UA = "claude-cli/2.1.9 (external, cli)";

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

function createOAuthState() {
  return base64Url(randomBytes(32));
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

async function postTokenJson(body) {
  let lastError = "Token request failed";
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
    const parsed = await res.json().catch(() => ({}));
    if (res.ok) return parsed;
    lastError = parsed.error_description || parsed.error || `HTTP ${res.status} from ${url}`;
  }
  throw new Error(lastError);
}

async function exchangeCode(code, state, verifier, redirectUri) {
  const parsed = String(code).split("#");
  const authCode = parsed[0];
  const stateFromCode = parsed[1] || state;
  const body = await postTokenJson({
    code: authCode,
    state: stateFromCode,
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
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
    redirect_uri: redirectUri,
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

  const state = createOAuthState();
  const { verifier, challenge } = createPkce();

  const tokens = await new Promise((resolve, reject) => {
    let settled = false;
    let redirectUri = "";
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        server.close();
      } catch {
        /* ignore */
      }
      fn(value);
    };

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", redirectUri || "http://127.0.0.1");
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
        const exchanged = await exchangeCode(code, state, verifier, redirectUri);
        savePromptlyClaudeAuth(exchanged);
        res.writeHead(302, { Location: SUCCESS_URL });
        res.end();
        finish(resolve, exchanged);
      } catch (err) {
        res.writeHead(500);
        res.end("Login failed");
        finish(reject, err);
      }
    });

    server.on("error", (err) => finish(reject, err));

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        finish(reject, new Error("Could not start OAuth callback server"));
        return;
      }
      redirectUri = `http://127.0.0.1:${address.port}/callback`;
      const authUrl = buildAuthUrl(state, challenge, redirectUri);
      openBrowser(authUrl);
    });

    const timer = setTimeout(() => {
      finish(reject, new Error("OAuth login timed out — complete sign-in in the browser within 2 minutes"));
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
