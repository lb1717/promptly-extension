#!/usr/bin/env node
/**
 * Promptly IDE telemetry CLI — self-contained (bundled into each agent plugin).
 * Never uploads raw prompt text; metadata only.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync
} from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_API_URL = process.env.PROMPTLY_API_URL || "https://promptly-labs.com";
const DEFAULT_PROMPTLY_DIR = join(homedir(), ".promptly");

function promptlyStorageDir() {
  return process.env.PROMPTLY_DIR || DEFAULT_PROMPTLY_DIR;
}

function legacyCredentialsPath() {
  return join(promptlyStorageDir(), "credentials.json");
}

function legacyQueuePath() {
  return join(promptlyStorageDir(), "event-queue.json");
}

function sessionModelPath() {
  return process.env.PROMPTLY_SESSION_MODEL_PATH || join(promptlyStorageDir(), "claude-session-models.json");
}
const MAX_BATCH = 25;
const MAX_SESSION_MODELS = 200;
const SESSION_MODEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TRANSCRIPT_TAIL_BYTES = 128 * 1024;
const SEND_DEDUPE_MS = 4000;
const RECENT_SENDS_MAX = 50;
const ALL_TOOLS = ["claude_code", "cursor", "codex"];

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

function credentialsPathForTool(tool) {
  return join(promptlyStorageDir(), `credentials-${tool}.json`);
}

function queuePathForTool(tool) {
  return join(promptlyStorageDir(), `event-queue-${tool}.json`);
}

function recentSendsPath(tool) {
  return join(promptlyStorageDir(), `recent-sends-${tool}.json`);
}

function pendingSubmitsPath(tool) {
  return join(promptlyStorageDir(), `pending-submits-${tool}.json`);
}

function agentSessionMetaPath(tool) {
  return join(promptlyStorageDir(), `agent-session-meta-${tool}.json`);
}

let codexConfigCache = null;

function decodeJwtEmail(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    for (const key of ["email", "user_email", "preferred_username"]) {
      const value = payload?.[key];
      if (typeof value === "string" && value.includes("@")) {
        return value.trim().toLowerCase();
      }
    }
  } catch {
    /* ignore malformed token */
  }
  return null;
}

function normalizeAgentEmail(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value.slice(0, 120);
}

function normalizeEffortToken(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (value === "minimal" || value === "none") return "low";
  if (value === "xhigh") return "max";
  if (["low", "medium", "high", "max"].includes(value)) return value;
  return null;
}

