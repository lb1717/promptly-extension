#!/usr/bin/env node
/**
 * Promptly IDE telemetry CLI — self-contained (bundled into each agent plugin).
 * Never uploads raw prompt text; metadata only.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_API_URL = process.env.PROMPTLY_API_URL || "https://promptly-labs.com";
const CREDENTIALS_PATH =
  process.env.PROMPTLY_CREDENTIALS_PATH || join(homedir(), ".promptly", "credentials.json");
const QUEUE_PATH = process.env.PROMPTLY_QUEUE_PATH || join(homedir(), ".promptly", "event-queue.json");
const MAX_BATCH = 25;

const TOOL_CLIENT = {
  claude_code: "promptly-claude-code",
  cursor: "promptly-cursor",
  codex: "promptly-codex"
};

function readJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

function getCredentials() {
  return readJson(CREDENTIALS_PATH, null);
}

function saveCredentials(creds) {
  writeJson(CREDENTIALS_PATH, creds);
}

function countWords(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function normalizeTool(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (v === "claude_code" || v === "cursor" || v === "codex") return v;
  return null;
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || "help";
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else {
      rest.push(arg);
    }
  }
  flags._rest = rest;
  return { command, flags };
}

async function readStdinJson() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      if (!data.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
    if (process.stdin.isTTY) {
      resolve(null);
    }
  });
}

function loadQueue() {
  const q = readJson(QUEUE_PATH, { events: [] });
  return Array.isArray(q.events) ? q.events : [];
}

function saveQueue(events) {
  writeJson(QUEUE_PATH, { events: events.slice(-500) });
}

function enqueueEvent(event) {
  const events = loadQueue();
  events.push(event);
  saveQueue(events);
  return events.length;
}

async function flushQueue(tool, clientHeader) {
  const creds = getCredentials();
  if (!creds?.device_token) {
    return { ok: false, error: "not_connected" };
  }
  const events = loadQueue();
  if (!events.length) {
    return { ok: true, written: 0 };
  }
  const batch = events.slice(0, MAX_BATCH);
  const apiUrl = creds.api_url || DEFAULT_API_URL;
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/telemetry/ide-activity`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.device_token}`,
      "x-promptly-client": clientHeader || TOOL_CLIENT[tool] || "promptly-claude-code"
    },
    body: JSON.stringify({ events: batch })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body.error || `HTTP ${res.status}` };
  }
  saveQueue(events.slice(batch.length));
  if (events.length > batch.length) {
    await flushQueue(tool, clientHeader);
  }
  return { ok: true, written: body.written ?? batch.length };
}

function hookEventToTelemetry(input, tool) {
  if (!input || typeof input !== "object") return null;
  const now = Date.now();
  const eventName = String(
    input.hook_event_name || input.hookEventName || input.event || input.hook || ""
  ).toLowerCase();

  const hasPrompt = typeof input.prompt === "string" && input.prompt.length > 0;
  const hasSessionEnd =
    typeof input.duration_ms === "number" ||
    typeof input.durationMs === "number" ||
    (typeof input.reason === "string" && typeof input.session_id === "string");
  const hasStopStatus = typeof input.status === "string" && typeof input.loop_count === "number";

  if (
    eventName.includes("userpromptsubmit") ||
    eventName.includes("beforesubmitprompt") ||
    (hasPrompt && !hasSessionEnd && !hasStopStatus)
  ) {
    const prompt = String(input.prompt || input.user_prompt || "");
    const words = countWords(prompt);
    const chars = Math.min(12000, prompt.length);
    return {
      tool,
      interaction_kind: "send",
      composer_word_estimate: words || 1,
      composer_char_estimate: chars || 1,
      client_occurred_ms: now
    };
  }

  if (eventName.includes("sessionend") || (hasSessionEnd && !hasPrompt)) {
    const dur = Number(input.duration_ms ?? input.durationMs ?? 0);
    if (Number.isFinite(dur) && dur >= 2000) {
      return {
        tool,
        interaction_kind: "engagement_segment",
        engagement_category: "reading_idle",
        duration_ms: Math.min(1_800_000, Math.floor(dur)),
        client_occurred_ms: now
      };
    }
    return null;
  }

  if ((eventName.includes("stop") && !eventName.includes("subagent")) || hasStopStatus) {
    const status = String(input.status || "").toLowerCase();
    if (status === "completed" || status === "aborted" || status === "error" || !status) {
      return {
        tool,
        interaction_kind: "engagement_segment",
        engagement_category: "waiting",
        duration_ms: 5000,
        client_occurred_ms: now
      };
    }
    return null;
  }

  if (eventName.includes("sessionstart")) {
    return {
      tool,
      interaction_kind: "engagement_segment",
      engagement_category: "reading_idle",
      duration_ms: 2000,
      client_occurred_ms: now
    };
  }

  return null;
}

async function cmdHook(flags) {
  const tool = normalizeTool(flags.tool);
  if (!tool) {
    console.error("Missing --tool claude_code|cursor|codex");
    process.exit(1);
  }
  const input = await readStdinJson();
  const event = hookEventToTelemetry(input, tool);
  if (event) {
    enqueueEvent(event);
  }
  const clientHeader = flags.client || TOOL_CLIENT[tool];
  try {
    await flushQueue(tool, clientHeader);
  } catch (err) {
    // Hooks must not fail the host agent
    console.error("[promptly]", String(err?.message || err));
  }
  process.exit(0);
}

async function cmdLogin(flags) {
  const code = String(flags._rest[0] || flags.code || "").trim();
  const tool = normalizeTool(flags.tool);
  if (!code) {
    console.error("Usage: promptly-telemetry login --tool claude_code|cursor|codex <CODE>");
    process.exit(1);
  }
  if (!tool) {
    console.error("Missing --tool. Usage: promptly-telemetry login --tool codex <CODE>");
    process.exit(1);
  }
  const apiUrl = (flags["api-url"] || DEFAULT_API_URL).replace(/\/$/, "");
  const res = await fetch(`${apiUrl}/api/integrations/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: code.toUpperCase(),
      tool,
      device_label: flags.label || `${tool}-${process.platform}`
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(body.error || `Exchange failed (${res.status})`);
    process.exit(1);
  }
  saveCredentials({
    device_token: body.device_token,
    uid: body.uid,
    email: body.email,
    tool: body.tool,
    api_url: apiUrl,
    connected_at: new Date().toISOString()
  });
  console.log(`Connected to Promptly as ${body.email || body.uid} (${body.tool})`);
}

function cmdStatus() {
  const creds = getCredentials();
  if (!creds?.device_token) {
    console.log("Not connected. Open https://promptly-labs.com/auth/integrations to get a pairing code.");
    process.exit(1);
  }
  console.log(JSON.stringify({ connected: true, email: creds.email, tool: creds.tool, uid: creds.uid }, null, 2));
}

function cmdOpenLogin(flags) {
  const tool = normalizeTool(flags.tool) || "claude_code";
  const base = (flags["api-url"] || DEFAULT_API_URL).replace(/\/$/, "");
  console.log(`${base}/auth/integrations?tool=${tool}`);
}

async function cmdTestSend(flags) {
  const tool = normalizeTool(flags.tool);
  if (!tool) {
    console.error("Usage: promptly-telemetry test-send --tool claude_code|cursor|codex");
    process.exit(1);
  }
  const creds = getCredentials();
  if (!creds?.device_token) {
    console.error("Not connected. Run login first.");
    process.exit(1);
  }
  enqueueEvent({
    tool,
    interaction_kind: "send",
    composer_word_estimate: 1,
    composer_char_estimate: 4,
    client_occurred_ms: Date.now()
  });
  const clientHeader = flags.client || TOOL_CLIENT[tool];
  const result = await flushQueue(tool, clientHeader);
  if (!result.ok) {
    console.error(result.error || "Upload failed");
    process.exit(1);
  }
  console.log(`Test prompt uploaded for ${tool}. Check Statistics → Coding agents on promptly-labs.com.`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "hook":
      await cmdHook(flags);
      break;
    case "login":
      await cmdLogin(flags);
      break;
    case "status":
      cmdStatus();
      break;
    case "test-send":
      await cmdTestSend(flags);
      break;
    case "open-login":
      cmdOpenLogin(flags);
      break;
    case "flush":
      await flushQueue(normalizeTool(flags.tool) || "claude_code", flags.client);
      break;
    default:
      console.log(`Promptly telemetry CLI

Commands:
  hook --tool <tool>          Process hook stdin and upload events
  login --tool <tool> <CODE>  Exchange pairing code for device token
  test-send --tool <tool>     Upload one test prompt (verify stats pipeline)
  status                      Show connection status
  open-login --tool <tool>    Print sign-in URL
  flush --tool <tool>         Flush queued events`);
  }
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
