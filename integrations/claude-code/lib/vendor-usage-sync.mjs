/**
 * Vendor subscription usage sync (Claude Code + Codex) — local OAuth only.
 */
import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";

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

function discoverClaudeProfileDirs(extraDirs = []) {
  const found = new Set();
  const home = homedir();
  const candidates = [
    join(home, ".claude"),
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
    const credPath = join(dir, ".credentials.json");
    if (existsSync(credPath) || (dir.endsWith(".claude") && existsSync(join(home, ".claude.json")))) {
      found.add(dir);
    }
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

function readClaudeAccessToken(configDir) {
  const home = homedir();
  const credPath = join(configDir, ".credentials.json");
  const creds = readJson(credPath, null);
  if (creds && typeof creds === "object") {
    const oauth = creds.claudeAiOauth || creds.oauth || creds;
    const token = oauth?.accessToken || oauth?.access_token;
    if (typeof token === "string" && token.length > 20) return token;
    for (const value of Object.values(creds)) {
      if (value && typeof value === "object") {
        const nested = value.accessToken || value.access_token;
        if (typeof nested === "string" && nested.length > 20) return nested;
      }
    }
  }
  if (configDir === join(home, ".claude") || configDir.endsWith("/.claude")) {
    const state = readJson(join(home, ".claude.json"), null);
    const token = state?.claudeAiOauth?.accessToken || state?.oauthAccount?.accessToken;
    if (typeof token === "string" && token.length > 20) return token;
  }
  return null;
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

async function fetchClaudeProfileUsage(configDir) {
  const profileId = hashProfileId(configDir);
  const profileLabel = profileLabelFromDir(configDir);
  const base = {
    provider: "claude_code",
    profile_id: profileId,
    profile_label: profileLabel,
    config_dir: configDir,
    synced_at_ms: Date.now()
  };
  const token = readClaudeAccessToken(configDir);
  if (!token) {
    return { ...base, sync_error: "No Claude OAuth token in this profile — run claude login in this profile." };
  }
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

async function uploadVendorUsageSnapshots(apiUrl, deviceToken, clientHeader, snapshots) {
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/telemetry/vendor-usage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deviceToken}`,
      "x-promptly-client": clientHeader
    },
    body: JSON.stringify({ snapshots })
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
      codex: { enabled: false, extra_profile_dirs: [] }
    };
  const force = flags.force === true || flags.force === "true";
  const snapshots = [];
  if (settings.claude_code?.enabled || force) {
    const dirs = discoverClaudeProfileDirs(settings.claude_code?.extra_profile_dirs || []);
    for (const dir of dirs) {
      snapshots.push(await fetchClaudeProfileUsage(dir));
    }
  }
  if (settings.codex?.enabled || force) {
    const dirs = discoverCodexConfigDirs(settings.codex?.extra_profile_dirs || []);
    for (const dir of dirs) {
      snapshots.push(await fetchCodexProfileUsage(dir));
    }
  }
  if (!snapshots.length) {
    return { ok: true, written: 0, message: "No providers enabled. Turn on sync on the statistics page first." };
  }
  const result = await uploadVendorUsageSnapshots(apiUrl, creds.device_token, clientHeader, snapshots);
  return { ...result, snapshots };
}
