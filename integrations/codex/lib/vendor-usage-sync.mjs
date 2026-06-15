/**
 * Vendor subscription usage sync (Claude Code, Codex, Cursor) — local OAuth only.
 * Never touches macOS Keychain (avoids repeated "Claude Safe Storage" prompts).
 */
import { createHash } from "crypto";
import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { homedir, platform } from "os";
import { basename, join } from "path";
import {
  claudeAuthJsonPath,
  ensureClaudeOAuthLogin,
  readPromptlyClaudeAuth
} from "./claude-oauth-login.mjs";

const CLAUDE_USAGE_BETA = "oauth-2025-04-20";

function readJson(path, fallback = null) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function hashProfileId(configDir) {
  return createHash("sha256").update(configDir).digest("hex").slice(0, 16);
}

function profileLabelFromDir(configDir) {
  const base = basename(configDir);
  if (base === ".claude") return "Default";
  if (base.startsWith(".claude-")) return base.replace(/^\.claude-?/, "") || base;
  if (configDir.includes(".claude-profiles")) {
    const parts = configDir.split("/");
    const idx = parts.indexOf(".claude-profiles");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  }
  return base || "Profile";
}

function parseClaudeOAuthToken(raw, depth = 0) {
  if (raw == null || depth > 8) return null;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    if (text.startsWith("{")) {
      try {
        return parseClaudeOAuthToken(JSON.parse(text), depth + 1);
      } catch {
        return null;
      }
    }
    if (text.length > 20 && (text.startsWith("sk-ant-") || text.startsWith("eyJ"))) return text;
    return null;
  }
  if (typeof raw !== "object") return null;
  const oauth = raw.claudeAiOauth || raw.claudeAi || raw.oauth || raw;
  const direct = oauth?.accessToken || oauth?.access_token || oauth?.access;
  if (typeof direct === "string" && direct.length > 20) return direct;
  for (const value of Object.values(raw)) {
    const nested = parseClaudeOAuthToken(value, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function readClaudeEnvToken() {
  return parseClaudeOAuthToken(process.env.CLAUDE_CODE_OAUTH_TOKEN);
}

function promptlyClaudeOAuthTokenPath() {
  return join(homedir(), ".promptly", "claude-oauth-token");
}

function readPromptlyClaudeOAuthTokenFile() {
  const path = promptlyClaudeOAuthTokenPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8").trim();
    return parseClaudeOAuthToken(raw) || (raw.length > 20 ? raw : null);
  } catch {
    return null;
  }
}

function defaultClaudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

function isDefaultClaudeConfigDir(configDir) {
  const home = homedir();
  const normalized = configDir.replace(/\\/g, "/");
  return (
    normalized === join(home, ".claude").replace(/\\/g, "/") ||
    normalized.endsWith("/.claude") ||
    normalized === defaultClaudeConfigDir().replace(/\\/g, "/")
  );
}

function readClaudeAccessToken(configDir) {
  if (isDefaultClaudeConfigDir(configDir)) {
    const fromPromptlyAuth = readPromptlyClaudeAuth()?.accessToken;
    if (fromPromptlyAuth) return fromPromptlyAuth;
  }

  const credPath = join(configDir, ".credentials.json");
  const fromFile = parseClaudeOAuthToken(readJson(credPath, null));
  if (fromFile) return fromFile;

  if (isDefaultClaudeConfigDir(configDir)) {
    const fromState = parseClaudeOAuthToken(readJson(join(homedir(), ".claude.json"), null));
    if (fromState) return fromState;
    const fromEnv = readClaudeEnvToken();
    if (fromEnv) return fromEnv;
    const fromPromptlyFile = readPromptlyClaudeOAuthTokenFile();
    if (fromPromptlyFile) return fromPromptlyFile;
  }
  return null;
}

function hasClaudeUsageAuth() {
  return Boolean(readClaudeAccessToken(defaultClaudeConfigDir()));
}

function describeClaudeAuthFailure(interactive) {
  if (interactive) {
    return "Claude sign-in did not complete. Run usage-sync again — your browser will open for a one-time claude.ai login.";
  }
  return "No Claude OAuth token saved yet. Run the sync command from Terminal.app — it opens your browser once to sign in.";
}

export function diagnoseClaudeAuth() {
  const steps = [];
  const note = (step, ok, detail) => steps.push({ step, ok, detail });

  const credPath = join(defaultClaudeConfigDir(), ".credentials.json");
  note(
    "claude_code_credentials",
    existsSync(credPath),
    existsSync(credPath) ? credPath : `${credPath} not found`
  );
  const promptlyPath = claudeAuthJsonPath();
  note("promptly_auth_json", existsSync(promptlyPath), promptlyPath);
  note("claude_code_env", Boolean(readClaudeEnvToken()), "CLAUDE_CODE_OAUTH_TOKEN");

  const legacyPath = promptlyClaudeOAuthTokenPath();
  note("promptly_token_file_legacy", existsSync(legacyPath), legacyPath);

  const token = readClaudeAccessToken(defaultClaudeConfigDir());
  note(
    "resolved_token",
    Boolean(token),
    token ? "ready for Anthropic usage API (no Keychain)" : describeClaudeAuthFailure(Boolean(process.stdin.isTTY))
  );

  return {
    token_available: Boolean(token),
    failure: token ? null : describeClaudeAuthFailure(Boolean(process.stdin.isTTY)),
    steps
  };
}

function discoverClaudeProfileDirs(extraDirs = []) {
  const home = homedir();
  const found = new Set();
  const defaultDir = defaultClaudeConfigDir();
  const candidates = [
    defaultDir,
    ...extraDirs.map((d) => d.replace(/^~(?=$|[\\/])/, home)),
    join(home, ".claude-work"),
    join(home, ".claude-personal"),
    join(home, ".claude-workspace")
  ];
  try {
    for (const entry of readdirSync(home)) {
      if (entry.startsWith(".claude-") && entry !== ".claude.json") {
        candidates.push(join(home, entry));
      }
    }
  } catch {
    /* ignore */
  }
  const profilesRoot = join(home, ".claude-profiles");
  if (existsSync(profilesRoot)) {
    try {
      for (const entry of readdirSync(profilesRoot)) {
        candidates.push(join(profilesRoot, entry, "config"));
      }
    } catch {
      /* ignore */
    }
  }
  for (const dir of candidates) {
    if (!dir || found.has(dir)) continue;
    if (existsSync(join(dir, ".credentials.json")) || readClaudeAccessToken(dir)) {
      found.add(dir);
    }
  }
  if (hasClaudeUsageAuth()) {
    found.add(defaultDir);
  }
  return [...found];
}

function discoverCodexConfigDirs(extraDirs = []) {
  const home = homedir();
  const codexHome = process.env.CODEX_HOME || join(home, ".codex");
  const found = new Set([codexHome]);
  for (const dir of extraDirs) {
    found.add(dir.replace(/^~(?=$|[\\/])/, home));
  }
  return [...found].filter((dir) => existsSync(join(dir, "auth.json")));
}

function cursorGlobalStatePath() {
  const home = homedir();
  if (platform() === "darwin") {
    return join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");
  }
  if (platform() === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    return join(appData, "Cursor", "User", "globalStorage", "state.vscdb");
  }
  return join(home, ".config", "Cursor", "User", "globalStorage", "state.vscdb");
}

function readSqliteItemValue(dbPath, key) {
  if (!existsSync(dbPath)) return null;
  const safeKey = key.replace(/'/g, "''");
  try {
    const out = execSync(`sqlite3 ${JSON.stringify(dbPath)} ${JSON.stringify(`SELECT value FROM ItemTable WHERE key='${safeKey}' LIMIT 1;`)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (out) return out;
  } catch {
    /* fall through */
  }
  try {
    const script =
      "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); r=c.execute('SELECT value FROM ItemTable WHERE key=? LIMIT 1', (sys.argv[2],)).fetchone(); print(r[0] if r else '', end='')";
    const out = execSync(`python3 -c ${JSON.stringify(script)} ${JSON.stringify(dbPath)} ${JSON.stringify(key)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (out) return out;
  } catch {
    /* ignore */
  }
  return null;
}

function readCursorAuth() {
  const envToken = String(process.env.CURSOR_SESSION_TOKEN || process.env.WORKOS_CURSOR_SESSION_TOKEN || "").trim();
  if (envToken.length > 20) {
    return { accessToken: envToken, email: null, planSlug: null, configDir: cursorGlobalStatePath() };
  }
  const dbPath = cursorGlobalStatePath();
  const accessToken = readSqliteItemValue(dbPath, "cursorAuth/accessToken");
  if (!accessToken || accessToken.length < 20) return null;
  const email = readSqliteItemValue(dbPath, "cursorAuth/cachedEmail");
  const planSlug = readSqliteItemValue(dbPath, "cursorAuth/stripeMembershipType");
  return {
    accessToken,
    email: typeof email === "string" && email.includes("@") ? email : null,
    planSlug: typeof planSlug === "string" ? planSlug : null,
    configDir: dbPath
  };
}

function readCodexAuth(configDir) {
  const auth = readJson(join(configDir, "auth.json"), null);
  if (!auth || typeof auth !== "object") return null;
  const tokens = auth.tokens;
  if (!tokens || typeof tokens !== "object") return null;
  const accessToken = tokens.access_token || tokens.accessToken;
  const accountId = tokens.account_id || tokens.accountId || null;
  if (typeof accessToken !== "string" || accessToken.length < 20) return null;
  return { accessToken, accountId };
}

function formatCursorPlanDisplay(planSlug) {
  if (!planSlug) return null;
  return planSlug
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeUtilizationPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

function parseClaudePlanFromProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return { plan_slug: null, plan_display: null };
  }
  const org = profile.organization;
  const account = profile.account;
  const orgType =
    org && typeof org.organization_type === "string" ? org.organization_type.toLowerCase() : "";
  const seatTier = org && typeof org.seat_tier === "string" ? org.seat_tier.toLowerCase() : "";
  const rateTier =
    org && typeof org.rate_limit_tier === "string" ? org.rate_limit_tier.toLowerCase() : "";
  const tierBlob = `${seatTier} ${rateTier} ${orgType}`;
  const isMax = orgType === "claude_max" || account?.has_claude_max === true;
  const isPro = orgType === "claude_pro" || account?.has_claude_pro === true;

  if (isMax) {
    if (tierBlob.includes("20")) {
      return { plan_slug: "max_20x", plan_display: "Claude Max (20×)" };
    }
    if (tierBlob.includes("5")) {
      return { plan_slug: "max_5x", plan_display: "Claude Max (5×)" };
    }
    return { plan_slug: "max", plan_display: "Claude Max" };
  }
  if (isPro || orgType.includes("pro")) {
    return { plan_slug: "pro", plan_display: "Claude Pro" };
  }
  if (orgType.startsWith("claude_")) {
    const slug = orgType.replace(/^claude_/, "");
    const label = slug.replace(/_/g, " ");
    return {
      plan_slug: slug,
      plan_display: `Claude ${label.charAt(0).toUpperCase()}${label.slice(1)}`
    };
  }
  return { plan_slug: null, plan_display: null };
}

async function fetchClaudeProfileUsage(configDir) {
  const fromPromptlyAuth = isDefaultClaudeConfigDir(configDir) && readPromptlyClaudeAuth();
  const token = readClaudeAccessToken(configDir);
  const authPath = claudeAuthJsonPath();
  const profileId = hashProfileId(fromPromptlyAuth ? authPath : configDir);
  const profileLabel = fromPromptlyAuth ? "Claude subscription" : profileLabelFromDir(configDir);
  const resolvedConfigDir = fromPromptlyAuth ? authPath : configDir;
  const base = {
    provider: "claude_code",
    profile_id: profileId,
    profile_label: profileLabel,
    config_dir: resolvedConfigDir,
    synced_at_ms: Date.now()
  };
  if (!token) {
    return { ...base, sync_error: describeClaudeAuthFailure(Boolean(process.stdin.isTTY)) };
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    "anthropic-beta": CLAUDE_USAGE_BETA,
    Accept: "application/json",
    "User-Agent": "claude-cli/2.1.9 (external, cli)"
  };
  try {
    const [usageRes, profileRes] = await Promise.all([
      fetch("https://api.anthropic.com/api/oauth/usage", { headers }),
      fetch("https://api.anthropic.com/api/oauth/profile", { headers })
    ]);
    if (!usageRes.ok) {
      return { ...base, sync_error: `Claude usage API HTTP ${usageRes.status}` };
    }
    const usage = await usageRes.json();
    const profile = profileRes.ok ? await profileRes.json() : null;
    const five = usage?.five_hour || usage?.fiveHour;
    const seven = usage?.seven_day || usage?.sevenDay;
    const email =
      profile?.account?.email ||
      profile?.email ||
      profile?.email_address ||
      profile?.account?.emailAddress ||
      null;
    const { plan_slug: planSlug, plan_display: planDisplay } = parseClaudePlanFromProfile(profile);
    return {
      ...base,
      vendor_email: typeof email === "string" ? email : null,
      plan_slug: planSlug,
      plan_display: planDisplay,
      primary_window: five
        ? {
            utilization: normalizeUtilizationPercent(five.utilization ?? five.used_percent ?? 0),
            resets_at: five.resets_at || five.resetsAt || null,
            window_seconds: 5 * 3600
          }
        : null,
      secondary_window: seven
        ? {
            utilization: normalizeUtilizationPercent(seven.utilization ?? seven.used_percent ?? 0),
            resets_at: seven.resets_at || seven.resetsAt || null,
            window_seconds: 7 * 86400
          }
        : null,
      sync_error: null
    };
  } catch (err) {
    return { ...base, sync_error: String(err?.message || err) };
  }
}

async function fetchCodexProfileUsage(configDir) {
  const profileId = hashProfileId(configDir);
  const label = profileLabelFromDir(configDir);
  const profileLabel = label === ".codex" ? "Default" : label;
  const base = {
    provider: "codex",
    profile_id: profileId,
    profile_label: profileLabel,
    config_dir: configDir,
    synced_at_ms: Date.now()
  };
  const auth = readCodexAuth(configDir);
  if (!auth) {
    return { ...base, sync_error: "No Codex ChatGPT OAuth in auth.json — sign in with ChatGPT (not API key)." };
  }
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    Accept: "application/json"
  };
  if (auth.accountId) {
    headers["ChatGPT-Account-Id"] = auth.accountId;
  }
  try {
    const res = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers });
    if (!res.ok) {
      return { ...base, sync_error: `Codex usage API HTTP ${res.status}` };
    }
    const usage = await res.json();
    const primary = usage?.rate_limit?.primary_window;
    const secondary = usage?.rate_limit?.secondary_window;
    const planType = usage?.plan_type || usage?.planType || null;
    let email = null;
    try {
      const meRes = await fetch("https://chatgpt.com/backend-api/me", { headers });
      if (meRes.ok) {
        const me = await meRes.json();
        email = me?.email || me?.account?.email || null;
      }
    } catch {
      /* optional */
    }
    return {
      ...base,
      vendor_email: typeof email === "string" ? email : null,
      plan_slug: typeof planType === "string" ? planType : null,
      plan_display: typeof planType === "string" ? planType.charAt(0).toUpperCase() + planType.slice(1) : null,
      primary_window: primary
        ? {
            utilization: normalizeUtilizationPercent(primary.used_percent ?? primary.utilization ?? 0),
            resets_at: primary.reset_at ? new Date(Number(primary.reset_at) * 1000).toISOString() : null,
            window_seconds: Number(primary.limit_window_seconds ?? 5 * 3600)
          }
        : null,
      secondary_window: secondary
        ? {
            utilization: normalizeUtilizationPercent(secondary.used_percent ?? secondary.utilization ?? 0),
            resets_at: secondary.reset_at ? new Date(Number(secondary.reset_at) * 1000).toISOString() : null,
            window_seconds: Number(secondary.limit_window_seconds ?? 7 * 86400)
          }
        : null,
      sync_error: null
    };
  } catch (err) {
    return { ...base, sync_error: String(err?.message || err) };
  }
}