function readCodexConfig() {
  try {
    const path = join(homedir(), ".codex", "config.toml");
    if (!existsSync(path)) return codexConfigCache || {};
    const stat = statSync(path);
    if (codexConfigCache && codexConfigCache._mtime === stat.mtimeMs) {
      return codexConfigCache;
    }
    const text = readFileSync(path, "utf8");
    const readField = (name) => {
      const match = text.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\\n]+)`, "m"));
      return match ? String(match[1]).trim().replace(/^["']|["']$/g, "") : null;
    };
    codexConfigCache = {
      _mtime: stat.mtimeMs,
      model: readField("model"),
      model_reasoning_effort: readField("model_reasoning_effort")
    };
    return codexConfigCache;
  } catch {
    return codexConfigCache || {};
  }
}

function readCodexAgentEmail() {
  try {
    const auth = readJson(join(homedir(), ".codex", "auth.json"), null);
    const tokens = auth?.tokens;
    if (tokens && typeof tokens === "object") {
      for (const value of Object.values(tokens)) {
        if (typeof value === "string" && value.includes(".")) {
          const email = decodeJwtEmail(value);
          if (email) return email;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function loadAgentSessionMeta(tool) {
  const data = readJson(agentSessionMetaPath(tool), { sessions: {} });
  return data && typeof data.sessions === "object" ? data.sessions : {};
}

function cacheAgentSessionMeta(tool, sessionId, patch) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  const sessions = loadAgentSessionMeta(tool);
  const prev = sessions[sid] && typeof sessions[sid] === "object" ? sessions[sid] : {};
  sessions[sid] = { ...prev, ...patch, updated_at: Date.now() };
  const pruned = Object.fromEntries(
    Object.entries(sessions)
      .sort((a, b) => (b[1]?.updated_at || 0) - (a[1]?.updated_at || 0))
      .slice(0, MAX_SESSION_MODELS)
  );
  writeJson(agentSessionMetaPath(tool), { sessions: pruned });
}

function agentSessionMeta(tool, sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const entry = loadAgentSessionMeta(tool)[sid];
  if (!entry) return null;
  if (Date.now() - (entry.updated_at || 0) > SESSION_MODEL_TTL_MS) return null;
  return entry;
}

function extractAgentAccountEmail(input, tool) {
  const candidates = [
    input?.user_email,
    input?.userEmail,
    input?.account_email,
    input?.accountEmail,
    input?.login_email,
    input?.loginEmail,
    input?.anthropic_email,
    input?.anthropicEmail
  ];
  for (const candidate of candidates) {
    const email = normalizeAgentEmail(candidate);
    if (email) return email;
  }

  const sessionId = input?.session_id ?? input?.conversation_id ?? input?.sessionId;
  const cached = agentSessionMeta(tool, sessionId);
  if (cached?.agent_account_email) return cached.agent_account_email;

  if (tool === "codex") {
    return readCodexAgentEmail();
  }
  return null;
}

function resolveAgentAccountEmail(input, tool) {
  const email = extractAgentAccountEmail(input, tool);
  const sessionId = input?.session_id ?? input?.conversation_id ?? input?.sessionId;
  if (email && sessionId) {
    cacheAgentSessionMeta(tool, sessionId, { agent_account_email: email });
  }
  return email;
}

function resolveModelVariant(input, tool) {
  if (tool === "codex") {
    const cfg = readCodexConfig();
    return (
      normalizeEffortToken(
        input?.model_reasoning_effort ??
          input?.reasoning_effort ??
          input?.reasoningEffort ??
          cfg.model_reasoning_effort
      ) || null
    );
  }
  if (tool === "claude_code") {
    const fromPayload =
      input?.effort && typeof input.effort === "object"
        ? input.effort.level
        : typeof input?.effort === "string"
          ? input.effort
          : null;
    return (
      normalizeEffortToken(fromPayload ?? process.env.CLAUDE_EFFORT ?? process.env.CLAUDE_CODE_EFFORT_LEVEL) ||
      null
    );
  }
  return null;
}

function appendModelVariant(base, variant) {
  if (!variant) return base;
  const label = base.model_label ? `${base.model_label} · ${variant}` : `Unknown · ${variant}`;
  const bucket = slugToModelBucket(`${base.model_bucket}-${variant}`);
  return { model_label: label.slice(0, 120), model_bucket: bucket };
}

function recordPendingSubmit(tool, sessionId, meta) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  const data = readJson(pendingSubmitsPath(tool), { pending: {} });
  const pending = data.pending && typeof data.pending === "object" ? data.pending : {};
  pending[sid] = { at: Date.now(), ...meta };
  writeJson(pendingSubmitsPath(tool), { pending });
}

function consumePendingSubmit(tool, sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const data = readJson(pendingSubmitsPath(tool), { pending: {} });
  const pending = data.pending && typeof data.pending === "object" ? data.pending : {};
  const entry = pending[sid] || null;
  if (entry) {
    delete pending[sid];
    writeJson(pendingSubmitsPath(tool), { pending });
  }
  return entry;
}

function patchQueuedSendLatency(tool, sessionId, latencyMs) {
  const sid = String(sessionId || "").trim();
  if (!sid || !latencyMs) return false;
  const events = loadQueue(tool);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.interaction_kind === "send" && event._session_id === sid) {
      event.host_response_latency_ms = latencyMs;
      delete event._session_id;
      saveQueue(tool, events);
      return true;
    }
  }
  return false;
}

function migrateLegacyCredentials(tool) {
  const legacy = readJson(legacyCredentialsPath(), null);
  if (!legacy?.device_token) return null;
  const legacyTool = normalizeTool(legacy.tool);
  if (legacyTool !== tool) return null;
  writeJson(credentialsPathForTool(tool), legacy);
  return legacy;
}

function getCredentials(tool) {
  const creds = readJson(credentialsPathForTool(tool), null);
  if (creds?.device_token) return creds;
  return migrateLegacyCredentials(tool);
}

function saveCredentials(tool, creds) {
  writeJson(credentialsPathForTool(tool), creds);
}

function migrateLegacyQueue(tool) {
  const legacy = readJson(legacyQueuePath(), { events: [] });
  const events = Array.isArray(legacy.events) ? legacy.events : [];
  if (!events.length) return;
  const matching = events.filter((event) => event?.tool === tool);
  const remaining = events.filter((event) => event?.tool !== tool);
  if (matching.length) {
    const current = loadQueue(tool);
    saveQueue(tool, [...current, ...matching]);
  }
  if (remaining.length !== events.length) {
    writeJson(legacyQueuePath(), { events: remaining });
  }
}

function loadQueue(tool) {
  migrateLegacyQueue(tool);
  const q = readJson(queuePathForTool(tool), { events: [] });
  return Array.isArray(q.events) ? q.events : [];
}

function saveQueue(tool, events) {
  writeJson(queuePathForTool(tool), { events: events.slice(-500) });
}

function enqueueEvent(tool, event) {
  const events = loadQueue(tool);
  events.push(event);
  saveQueue(tool, events);
  return events.length;
}

function isDuplicateSend(tool, input, event) {
  const sid = String(input?.session_id || input?.conversation_id || input?.sessionId || "").trim() || "_";
  const key = `${sid}:${event.composer_word_estimate}:${event.composer_char_estimate}`;
  const now = Date.now();
  const data = readJson(recentSendsPath(tool), { entries: [] });
  const entries = (Array.isArray(data.entries) ? data.entries : []).filter((entry) => now - entry.at < SEND_DEDUPE_MS);
  if (entries.some((entry) => entry.key === key)) return true;
  entries.push({ key, at: now });
  writeJson(recentSendsPath(tool), { entries: entries.slice(-RECENT_SENDS_MAX) });
  return false;
}

function countWords(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function slugToModelBucket(label) {
  return (
    String(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "unknown"
  );
}

/** Reads active model slug/name from hook stdin (Codex `model`, etc.). Never uploads prompt text. */
function extractModelMeta(input) {
  const raw =
    input.model ??
    input.model_slug ??
    input.modelSlug ??
    input.active_model ??
    input.activeModel ??
    input.model_name ??
    input.modelName ??
    input.modelLabel ??
    input.model_label ??
    input.composer_model ??
    input.composerModel;
  if (typeof raw !== "string" || !raw.trim()) {
    return { model_label: null, model_bucket: "unknown" };
  }
  const label = String(raw).replace(/\s+/g, " ").trim().slice(0, 120);
  if (!label || /https?:\/\//i.test(label)) {
    return { model_label: null, model_bucket: "unknown" };
  }
  return { model_label: label, model_bucket: slugToModelBucket(label) };
}

function buildModelMeta(input, tool) {
  let base = resolveModelMeta(input, tool);
  if (tool === "codex") {
    const cfg = readCodexConfig();
    if (base.model_bucket === "unknown" && cfg.model) {
      base = { model_label: cfg.model, model_bucket: slugToModelBucket(cfg.model) };
    }
  }
  const sessionId = input?.session_id ?? input?.conversation_id ?? input?.sessionId;
  let variant = resolveModelVariant(input, tool);
  if (!variant && sessionId) {
    variant = agentSessionMeta(tool, sessionId)?.model_variant || null;
  }
  if (variant && sessionId) {
    cacheAgentSessionMeta(tool, sessionId, { model_variant: variant });
  }
  return appendModelVariant(base, variant);
}

function expandHomePath(path) {
  const p = String(path || "").trim();
  if (!p) return "";
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

function humanizeClaudeModelId(id) {
  const slug = String(id || "").trim();
  if (!slug) return null;
  const versioned = slug.match(/^claude-([a-z]+)-(\d+)-(\d+)$/i);
  if (versioned) {
    const family = versioned[1].charAt(0).toUpperCase() + versioned[1].slice(1);
    return `Claude ${family} ${versioned[2]}.${versioned[3]}`;
  }
  return slug;
}

function modelMetaFromId(id) {
  const raw = String(id || "").trim();
  if (!raw) return { model_label: null, model_bucket: "unknown" };
  const label = humanizeClaudeModelId(raw) || raw;
  return { model_label: label.slice(0, 120), model_bucket: slugToModelBucket(label) };
}

function loadSessionModels() {
  const data = readJson(sessionModelPath(), { sessions: {} });
  return data && typeof data.sessions === "object" ? data.sessions : {};
}

function cacheClaudeSessionModel(sessionId, modelId) {
  const sid = String(sessionId || "").trim();
  const mid = String(modelId || "").trim();
  if (!sid || !mid) return;
  const sessions = loadSessionModels();
  sessions[sid] = { model: mid, updated_at: Date.now() };
  const pruned = Object.fromEntries(
    Object.entries(sessions)
      .sort((a, b) => (b[1]?.updated_at || 0) - (a[1]?.updated_at || 0))
      .slice(0, MAX_SESSION_MODELS)
  );
  writeJson(sessionModelPath(), { sessions: pruned });
}

function modelFromSessionCache(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const entry = loadSessionModels()[sid];
  if (!entry?.model) return null;
  if (Date.now() - (entry.updated_at || 0) > SESSION_MODEL_TTL_MS) return null;
  return modelMetaFromId(entry.model);
}

function readTranscriptTailModelId(transcriptPath) {
  try {
    const path = expandHomePath(transcriptPath);
    if (!path || !existsSync(path)) return null;
    const size = statSync(path).size;
    if (!size) return null;
    const readSize = Math.min(size, TRANSCRIPT_TAIL_BYTES);
    const fd = openSync(path, "r");
    const buf = Buffer.alloc(readSize);
    readSync(fd, buf, 0, readSize, size - readSize);
    closeSync(fd);
    const lines = buf.toString("utf8").split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const row = JSON.parse(lines[i]);
        if (row?.type === "assistant") {
          const model = row?.message?.model;
          if (typeof model === "string" && model.trim()) return model.trim();
        }
        if (typeof row?.model === "string" && row.model.trim()) return row.model.trim();
      } catch {
        /* skip malformed tail line */
      }
    }
  } catch {
    /* ignore transcript read errors */
  }
  return null;
}

/** Claude Code only sends `model` on SessionStart — resolve from cache or transcript for prompt events. */
function resolveModelMeta(input, tool) {
  const direct = extractModelMeta(input);
  if (direct.model_bucket !== "unknown" || tool !== "claude_code") return direct;

  const cached = modelFromSessionCache(input.session_id);
  if (cached) return cached;

  const modelId = readTranscriptTailModelId(input.transcript_path);
  if (modelId) {
    if (input.session_id) cacheClaudeSessionModel(input.session_id, modelId);
    return modelMetaFromId(modelId);
  }

  return direct;
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

async function flushQueue(tool, clientHeader) {
  const creds = getCredentials(tool);
  if (!creds?.device_token) {
    return { ok: false, error: "not_connected" };
  }
  if (normalizeTool(creds.tool) && normalizeTool(creds.tool) !== tool) {
    return { ok: false, error: `credentials_mismatch:${creds.tool}` };
  }
  const events = loadQueue(tool).filter((event) => event?.tool === tool);
  if (events.length !== loadQueue(tool).length) {
    saveQueue(tool, events);
  }
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
    body: JSON.stringify({
      events: batch.map((event) => {
        const copy = { ...event };
        delete copy._session_id;
        return copy;
      })
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body.error || `HTTP ${res.status}` };
  }
  const remaining = events.slice(batch.length);
  saveQueue(tool, remaining);
  if (remaining.length) {
    await flushQueue(tool, clientHeader);
  }
  return { ok: true, written: body.written ?? batch.length };
}

function hookEventToTelemetry(input, tool) {
  if (!input || typeof input !== "object") return null;
  const now = Date.now();
  const sessionId = String(
    input.session_id || input.conversation_id || input.sessionId || ""
  ).trim();
  const agentAccountEmail = resolveAgentAccountEmail(input, tool);
  const modelMeta = buildModelMeta(input, tool);
  const eventName = String(
    input.hook_event_name || input.hookEventName || input.event || input.hook || ""
  ).toLowerCase();

  const hasPrompt = typeof input.prompt === "string" && input.prompt.length > 0;
  const hasSessionEnd =
    typeof input.duration_ms === "number" ||
    typeof input.durationMs === "number" ||
    (typeof input.reason === "string" && typeof input.session_id === "string");
  const hasStopStatus = typeof input.status === "string" && typeof input.loop_count === "number";

  const isExplicitPromptEvent =
    eventName.includes("userpromptsubmit") || eventName.includes("beforesubmitprompt");

  if (isExplicitPromptEvent || (hasPrompt && !hasSessionEnd && !hasStopStatus && !eventName)) {
    const prompt = String(input.prompt || input.user_prompt || "");
    const words = countWords(prompt);
    const chars = Math.min(12000, prompt.length);
    return {
      tool,
      interaction_kind: "send",
      composer_word_estimate: words || 1,
      composer_char_estimate: chars || 1,
      client_occurred_ms: now,
      agent_account_email: agentAccountEmail,
      _session_id: sessionId || undefined,
      ...modelMeta
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
        client_occurred_ms: now,
        agent_account_email: agentAccountEmail
      };
    }
    return null;
  }

  if ((eventName.includes("stop") && !eventName.includes("subagent")) || hasStopStatus) {
    const status = String(input.status || "").toLowerCase();
    if (status === "completed" || status === "aborted" || status === "error" || !status) {
      const pending = consumePendingSubmit(tool, sessionId);
      const latencyMs = pending?.at
        ? Math.min(1_800_000, Math.max(500, now - pending.at))
        : null;
      if (latencyMs) {
        return {
          tool,
          interaction_kind: "response_latency",
          host_response_latency_ms: latencyMs,
          client_occurred_ms: now,
          agent_account_email: agentAccountEmail || pending?.agent_account_email || null,
          model_label: modelMeta.model_label || pending?.model_label || null,
          model_bucket: modelMeta.model_bucket || pending?.model_bucket || "unknown"
        };
      }
      return {
        tool,
        interaction_kind: "engagement_segment",
        engagement_category: "waiting",
        duration_ms: 5000,
        client_occurred_ms: now,
        agent_account_email: agentAccountEmail
      };
    }
    return null;
  }

  if (eventName.includes("sessionstart")) {
    if (tool === "claude_code" && typeof input.model === "string" && input.model.trim()) {
      cacheClaudeSessionModel(input.session_id, input.model);
    }
    return {
      tool,
      interaction_kind: "engagement_segment",
      engagement_category: "reading_idle",
      duration_ms: 2000,
      client_occurred_ms: now,
      agent_account_email: agentAccountEmail
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
  let event = hookEventToTelemetry(input, tool);
  if (event?.interaction_kind === "send" && isDuplicateSend(tool, input, event)) {
    event = null;
  }
  if (event) {
    const sessionId = String(
      input?.session_id || input?.conversation_id || input?.sessionId || ""
    ).trim();
    if (event.interaction_kind === "send" && sessionId) {
      recordPendingSubmit(tool, sessionId, {
        agent_account_email: event.agent_account_email || null,
        model_label: event.model_label || null,
        model_bucket: event.model_bucket || "unknown"
      });
    }
    if (event.interaction_kind === "response_latency" && sessionId) {
      if (patchQueuedSendLatency(tool, sessionId, event.host_response_latency_ms)) {
        event = null;
      }
    }
    if (event) {
      enqueueEvent(tool, event);
    }
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
  saveCredentials(tool, {
    device_token: body.device_token,
    uid: body.uid,
    email: body.email,
    tool: body.tool,
    api_url: apiUrl,
    connected_at: new Date().toISOString()
  });
  const pairedTool = normalizeTool(body.tool) || tool;
  if (pairedTool !== tool) {
    console.error(`Warning: server paired as ${pairedTool} but --tool ${tool} was requested.`);
  }
  console.log(`Connected to Promptly as ${body.email || body.uid} (${pairedTool})`);
  console.log(`Verify: promptly-telemetry status --tool ${pairedTool}`);
  console.log(
    `Saved pairing for ${body.tool}. You can pair Claude Code, Cursor, and Codex on the same computer — run login once per agent.`
  );
}

function cmdStatus(flags) {
  const tool = normalizeTool(flags.tool);
  if (tool) {
    const creds = getCredentials(tool);
    if (!creds?.device_token) {
      console.log(JSON.stringify({ connected: false, tool }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({ connected: true, email: creds.email, tool: creds.tool, uid: creds.uid }, null, 2));
    return;
  }

  const summary = ALL_TOOLS.map((id) => {
    const creds = getCredentials(id);
    return {
      tool: id,
      connected: Boolean(creds?.device_token),
      email: creds?.email || null
    };
  });
  if (!summary.some((row) => row.connected)) {
    console.log("Not connected. Open https://promptly-labs.com/integrations to get pairing codes.");
    process.exit(1);
  }
  console.log(JSON.stringify({ tools: summary }, null, 2));
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
  const creds = getCredentials(tool);
  if (!creds?.device_token) {
    console.error(`Not connected for ${tool}. Run login --tool ${tool} first.`);
    process.exit(1);
  }
  enqueueEvent(tool, {
    tool,
    interaction_kind: "send",
    composer_word_estimate: 1,
    composer_char_estimate: 4,
    client_occurred_ms: Date.now(),
    model_label: "test-send",
    model_bucket: "test-send"
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
      cmdStatus(flags);
      break;
    case "test-send":
      await cmdTestSend(flags);
      break;
    case "open-login":
      cmdOpenLogin(flags);
      break;
    case "flush": {
      const tool = normalizeTool(flags.tool);
      if (!tool) {
        console.error("Usage: promptly-telemetry flush --tool claude_code|cursor|codex");
        process.exit(1);
      }
      const result = await flushQueue(tool, flags.client || TOOL_CLIENT[tool]);
      if (!result.ok) {
        console.error(result.error || "Flush failed");
        process.exit(1);
      }
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default:
      console.log(`Promptly telemetry CLI

Commands:
  hook --tool <tool>          Process hook stdin and upload events
  login --tool <tool> <CODE>  Exchange pairing code for device token
  test-send --tool <tool>     Upload one test prompt (verify stats pipeline)
  status [--tool <tool>]      Show connection status for one or all tools
  open-login --tool <tool>    Print sign-in URL
  flush --tool <tool>         Flush queued events for one tool`);
  }
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
