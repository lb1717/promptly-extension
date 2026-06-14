/**
 * Vendor subscription usage sync (Claude Code, Codex, Cursor) — local OAuth only.
 */
import { createHash, createDecipheriv, pbkdf2Sync } from "crypto";
import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { homedir, platform } from "os";
import { basename, join } from "path";

const CLAUDE_USAGE_BETA = "oauth-2025-04-20";
const KEYCHAIN_TIMEOUT_MS = 8000;

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
  const oauth = raw.claudeAiOauth || raw.oauth || raw;
  const direct = oauth?.accessToken || oauth?.access_token;
  if (typeof direct === "string" && direct.length > 20) return direct;
  for (const value of Object.values(raw)) {
    const nested = parseClaudeOAuthToken(value, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function readClaudeKeychainToken() {
  if (platform() !== "darwin") return null;
  const account = String(process.env.USER || process.env.LOGNAME || "").trim();
  const services = ["Claude Code-credentials", "Claude Code", "claude-code", "anthropic-claude"];
  for (const service of services) {
    for (const withAccount of account ? [true, false] : [false]) {
      try {
        const cmd = withAccount
          ? `security find-generic-password -a ${JSON.stringify(account)} -s ${JSON.stringify(service)} -w`
          : `security find-generic-password -s ${JSON.stringify(service)} -w`;
        const raw = execSync(cmd, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: KEYCHAIN_TIMEOUT_MS
        }).trim();
        const token = parseClaudeOAuthToken(raw);
        if (token) return token;
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

function readClaudeEnvToken() {
  return parseClaudeOAuthToken(process.env.CLAUDE_CODE_OAUTH_TOKEN);
}

function claudeDesktopConfigPath() {
  const home = homedir();
  if (platform() === "darwin") {
    return join(home, "Library", "Application Support", "Claude", "config.json");
  }
  if (platform() === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    return join(appData, "Claude", "config.json");
  }
  return join(home, ".config", "Claude", "config.json");
}

function readClaudeDesktopSafeStoragePassword() {
  if (platform() !== "darwin") return null;
  const attempts = [
    ["find-generic-password", "-s", "Claude Safe Storage", "-a", "Claude Key", "-w"],
    ["find-generic-password", "-s", "Claude Safe Storage", "-w"]
  ];
  for (const args of attempts) {
    try {
      const raw = execSync(`security ${args.map((part) => JSON.stringify(part)).join(" ")}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: KEYCHAIN_TIMEOUT_MS
      }).trim();
      if (raw) return raw;
    } catch {
      /* try next */
    }
  }
  return null;
}

function decryptClaudeDesktopTokenCache(encryptedBase64, keychainPassword) {
  const key = pbkdf2Sync(keychainPassword, "saltysalt", 1003, 16, "sha1");
  const encrypted = Buffer.from(encryptedBase64, "base64");
  if (encrypted.length < 4 || encrypted.subarray(0, 3).toString("utf8") !== "v10") return null;
  const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  const decrypted = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
  const padLen = decrypted[decrypted.length - 1];
  if (!padLen || padLen > 16) return null;
  const jsonText = decrypted.subarray(0, decrypted.length - padLen).toString("utf8");
  return parseClaudeOAuthToken(JSON.parse(jsonText));
}

function readClaudeDesktopOAuthToken() {
  const config = readJson(claudeDesktopConfigPath(), null);
  const cache = config?.["oauth:tokenCache"];
  if (typeof cache !== "string" || !cache.trim()) return null;
  const password = readClaudeDesktopSafeStoragePassword();
  if (!password) return null;
  try {
    return decryptClaudeDesktopTokenCache(cache, password);
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
  const credPath = join(configDir, ".credentials.json");
  const fromFile = parseClaudeOAuthToken(readJson(credPath, null));
  if (fromFile) return fromFile;

  if (isDefaultClaudeConfigDir(configDir)) {
    const fromState = parseClaudeOAuthToken(readJson(join(homedir(), ".claude.json"), null));
    if (fromState) return fromState;
    const fromEnv = readClaudeEnvToken();
    if (fromEnv) return fromEnv;
    const fromKeychain = readClaudeKeychainToken();
    if (fromKeychain) return fromKeychain;
  }
  return null;
}

function hasClaudeUsageAuth() {
  return Boolean(readClaudeAccessToken(defaultClaudeConfigDir()) || readClaudeDesktopOAuthToken());
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

async function fetchClaudeProfileUsage(configDir) {
  const desktopPath = claudeDesktopConfigPath();
  const fromCli = readClaudeAccessToken(configDir);
  const fromDesktop = isDefaultClaudeConfigDir(configDir) ? readClaudeDesktopOAuthToken() : null;
  const token = fromCli || fromDesktop;
  if (!token) return null;
  const useDesktop = !fromCli && Boolean(fromDesktop);
  const profileId = hashProfileId(useDesktop ? desktopPath : configDir);
  const profileLabel = useDesktop ? "Claude desktop app" : profileLabelFromDir(configDir);
  const resolvedConfigDir = useDesktop ? desktopPath : configDir;
  const base = {
    provider: "claude_code",
    profile_id: profileId,
    profile_label: profileLabel,
    config_dir: resolvedConfigDir,
    synced_at_ms: Date.now()
  };
  const headers = {
    Authorization: `Bearer ${token}`,
    "anthropic-beta": CLAUDE_USAGE_BETA,
    Accept: "application/json"
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
      profile?.email ||
      profile?.email_address ||
      profile?.account?.email ||
      profile?.account?.emailAddress ||
      null;
    const planDisplay =
      profile?.plan?.name ||
      profile?.plan_type ||
      profile?.subscription?.plan ||
      profile?.account?.plan ||
      null;
    return {
      ...base,
      vendor_email: typeof email === "string" ? email : null,
      plan_slug: typeof planDisplay === "string" ? planDisplay.toLowerCase().replace(/\s+/g, "_") : null,
      plan_display: typeof planDisplay === "string" ? planDisplay : null,
      primary_window: five
        ? {
            utilization: Number(five.utilization ?? five.used_percent ?? 0),
            resets_at: five.resets_at || five.resetsAt || null,
            window_seconds: 5 * 3600
          }
        : null,
      secondary_window: seven
        ? {
            utilization: Number(seven.utilization ?? seven.used_percent ?? 0),
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
            utilization: Number(primary.used_percent ?? primary.utilization ?? 0),
            resets_at: primary.reset_at ? new Date(Number(primary.reset_at) * 1000).toISOString() : null,
            window_seconds: Number(primary.limit_window_seconds ?? 5 * 3600)
          }
        : null,
      secondary_window: secondary
        ? {
            utilization: Number(secondary.used_percent ?? secondary.utilization ?? 0),
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
        utilization: Math.max(0, Math.min(100, apiPercent)),
        resets_at: cycleEndMs > 0 ? new Date(cycleEndMs).toISOString() : null,
        window_seconds: 5 * 3600
      },
      secondary_window: {
        utilization: Math.max(0, Math.min(100, totalPercent)),
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

async function uploadVendorUsageSnapshots(apiUrl, deviceToken, clientHeader, snapshots, clearProviders = []) {
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/telemetry/vendor-usage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deviceToken}`,
      "x-promptly-client": clientHeader
    },
    body: JSON.stringify({ snapshots, clear_providers: clearProviders })
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
  const claudeDirs = discoverClaudeProfileDirs(settings.claude_code?.extra_profile_dirs || []);
  for (const dir of claudeDirs) {
    const row = await fetchClaudeProfileUsage(dir);
    if (row) snapshots.push(row);
  }
  if (!claudeDirs.length || !snapshots.some((row) => row.provider === "claude_code")) {
    const row = await fetchClaudeProfileUsage(defaultClaudeConfigDir());
    if (row) snapshots.push(row);
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

  if (!successful.length && !clearProviders.length) {
    return { ok: true, written: 0, message: "No subscription data found on this computer." };
  }

  const result = await uploadVendorUsageSnapshots(
    apiUrl,
    creds.device_token,
    clientHeader,
    successful,
    clearProviders
  );
  return {
    ...result,
    snapshots: successful,
    skipped: clearProviders,
    message:
      clearProviders.length && successful.length
        ? `Synced ${successful.length} subscription(s). Skipped: ${clearProviders.join(", ")} (not signed in on this Mac).`
        : clearProviders.length
          ? "No subscription logins found on this computer for Codex, Cursor, or Claude Code."
          : undefined
  };
}