async function fetchCursorProfileUsage() {
  const auth = readCursorAuth();
  const profileId = auth?.configDir ? hashProfileId(auth.configDir) : "default";
  const base = {
    provider: "cursor",
    profile_id: profileId,
    profile_label: "Default",
    config_dir: auth?.configDir ?? cursorGlobalStatePath(),
    synced_at_ms: Date.now()
  };
  if (!auth?.accessToken) {
    return {
      ...base,
      sync_error: "No Cursor login found — open Cursor and sign in on this computer."
    };
  }
  try {
    const res = await fetch("https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1"
      },
      body: "{}"
    });
    if (!res.ok) {
      return { ...base, sync_error: `Cursor usage API HTTP ${res.status}` };
    }
    const usage = await res.json();
    const planUsage = usage?.planUsage || {};
    const totalPercent = Number(planUsage.totalPercentUsed ?? planUsage.apiPercentUsed ?? 0);
    const apiPercent = Number(planUsage.apiPercentUsed ?? totalPercent);
    const cycleEndMs = Number(usage?.billingCycleEnd ?? 0);
    const cycleStartMs = Number(usage?.billingCycleStart ?? 0);
    const windowSeconds =
      cycleEndMs > cycleStartMs ? Math.max(86400, Math.round((cycleEndMs - cycleStartMs) / 1000)) : 30 * 86400;
    const planDisplay = formatCursorPlanDisplay(auth.planSlug);
    return {
      ...base,
      vendor_email: auth.email,
      plan_slug: auth.planSlug,
      plan_display: planDisplay,
      primary_window: {
        utilization: normalizeUtilizationPercent(apiPercent),
        resets_at: cycleEndMs > 0 ? new Date(cycleEndMs).toISOString() : null,
        window_seconds: 5 * 3600
      },
      secondary_window: {
        utilization: normalizeUtilizationPercent(totalPercent),
        resets_at: cycleEndMs > 0 ? new Date(cycleEndMs).toISOString() : null,
        window_seconds: windowSeconds
      },
      sync_error: null
    };
  } catch (err) {
    return { ...base, sync_error: String(err?.message || err) };
  }
}

async function fetchVendorUsageSettings(apiUrl, deviceToken, clientHeader) {
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/telemetry/vendor-usage`, {
    headers: {
      Authorization: `Bearer ${deviceToken}`,
      "x-promptly-client": clientHeader
    }
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.settings || null;
}

async function uploadVendorUsageSnapshots(
  apiUrl,
  deviceToken,
  clientHeader,
  snapshots,
  clearProviders = [],
  syncDiagnostics = null
) {
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/telemetry/vendor-usage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deviceToken}`,
      "x-promptly-client": clientHeader
    },
    body: JSON.stringify({
      snapshots,
      clear_providers: clearProviders,
      sync_diagnostics: syncDiagnostics
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body.error || `HTTP ${res.status}` };
  }
  return { ok: true, written: body.written ?? snapshots.length };
}

export async function runVendorUsageSync({ creds, clientHeader, flags = {} }) {
  if (!creds?.device_token) {
    return { ok: false, error: "not_connected" };
  }
  const apiUrl = creds.api_url || process.env.PROMPTLY_API_URL || "https://promptly-labs.com";
  const settings =
    (await fetchVendorUsageSettings(apiUrl, creds.device_token, clientHeader)) || {
      claude_code: { enabled: false, extra_profile_dirs: [] },
      codex: { enabled: false, extra_profile_dirs: [] },
      cursor: { enabled: false, extra_profile_dirs: [] }
    };
  const attempted = new Set();
  const snapshots = [];

  attempted.add("claude_code");
  const interactive = Boolean(process.stdin.isTTY) && flags.no_login !== true && flags.no_login !== "true";
  if (!readClaudeAccessToken(defaultClaudeConfigDir()) && interactive && !flags.debug) {
    try {
      await ensureClaudeOAuthLogin({ interactive: true });
    } catch {
      /* diagnose below will explain */
    }
  }
  const claudeAuth = diagnoseClaudeAuth();
  const claudeDirs = discoverClaudeProfileDirs(settings.claude_code?.extra_profile_dirs || []);
  let claudeAttempted = false;
  for (const dir of claudeDirs) {
    claudeAttempted = true;
    const row = await fetchClaudeProfileUsage(dir);
    if (row) snapshots.push(row);
  }
  if (!claudeAttempted || !snapshots.some((row) => row.provider === "claude_code")) {
    snapshots.push(await fetchClaudeProfileUsage(defaultClaudeConfigDir()));
  }

  attempted.add("codex");
  const codexDirs = discoverCodexConfigDirs(settings.codex?.extra_profile_dirs || []);
  for (const dir of codexDirs) {
    snapshots.push(await fetchCodexProfileUsage(dir));
  }

  attempted.add("cursor");
  snapshots.push(await fetchCursorProfileUsage());

  const successful = snapshots.filter((row) => row && !row.sync_error);
  const succeededProviders = new Set(successful.map((row) => row.provider));
  const clearProviders = [...attempted].filter((provider) => !succeededProviders.has(provider));
  const skipDetails = Object.fromEntries(
    clearProviders.map((provider) => [
      provider,
      provider === "claude_code" ? claudeAuth.failure || "Not signed in on this Mac." : "Not signed in on this Mac."
    ])
  );
  const syncDiagnostics = {
    at_ms: Date.now(),
    skipped: clearProviders,
    skip_details: skipDetails,
    claude_auth: claudeAuth
  };

  if (flags.debug) {
    return {
      ok: true,
      debug: true,
      claude_auth: claudeAuth,
      skip_details: skipDetails,
      snapshots
    };
  }

  if (!successful.length && !clearProviders.length) {
    return { ok: true, written: 0, message: "No subscription data found on this computer.", sync_diagnostics: syncDiagnostics };
  }

  const result = await uploadVendorUsageSnapshots(
    apiUrl,
    creds.device_token,
    clientHeader,
    successful,
    clearProviders,
    syncDiagnostics
  );
  return {
    ...result,
    snapshots: successful,
    skipped: clearProviders,
    skip_details: skipDetails,
    sync_diagnostics: syncDiagnostics,
    message:
      clearProviders.length && successful.length
        ? `Synced ${successful.length} subscription(s). Skipped: ${clearProviders.map((p) => `${p} (${skipDetails[p]})`).join("; ")}`
        : clearProviders.length
          ? `No subscription logins found. ${clearProviders.map((p) => `${p}: ${skipDetails[p]}`).join(" ")}`
          : undefined
  };
}
