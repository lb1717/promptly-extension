#!/usr/bin/env node
/**
 * Promptly IDE telemetry CLI — self-contained (bundled into each agent plugin).
 * Never uploads raw prompt text; metadata only.
 */
import { spawn } from "child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { runVendorUsageSync } from "../lib/vendor-usage-sync.mjs";
import { runClaudeOAuthLoginOnly } from "../lib/claude-oauth-login.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TELEMETRY_SCRIPT = fileURLToPath(import.meta.url);

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
const HOOK_FLUSH_BUDGET_MS = 6000;
const FLUSH_LOCK_TTL_MS = 120_000;
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

function devicePrimaryPath() {
  return join(promptlyStorageDir(), "device-primary.json");
}

function readDevicePrimary() {
  const saved = readJson(devicePrimaryPath(), null);
  if (saved?.uid) return saved;
  let earliest = null;
  for (const tool of ALL_TOOLS) {
    const creds = getCredentials(tool);
    if (!creds?.uid || !creds?.device_token) continue;
    const at = String(creds.connected_at || "");
    if (!earliest || at < earliest.connected_at) {
      earliest = {
        uid: creds.uid,
        email: creds.email || null,
        connected_at: at || new Date(0).toISOString(),
        first_tool: tool
      };
    }
  }
  return earliest;
}

function readExplicitDevicePrimary() {
  const saved = readJson(devicePrimaryPath(), null);
  return saved?.uid ? saved : null;
}

/** Force this Promptly account as the one stats go to on this computer. */
function setDevicePrimary(creds, tool) {
  const row = {
    uid: creds.uid,
    email: creds.email || null,
    connected_at: creds.connected_at || new Date().toISOString(),
    first_tool: tool
  };
  writeJson(devicePrimaryPath(), row);
  return row;
}

function writeDevicePrimary(creds, tool) {
  const existing = readExplicitDevicePrimary();
  if (existing?.uid) return existing;
  return setDevicePrimary(creds, tool);
}

function clearDevicePrimary() {
  try {
    writeJson(devicePrimaryPath(), {});
  } catch {
    /* ignore */
  }
}

function findPairedTool(excludeTool) {
  for (const tool of ALL_TOOLS) {
    if (tool === excludeTool) continue;
    const creds = getCredentials(tool);
    if (creds?.device_token) return tool;
  }
  return null;
}

function findPairedToolForUid(uid, excludeTool) {
  for (const tool of ALL_TOOLS) {
    if (tool === excludeTool) continue;
    const creds = getCredentials(tool);
    if (creds?.device_token && creds.uid === uid) return tool;
  }
  return null;
}

function saveCredentialsFromExchange(tool, body, apiUrl) {
  saveCredentials(tool, {
    device_token: body.device_token,
    uid: body.uid,
    email: body.email,
    tool: body.tool,
    api_url: apiUrl,
    connected_at: new Date().toISOString()
  });
}

async function exchangeSiblingTool(apiUrl, anchorTool, targetTool) {
  const anchorCreds = getCredentials(anchorTool);
  if (!anchorCreds?.device_token) {
    throw new Error(`Anchor tool ${anchorTool} is not paired on this computer`);
  }
  const res = await fetch(`${apiUrl}/api/integrations/exchange-sibling`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anchorCreds.device_token}`,
      "x-promptly-client": TOOL_CLIENT[anchorTool]
    },
    body: JSON.stringify({
      tool: targetTool,
      device_label: `${targetTool}-${process.platform}`
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Sibling pairing failed (${res.status})`);
  }
  return body;
}

function collectLocalPairedUids() {
  const uids = new Set();
  for (const tool of ALL_TOOLS) {
    const creds = getCredentials(tool);
    if (creds?.uid) uids.add(creds.uid);
  }
  const primary = readDevicePrimary();
  if (primary?.uid) uids.add(primary.uid);
  return [...uids];
}

async function consolidateStatsOnServer(apiUrl, sourceUids) {
  const anchorTool =
    ALL_TOOLS.find((tool) => {
      const creds = getCredentials(tool);
      return creds?.device_token;
    }) || null;
  if (!anchorTool) {
    throw new Error("No paired coding agent found to authorize stats consolidation");
  }
  const creds = getCredentials(anchorTool);
  const res = await fetch(`${apiUrl}/api/integrations/consolidate-stats`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.device_token}`,
      "x-promptly-client": TOOL_CLIENT[anchorTool]
    },
    body: JSON.stringify({ source_uids: sourceUids })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Stats consolidation failed (${res.status})`);
  }
  return body;
}

async function exchangePrimaryFromCode(apiUrl, tool, code) {
  const res = await fetch(`${apiUrl}/api/integrations/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: code.toUpperCase(),
      tool,
      device_label: `${tool}-${process.platform}-align`
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Exchange failed (${res.status})`);
  }
  saveCredentialsFromExchange(tool, body, apiUrl);
  setDevicePrimary(getCredentials(tool), tool);
  return body;
}

async function alignToolsToDevicePrimary(apiUrl) {
  const primary = readExplicitDevicePrimary() || readDevicePrimary();
  if (!primary?.uid) return { aligned: [], primary: null };
  const anchorTool =
    findPairedToolForUid(primary.uid, null) ||
    (primary.first_tool && getCredentials(primary.first_tool)?.device_token ? primary.first_tool : null) ||
    findPairedTool(null);
  if (!anchorTool) return { aligned: [], primary };

  const aligned = [];
  for (const tool of ALL_TOOLS) {
    const creds = getCredentials(tool);
    if (creds?.device_token && creds.uid === primary.uid) continue;
    try {
      const body = await exchangeSiblingTool(apiUrl, anchorTool, tool);
      saveCredentialsFromExchange(tool, body, apiUrl);
      aligned.push(tool);
    } catch (err) {
      console.error(`[promptly] Could not align ${tool}: ${String(err?.message || err)}`);
    }
  }
  return { aligned, primary };
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

function draftTimingPath(tool) {
  return join(promptlyStorageDir(), `draft-timing-${tool}.json`);
}

const DRAFT_MIN_MS = 500;
const ENGAGEMENT_MIN_MS = 500;
const RESPONSE_LATENCY_MIN_MS = 500;
const READING_IDLE_HEARTBEAT_MS = 60_000;
const HOOK_TRACE_MAX_LINES = 200;
const DRAFT_MAX_MS = 1_800_000;

function loadDraftTimingSessions(tool) {
  const data = readJson(draftTimingPath(tool), { sessions: {} });
  return data.sessions && typeof data.sessions === "object" ? data.sessions : {};
}

function saveDraftTimingSessions(tool, sessions) {
  const pruned = Object.fromEntries(
    Object.entries(sessions)
      .sort((a, b) => (b[1]?.updated_at || 0) - (a[1]?.updated_at || 0))
      .slice(0, MAX_SESSION_MODELS)
  );
  writeJson(draftTimingPath(tool), { sessions: pruned });
}

function markDraftWindowStart(tool, sessionId, atMs = Date.now()) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  const sessions = loadDraftTimingSessions(tool);
  const prev = sessions[sid] && typeof sessions[sid] === "object" ? sessions[sid] : {};
  sessions[sid] = { ...prev, draft_window_start_ms: atMs, updated_at: atMs };
  saveDraftTimingSessions(tool, sessions);
}

function markSessionStarted(tool, sessionId, atMs = Date.now()) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  const sessions = loadDraftTimingSessions(tool);
  sessions[sid] = { draft_window_start_ms: atMs, session_started_ms: atMs, updated_at: atMs };
  saveDraftTimingSessions(tool, sessions);
}

/** Codex often skips SessionStart — treat first prompt submit as session start for screen time. */
function ensureSessionTimingForPromptSubmit(tool, sessionId, hookName) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  const name = String(hookName || "").toLowerCase();
  if (!name.includes("userpromptsubmit") && !name.includes("beforesubmitprompt")) return;
  const sessions = loadDraftTimingSessions(tool);
  const entry = sessions[sid] && typeof sessions[sid] === "object" ? sessions[sid] : null;
  if (!entry?.session_started_ms) {
    markSessionStarted(tool, sid);
    return;
  }
  if (!entry.draft_window_start_ms && entry.session_started_ms) {
    markDraftWindowStart(tool, sid, entry.session_started_ms);
  }
}

function rememberSessionScreenModel(tool, sessionId, modelMeta) {
  const sid = String(sessionId || "").trim();
  const bucket = String(modelMeta?.model_bucket || "").trim();
  if (!sid || !bucket || bucket === "unknown") return;
  const sessions = loadDraftTimingSessions(tool);
  const prev = sessions[sid] && typeof sessions[sid] === "object" ? sessions[sid] : {};
  sessions[sid] = {
    ...prev,
    screen_model_label: modelMeta?.model_label || prev.screen_model_label || null,
    screen_model_bucket: bucket,
    updated_at: Date.now()
  };
  saveDraftTimingSessions(tool, sessions);
}

function mergeSessionScreenModelMeta(tool, sessionId, modelMeta = {}) {
  const bucket = String(modelMeta?.model_bucket || "").trim();
  if (bucket && bucket !== "unknown") {
    return {
      model_label: modelMeta?.model_label || null,
      model_bucket: bucket
    };
  }
  const sid = String(sessionId || "").trim();
  if (!sid) {
    return { model_label: modelMeta?.model_label || null, model_bucket: "unknown" };
  }
  const entry = loadDraftTimingSessions(tool)[sid];
  if (entry?.screen_model_bucket && entry.screen_model_bucket !== "unknown") {
    return {
      model_label: entry.screen_model_label || modelMeta?.model_label || null,
      model_bucket: entry.screen_model_bucket
    };
  }
  return { model_label: modelMeta?.model_label || null, model_bucket: "unknown" };
}

function markReadingIdleStart(tool, sessionId, atMs = Date.now()) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  const sessions = loadDraftTimingSessions(tool);
  const prev = sessions[sid] && typeof sessions[sid] === "object" ? sessions[sid] : {};
  sessions[sid] = {
    ...prev,
    reading_idle_start_ms: atMs,
    draft_window_start_ms: null,
    updated_at: atMs
  };
  saveDraftTimingSessions(tool, sessions);
}

function buildReadingIdleSegment(tool, durationMs, agentAccountEmail, modelMeta) {
  return {
    tool,
    interaction_kind: "engagement_segment",
    engagement_category: "reading_idle",
    duration_ms: durationMs,
    client_occurred_ms: Date.now(),
    agent_account_email: agentAccountEmail || null,
    model_label: modelMeta?.model_label || null,
    model_bucket: modelMeta?.model_bucket || "unknown"
  };
}

function flushReadingIdleSegment(tool, sessionId, agentAccountEmail, modelMeta, atMs = Date.now(), opts = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const sessions = loadDraftTimingSessions(tool);
  const entry = sessions[sid];
  const start = entry?.reading_idle_start_ms;
  if (!start) return null;
  const rawMs = atMs - start;
  sessions[sid] = {
    ...entry,
    reading_idle_start_ms: opts.keepAlive ? atMs : null,
    updated_at: atMs
  };
  saveDraftTimingSessions(tool, sessions);
  if (rawMs < ENGAGEMENT_MIN_MS) return null;
  const resolvedModel = mergeSessionScreenModelMeta(tool, sessionId, modelMeta);
  return buildReadingIdleSegment(
    tool,
    Math.min(1_800_000, Math.floor(rawMs)),
    agentAccountEmail,
    resolvedModel
  );
}

function maybeFlushStaleReadingIdle(tool, sessionId, agentAccountEmail, modelMeta, atMs = Date.now()) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const sessions = loadDraftTimingSessions(tool);
  const start = sessions[sid]?.reading_idle_start_ms;
  if (!start || atMs - start < READING_IDLE_HEARTBEAT_MS) return null;
  return flushReadingIdleSegment(tool, sessionId, agentAccountEmail, modelMeta, atMs, { keepAlive: true });
}

function resolveSessionEndDurationMs(input) {
  const hostDur = Number(input?.duration_ms ?? input?.durationMs ?? 0);
  if (Number.isFinite(hostDur) && hostDur >= ENGAGEMENT_MIN_MS) {
    return Math.min(1_800_000, Math.floor(hostDur));
  }
  return null;
}

function consumeDraftDurationMs(tool, sessionId, atMs = Date.now()) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const sessions = loadDraftTimingSessions(tool);
  const entry = sessions[sid];
  const start = entry?.draft_window_start_ms;
  if (!start) return null;
  const ms = atMs - start;
  sessions[sid] = { ...entry, draft_window_start_ms: null, updated_at: atMs };
  saveDraftTimingSessions(tool, sessions);
  if (ms < DRAFT_MIN_MS || ms > DRAFT_MAX_MS) return null;
  return Math.floor(ms);
}

function buildDraftingSegment(tool, sessionId, draftMs, agentAccountEmail, modelMeta) {
  return {
    tool,
    interaction_kind: "engagement_segment",
    engagement_category: "drafting",
    duration_ms: draftMs,
    client_occurred_ms: Date.now(),
    agent_account_email: agentAccountEmail || null,
    model_label: modelMeta?.model_label || null,
    model_bucket: modelMeta?.model_bucket || "unknown"
  };
}

function agentSessionMetaPath(tool) {
  return join(promptlyStorageDir(), `agent-session-meta-${tool}.json`);
}

function lastKnownAgentEmailPath(tool) {
  return join(promptlyStorageDir(), `last-agent-email-${tool}.json`);
}

function readLastKnownAgentEmail(tool) {
  const data = readJson(lastKnownAgentEmailPath(tool), null);
  const email = normalizeAgentEmail(data?.email);
  if (!email) return null;
  const updatedAt = Number(data?.updated_at || 0);
  if (!updatedAt || Date.now() - updatedAt > SESSION_MODEL_TTL_MS) return null;
  return email;
}

function rememberLastKnownAgentEmail(tool, email) {
  const normalized = normalizeAgentEmail(email);
  if (!normalized) return;
  writeJson(lastKnownAgentEmailPath(tool), { email: normalized, updated_at: Date.now() });
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
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, " ");
  if (!value) return null;
  if (value === "minimal" || value === "none") return "low";
  if (value === "xhigh" || value === "extra-high" || value === "extra high" || value === "max") {
    return "xhigh";
  }
  if (["low", "medium", "high"].includes(value)) return value;
  return null;
}

function formatEffortLabel(token) {
  if (!token) return null;
  if (token === "xhigh") return "extra high";
  return token;
}

let codexModelsCache = null;

function readCodexModelsCache() {
  try {
    const path = join(homedir(), ".codex", "models_cache.json");
    if (!existsSync(path)) return codexModelsCache || { models: [] };
    const stat = statSync(path);
    if (codexModelsCache && codexModelsCache._mtime === stat.mtimeMs) {
      return codexModelsCache;
    }
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    codexModelsCache = {
      _mtime: stat.mtimeMs,
      models: Array.isArray(parsed?.models) ? parsed.models : []
    };
    return codexModelsCache;
  } catch {
    return codexModelsCache || { models: [] };
  }
}

function humanizeCodexModelSlug(slug) {
  const raw = String(slug || "").trim();
  if (!raw) return null;
  const entry = readCodexModelsCache().models.find((row) => String(row?.slug || "").trim() === raw);
  if (entry?.display_name) return String(entry.display_name).trim();
  const versioned = raw.match(/^gpt-(\d+(?:\.\d+)?)$/i);
  if (versioned) return `GPT-${versioned[1]}`;
  return raw;
}

function readCodexTurnContextFromTranscript(transcriptPath, turnId) {
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
    const wantedTurn = String(turnId || "").trim();
    let latest = null;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const row = JSON.parse(lines[i]);
        if (row?.type !== "turn_context") continue;
        const payload = row?.payload;
        if (!payload || typeof payload !== "object") continue;
        const ctx = {
          model: typeof payload.model === "string" ? payload.model.trim() : null,
          effort: typeof payload.effort === "string" ? payload.effort.trim() : null,
          turn_id: typeof payload.turn_id === "string" ? payload.turn_id.trim() : null
        };
        if (wantedTurn && ctx.turn_id === wantedTurn) return ctx;
        if (!latest) latest = ctx;
      } catch {
        /* skip malformed tail line */
      }
    }
    return latest;
  } catch {
    return null;
  }
}

function readCodexHookContext(input) {
  const transcriptPath = resolveCodexTranscriptPath(input);
  const turnId = input?.turn_id ?? input?.turnId;
  if (!transcriptPath) return null;
  return readCodexTurnContextFromTranscript(transcriptPath, turnId);
}

function extractCodexMessageText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("")
    .trim();
}

function isCodexBootstrapPrompt(text) {
  const sample = String(text || "").trim();
  if (!sample) return true;
  if (sample.startsWith("# AGENTS.md")) return true;
  if (sample.includes("<INSTRUCTIONS>") && sample.includes("AGENTS.md")) return true;
  return false;
}

function findCodexSessionTranscriptPath(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const suffix = `-${sid}.jsonl`;
  const root = join(homedir(), ".codex", "sessions");
  const walk = (dir, depth = 0) => {
    if (depth > 5 || !existsSync(dir)) return null;
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(suffix)) return path;
      if (entry.isDirectory()) {
        const nested = walk(path, depth + 1);
        if (nested) return nested;
      }
    }
    return null;
  };
  return walk(root);
}

function resolveCodexTranscriptPath(input) {
  const explicit = expandHomePath(input?.transcript_path ?? input?.transcriptPath);
  if (explicit && existsSync(explicit)) return explicit;
  return findCodexSessionTranscriptPath(primarySessionId(input, "codex"));
}

function readCodexTurnBundle(transcriptPath, turnId) {
  const path = expandHomePath(transcriptPath);
  const wantedTurn = String(turnId || "").trim();
  if (!path || !existsSync(path) || !wantedTurn) return null;
  let lines = [];
  try {
    lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  } catch {
    return null;
  }
  let afterTurnContext = false;
  let userPrompt = null;
  let taskComplete = null;
  let turnContext = null;
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row?.type === "turn_context") {
        const payload = row.payload;
        const tid = typeof payload?.turn_id === "string" ? payload.turn_id.trim() : "";
        if (tid === wantedTurn) {
          turnContext = payload;
          afterTurnContext = true;
          userPrompt = null;
        } else {
          afterTurnContext = false;
        }
        continue;
      }
      if (afterTurnContext && row?.type === "response_item") {
        const payload = row.payload;
        if (payload?.type === "message" && payload?.role === "user") {
          const text = extractCodexMessageText(payload.content);
          if (text && !isCodexBootstrapPrompt(text)) {
            userPrompt = text;
          }
        }
        continue;
      }
      if (row?.type === "event_msg" && row?.payload?.type === "task_complete") {
        if (row.payload?.turn_id === wantedTurn) {
          taskComplete = row.payload;
        }
      }
    } catch {
      /* skip malformed transcript line */
    }
  }
  if (!userPrompt || !taskComplete) return null;
  return { userPrompt, taskComplete, turnContext };
}

function recoverCodexTurnEventsFromStop(input, tool, agentAccountEmail, modelMeta, now = Date.now()) {
  if (tool !== "codex" || !isResponseEndPayload(input)) return null;
  if (peekPendingSubmit(tool, input)?.at) return null;
  const turnId = String(input?.turn_id || input?.turnId || "").trim();
  const sessionId = primarySessionId(input, tool);
  if (!turnId || !sessionId) return null;
  const transcriptPath = resolveCodexTranscriptPath(input);
  if (!transcriptPath) return null;
  const bundle = readCodexTurnBundle(transcriptPath, turnId);
  if (!bundle) return null;

  const completedRaw = Number(bundle.taskComplete.completed_at ?? 0);
  const completedMs =
    completedRaw > 1_000_000_000_000
      ? Math.floor(completedRaw)
      : completedRaw > 0
        ? Math.floor(completedRaw * 1000)
        : now;
  const durationMs = Math.min(
    1_800_000,
    Math.max(
      RESPONSE_LATENCY_MIN_MS,
      Math.floor(Number(bundle.taskComplete.duration_ms ?? bundle.taskComplete.durationMs ?? 0))
    )
  );
  const sendAtMs = Math.max(completedMs - durationMs, completedMs - 1_800_000);

  const ctxModel =
    typeof bundle.turnContext?.model === "string"
      ? bundle.turnContext.model.trim()
      : typeof input?.model === "string"
        ? input.model.trim()
        : null;
  const mergedInput = ctxModel ? { ...input, model: ctxModel } : input;
  const resolvedModel = buildModelMeta(mergedInput, tool);
  const words = countWords(bundle.userPrompt);
  const chars = Math.min(12000, bundle.userPrompt.length);

  return {
    send: {
      tool,
      interaction_kind: "send",
      composer_word_estimate: words || 1,
      composer_char_estimate: chars || 1,
      client_occurred_ms: sendAtMs,
      agent_account_email: agentAccountEmail,
      _session_id: sessionId,
      ...resolvedModel
    },
    latency: {
      tool,
      interaction_kind: "response_latency",
      host_response_latency_ms: durationMs,
      client_occurred_ms: completedMs || now,
      agent_account_email: agentAccountEmail,
      model_label: resolvedModel.model_label || modelMeta.model_label || null,
      model_bucket: resolvedModel.model_bucket || modelMeta.model_bucket || "unknown"
    }
  };
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

function sanitizeClaudeAgentEmailCache() {
  const codexEmail = readCodexAgentEmail();
  if (!codexEmail) return;
  const lastPath = lastKnownAgentEmailPath("claude_code");
  const last = readJson(lastPath, null);
  if (normalizeAgentEmail(last?.email) === codexEmail) {
    try {
      writeJson(lastPath, { email: null, updated_at: 0 });
    } catch {
      /* ignore */
    }
  }
  const sessions = loadAgentSessionMeta("claude_code");
  let dirty = false;
  for (const [sid, entry] of Object.entries(sessions)) {
    if (entry?.agent_account_email === codexEmail) {
      delete sessions[sid].agent_account_email;
      dirty = true;
    }
  }
  if (dirty) {
    writeJson(agentSessionMetaPath("claude_code"), { sessions });
  }
}

function claudeConfigPaths() {
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  return {
    stateJson: join(homedir(), ".claude.json"),
    credentialsJson: join(configDir, ".credentials.json")
  };
}

function deepFindAgentEmail(value, depth = 0) {
  if (depth > 10 || value == null) return null;
  if (typeof value === "string") {
    const direct = normalizeAgentEmail(value);
    if (direct) return direct;
    if (value.includes(".")) {
      const jwtEmail = decodeJwtEmail(value);
      if (jwtEmail) return jwtEmail;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = deepFindAgentEmail(item, depth + 1);
      if (email) return email;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const key of ["emailAddress", "email", "account_email", "login"]) {
      const email = normalizeAgentEmail(value[key]);
      if (email) return email;
    }
    for (const nested of Object.values(value)) {
      const email = deepFindAgentEmail(nested, depth + 1);
      if (email) return email;
    }
  }
  return null;
}

function readClaudeCodeAgentEmail() {
  try {
    const { stateJson, credentialsJson } = claudeConfigPaths();
    const state = readJson(stateJson, null);
    const oauthEmail = state?.oauthAccount?.emailAddress;
    if (typeof oauthEmail === "string") {
      const email = normalizeAgentEmail(oauthEmail);
      if (email) return email;
    }
    const stateEmail = deepFindAgentEmail(state);
    if (stateEmail) return stateEmail;
    const creds = readJson(credentialsJson, null);
    if (creds && typeof creds === "object") {
      for (const key of ["email", "emailAddress", "account_email", "login"]) {
        const email = normalizeAgentEmail(creds[key]);
        if (email) return email;
      }
      for (const value of Object.values(creds)) {
        if (typeof value === "string" && value.includes(".")) {
          const email = decodeJwtEmail(value);
          if (email) return email;
        }
      }
      const credEmail = deepFindAgentEmail(creds);
      if (credEmail) return credEmail;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readCursorAgentEmailFromEnv() {
  return normalizeAgentEmail(process.env.CURSOR_USER_EMAIL);
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

function emailCandidatesFromHook(input, tool) {
  if (!input || typeof input !== "object") return [];
  if (tool === "claude_code") {
    return [
      input.anthropic_email,
      input.anthropicEmail,
      input.account_email,
      input.accountEmail
    ];
  }
  if (tool === "cursor") {
    return [
      process.env.CURSOR_USER_EMAIL,
      input.user_email,
      input.userEmail,
      input.account_email,
      input.accountEmail,
      input.login_email,
      input.loginEmail
    ];
  }
  if (tool === "codex") {
    return [
      input.user_email,
      input.userEmail,
      input.account_email,
      input.accountEmail,
      input.login_email,
      input.loginEmail
    ];
  }
  return [];
}

function extractAgentAccountEmail(input, tool) {
  for (const candidate of emailCandidatesFromHook(input, tool)) {
    const email = normalizeAgentEmail(candidate);
    if (email) return email;
  }

  if (tool === "claude_code") {
    return readClaudeCodeAgentEmail();
  }

  const sessionId = input?.session_id ?? input?.conversation_id ?? input?.sessionId;
  const cached = agentSessionMeta(tool, sessionId);
  if (cached?.agent_account_email) return cached.agent_account_email;

  if (tool === "codex") {
    return readCodexAgentEmail();
  }
  if (tool === "cursor") {
    return readCursorAgentEmailFromEnv();
  }
  return null;
}

function resolveAgentAccountEmail(input, tool) {
  const hookEmails = emailCandidatesFromHook(input, tool)
    .map((candidate) => normalizeAgentEmail(candidate))
    .filter(Boolean);
  let email = hookEmails[0] || extractAgentAccountEmail(input, tool);

  if (!email && tool !== "claude_code") {
    email = readLastKnownAgentEmail(tool);
  }

  const sessionId = input?.session_id ?? input?.conversation_id ?? input?.sessionId;
  const claudeAuthEmail = tool === "claude_code" ? readClaudeCodeAgentEmail() : null;
  const claudeVerified =
    tool !== "claude_code" ||
    hookEmails.includes(email) ||
    (claudeAuthEmail && email === claudeAuthEmail);

  if (email && claudeVerified) {
    rememberLastKnownAgentEmail(tool, email);
    if (sessionId) {
      cacheAgentSessionMeta(tool, sessionId, { agent_account_email: email });
    }
  }
  return claudeVerified ? email : tool === "claude_code" ? null : email;
}

function resolveModelVariant(input, tool) {
  if (tool === "codex") {
    const hookCtx = readCodexHookContext(input);
    const fromPayload = normalizeEffortToken(
      input?.effort ??
        input?.model_reasoning_effort ??
        input?.reasoning_effort ??
        input?.reasoningEffort ??
        hookCtx?.effort
    );
    if (fromPayload) return fromPayload;
    const cfg = readCodexConfig();
    return normalizeEffortToken(cfg.model_reasoning_effort) || null;
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
  const label = formatEffortLabel(variant) || variant;
  const display = base.model_label ? `${base.model_label} · ${label}` : `Unknown · ${label}`;
  const bucket = slugToModelBucket(`${base.model_bucket}-${variant}`);
  return { model_label: display.slice(0, 120), model_bucket: bucket };
}

function primarySessionId(input, tool) {
  if (tool === "cursor") {
    return String(input?.conversation_id || input?.session_id || input?.sessionId || "").trim();
  }
  return String(input?.session_id || input?.conversation_id || input?.sessionId || "").trim();
}

function hookSessionLookupIds(input, tool) {
  const ids = [];
  const seen = new Set();
  const add = (value) => {
    const sid = String(value || "").trim();
    if (!sid || seen.has(sid)) return;
    seen.add(sid);
    ids.push(sid);
  };
  if (tool === "cursor") {
    add(input?.conversation_id);
    add(input?.session_id);
    add(input?.sessionId);
    const generationId = String(input?.generation_id || "").trim();
    if (generationId) add(`gen:${generationId}`);
  } else {
    add(input?.session_id);
    add(input?.conversation_id);
    add(input?.sessionId);
    if (tool === "codex") {
      const turnId = String(input?.turn_id || input?.turnId || "").trim();
      if (turnId) add(`turn:${turnId}`);
    }
  }
  return ids;
}

function recordPendingSubmit(tool, input, meta) {
  const primary = primarySessionId(input, tool);
  const ids = hookSessionLookupIds(input, tool);
  const keys = primary ? [primary, ...ids.filter((id) => id !== primary)] : ids;
  if (!keys.length) return;
  const data = readJson(pendingSubmitsPath(tool), { pending: {} });
  const pending = data.pending && typeof data.pending === "object" ? data.pending : {};
  const entry = { at: Date.now(), primary_id: primary || keys[0], ...meta };
  for (const key of keys) {
    pending[key] = entry;
  }
  writeJson(pendingSubmitsPath(tool), { pending });
}

function peekPendingSubmit(tool, input) {
  const ids = hookSessionLookupIds(input, tool);
  const primary = primarySessionId(input, tool);
  if (primary && !ids.includes(primary)) ids.unshift(primary);
  const pending = readJson(pendingSubmitsPath(tool), { pending: {} }).pending || {};
  for (const id of ids) {
    if (pending[id]) return pending[id];
  }
  return null;
}

function consumePendingSubmit(tool, input) {
  const ids = hookSessionLookupIds(input, tool);
  const primary = primarySessionId(input, tool);
  if (primary && !ids.includes(primary)) ids.unshift(primary);
  if (!ids.length) return null;
  const data = readJson(pendingSubmitsPath(tool), { pending: {} });
  const pending = data.pending && typeof data.pending === "object" ? data.pending : {};
  let entry = null;
  for (const id of ids) {
    if (pending[id]) {
      entry = pending[id];
      break;
    }
  }
  if (!entry) return null;
  const primaryKey = entry.primary_id || ids.find((id) => pending[id] === entry) || ids[0];
  for (const [key, value] of Object.entries(pending)) {
    if (value === entry || value?.primary_id === primaryKey || key === primaryKey) {
      delete pending[key];
    }
  }
  writeJson(pendingSubmitsPath(tool), { pending });
  return entry;
}

function patchQueuedSendLatency(tool, sessionIds, latencyMs) {
  if (!latencyMs) return false;
  const ids = new Set(
    (Array.isArray(sessionIds) ? sessionIds : [sessionIds])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  if (!ids.size) return false;
  const events = loadQueue(tool);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    const sid = String(event?._session_id || "").trim();
    if (event?.interaction_kind === "send" && sid && ids.has(sid)) {
      event.host_response_latency_ms = latencyMs;
      delete event._session_id;
      saveQueue(tool, events);
      return true;
    }
  }
  return false;
}

function hookTracePath(tool) {
  return join(promptlyStorageDir(), `hook-trace-${tool}.jsonl`);
}

function traceHook(tool, input, event, note) {
  try {
    const path = hookTracePath(tool);
    const line =
      JSON.stringify({
        at: Date.now(),
        event: resolveHookEventName(input),
        session: primarySessionId(input, tool) || null,
        lookup_ids: hookSessionLookupIds(input, tool),
        result: event?.interaction_kind || null,
        note: note || null
      }) + "\n";
    mkdirSync(dirname(path), { recursive: true });
    let existing = "";
    if (existsSync(path)) {
      existing = readFileSync(path, "utf8");
    }
    const lines = (existing + line).split("\n").filter(Boolean);
    writeFileSync(path, `${lines.slice(-HOOK_TRACE_MAX_LINES).join("\n")}\n`, "utf8");
  } catch {
    /* tracing must never break hooks */
  }
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
  const sid = primarySessionId(input, tool) || "_";
  const genId = String(input?.generation_id || input?.turn_id || "").trim();
  const key = genId
    ? `${sid}:gen:${genId}`
    : `${sid}:${event.composer_word_estimate}:${event.composer_char_estimate}`;
  const now = Date.now();
  const data = readJson(recentSendsPath(tool), { entries: [] });
  const entries = (Array.isArray(data.entries) ? data.entries : []).filter((entry) => now - entry.at < SEND_DEDUPE_MS);
  if (entries.some((entry) => entry.key === key)) return true;
  entries.push({ key, at: now });
  writeJson(recentSendsPath(tool), { entries: entries.slice(-RECENT_SENDS_MAX) });
  return false;
}

function extractPromptText(input) {
  if (!input || typeof input !== "object") return "";
  for (const field of [
    "prompt",
    "user_prompt",
    "userPrompt",
    "message",
    "content",
    "user_input",
    "userInput",
    "input_text",
    "inputText"
  ]) {
    const value = input[field];
    if (typeof value === "string") return value;
  }
  return "";
}

function flushLockPath(tool) {
  return join(promptlyStorageDir(), `.flush-lock-${tool}.json`);
}

function tryAcquireFlushLock(tool) {
  const path = flushLockPath(tool);
  const now = Date.now();
  if (existsSync(path)) {
    const lock = readJson(path, null);
    if (lock?.at && now - lock.at < FLUSH_LOCK_TTL_MS) {
      return false;
    }
  }
  try {
    writeJson(path, { pid: process.pid, at: now });
    return true;
  } catch {
    return false;
  }
}

function releaseFlushLock(tool) {
  try {
    const path = flushLockPath(tool);
    const lock = readJson(path, null);
    if (!lock?.pid || lock.pid === process.pid) {
      unlinkSync(path);
    }
  } catch {
    /* ignore */
  }
}

function spawnDetachedFlush(tool) {
  if (!getCredentials(tool)?.device_token) return;
  if (loadQueue(tool).length === 0) return;
  try {
    const child = spawn(process.execPath, [TELEMETRY_SCRIPT, "flush", "--tool", tool], {
      detached: true,
      stdio: "ignore",
      env: process.env
    });
    child.unref();
  } catch {
    /* background flush must never break hooks */
  }
}

/** Pending submit recorded but send never reached the queue (hook killed mid-write). */
function recoverOrphanedPendingSubmits(tool, input) {
  const ids = hookSessionLookupIds(input, tool);
  if (!ids.length) return 0;
  const pending = readJson(pendingSubmitsPath(tool), { pending: {} }).pending || {};
  const queue = loadQueue(tool);
  let recovered = 0;
  for (const id of ids) {
    const entry = pending[id];
    if (!entry?.at) continue;
    const hasQueuedSend = queue.some(
      (event) =>
        event?.interaction_kind === "send" &&
        (String(event._session_id || "") === id ||
          (event.client_occurred_ms >= entry.at - 2000 && event.client_occurred_ms <= entry.at + 5000))
    );
    if (hasQueuedSend) continue;
    enqueueEvent(tool, {
      tool,
      interaction_kind: "send",
      composer_word_estimate: 1,
      composer_char_estimate: 1,
      client_occurred_ms: entry.at,
      agent_account_email: entry.agent_account_email || null,
      model_label: entry.model_label || null,
      model_bucket: entry.model_bucket || "unknown",
      _session_id: id
    });
    recovered += 1;
  }
  return recovered;
}

function shouldSpawnBackgroundFlush(tool, hookName, event) {
  if (loadQueue(tool).length === 0) return false;
  const name = String(hookName || "").toLowerCase();
  if (name.includes("sessionend")) return true;
  if (name.includes("beforesubmitprompt") || name.includes("userpromptsubmit")) return true;
  if (isStopHookName(name) || name.includes("afteragentresponse")) return true;
  if (event?.interaction_kind === "send") return true;
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
    const hookCtx = readCodexHookContext(input);
    const modelSlug = hookCtx?.model || input?.model;
    if (typeof modelSlug === "string" && modelSlug.trim()) {
      const slug = modelSlug.trim();
      base = {
        model_label: humanizeCodexModelSlug(slug) || slug,
        model_bucket: slugToModelBucket(slug)
      };
    } else {
      const cfg = readCodexConfig();
      if (base.model_bucket === "unknown" && cfg.model) {
        const slug = String(cfg.model).trim();
        base = {
          model_label: humanizeCodexModelSlug(slug) || slug,
          model_bucket: slugToModelBucket(slug)
        };
      }
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

const MAX_FLUSH_ATTEMPTS = 3;
const FLUSH_RETRY_BASE_MS = 400;

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function flushShouldRetry(status, error) {
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;
  if (!status && error && /fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(String(error))) return true;
  return false;
}

async function drainTelemetryQueue(tool, clientHeader, maxAttempts = 8) {
  let attempts = 0;
  let lastResult = { ok: true, written: 0 };
  while (loadQueue(tool).length > 0 && attempts < maxAttempts) {
    lastResult = await flushQueue(tool, clientHeader);
    if (loadQueue(tool).length === 0) {
      return lastResult;
    }
    if (lastResult.skipped === "flush_in_progress") {
      await sleepMs(120);
      attempts += 1;
      continue;
    }
    if (!lastResult.ok) {
      await sleepMs(FLUSH_RETRY_BASE_MS);
    }
    attempts += 1;
  }
  return lastResult;
}

async function awaitFlushHookQueue(tool, clientHeader, hookName, event) {
  if (!getCredentials(tool)?.device_token || loadQueue(tool).length === 0) {
    return;
  }
  const urgent = shouldSpawnBackgroundFlush(tool, hookName, event);
  let flushResult;
  if (urgent) {
    flushResult = await drainTelemetryQueue(tool, clientHeader);
  } else {
    flushResult = await Promise.race([
      drainTelemetryQueue(tool, clientHeader, 3),
      sleepMs(HOOK_FLUSH_BUDGET_MS).then(() => ({
        ok: false,
        error: "flush_timeout_hook_budget",
        timedOut: true
      }))
    ]);
  }
  recordFlushResult(tool, flushResult);
  if (!flushResult.ok) {
    console.error("[promptly]", flushResult.error || "Upload failed");
  }
  if (loadQueue(tool).length > 0) {
    spawnDetachedFlush(tool);
  }
}

async function flushQueue(tool, clientHeader, attempt = 0) {
  const creds = getCredentials(tool);
  if (!creds?.device_token) {
    return { ok: false, error: "not_connected" };
  }
  if (normalizeTool(creds.tool) && normalizeTool(creds.tool) !== tool) {
    return { ok: false, error: `credentials_mismatch:${creds.tool}` };
  }
  if (!tryAcquireFlushLock(tool)) {
    return { ok: true, written: 0, skipped: "flush_in_progress" };
  }
  try {
    const events = loadQueue(tool).filter((event) => event?.tool === tool);
    if (events.length !== loadQueue(tool).length) {
      saveQueue(tool, events);
    }
    if (!events.length) {
      return { ok: true, written: 0 };
    }
    const batch = events.slice(0, MAX_BATCH);
    const apiUrl = creds.api_url || DEFAULT_API_URL;
    let res;
    let body = {};
    try {
      res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/telemetry/ide-activity`, {
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
      body = await res.json().catch(() => ({}));
    } catch (err) {
      const message = String(err?.message || err);
      if (attempt + 1 < MAX_FLUSH_ATTEMPTS && flushShouldRetry(undefined, message)) {
        await sleepMs(FLUSH_RETRY_BASE_MS * (attempt + 1));
        return flushQueue(tool, clientHeader, attempt + 1);
      }
      return { ok: false, error: message };
    }
    if (!res.ok) {
      if (attempt + 1 < MAX_FLUSH_ATTEMPTS && flushShouldRetry(res.status, body.error)) {
        await sleepMs(FLUSH_RETRY_BASE_MS * (attempt + 1));
        return flushQueue(tool, clientHeader, attempt + 1);
      }
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    }
    const remaining = events.slice(batch.length);
    saveQueue(tool, remaining);
    if (remaining.length) {
      return flushQueue(tool, clientHeader);
    }
    return { ok: true, written: body.written ?? batch.length };
  } finally {
    releaseFlushLock(tool);
  }
}

const VENDOR_USAGE_SYNC_MIN_MS = 15 * 60 * 1000;

async function maybeSyncVendorUsage(_tool, _clientHeader) {
  // Disabled: auto-sync on hooks triggered macOS Keychain prompts. Run `usage-sync` manually instead.
  return;
}

function hookEventName(input) {
  return String(
    input?.hook_event_name || input?.hookEventName || input?.event || input?.hook || ""
  ).toLowerCase();
}

function resolveHookEventName(input) {
  const explicit = hookEventName(input);
  if (explicit) return explicit;
  if (!input || typeof input !== "object") return "";
  const hasPrompt = extractPromptText(input).length > 0;
  if (hasPrompt) return "beforesubmitprompt";
  const hasStopStatus = typeof input.status === "string" && typeof input.loop_count === "number";
  if (hasStopStatus) return "stop";
  if (typeof input.text === "string" && input.text.length > 0 && !hasPrompt) {
    return "afteragentresponse";
  }
  if (
    typeof input.last_assistant_message === "string" ||
    input.stop_hook_active === true ||
    input.stopHookActive === true
  ) {
    return "stop";
  }
  if (typeof input.duration_ms === "number" || typeof input.durationMs === "number") {
    return "sessionend";
  }
  if (typeof input.reason === "string" && (input.session_id || input.conversation_id)) {
    return "sessionend";
  }
  return "";
}

function isResponseEndPayload(input, eventName = resolveHookEventName(input)) {
  const name = String(eventName || "").toLowerCase();
  if (name.includes("afteragentresponse")) return true;
  if (name.includes("stop") && !name.includes("subagent")) return true;
  if (typeof input?.status === "string" && typeof input?.loop_count === "number") return true;
  if (typeof input?.last_assistant_message === "string" && input.last_assistant_message.length > 0) {
    return true;
  }
  if (input?.stop_hook_active === true || input?.stopHookActive === true) return true;
  return false;
}

function hookModelToken(input) {
  const raw =
    input?.model ??
    input?.composer_model ??
    input?.composerModel ??
    input?.model_label ??
    input?.modelLabel ??
    "";
  return String(raw).trim().toLowerCase();
}

function isCursorHostPayload(input) {
  const event = hookEventName(input);
  if (event.includes("beforesubmitprompt")) return true;
  if (input?.conversation_id && !input?.session_id && !input?.transcript_path) return true;
  const model = hookModelToken(input);
  if (/^composer-/.test(model)) return true;
  if (typeof input?.loop_count === "number" && typeof input?.status === "string") return true;
  return false;
}

function isCodexLikePromptSubmit(input) {
  const event = hookEventName(input);
  if (!event.includes("userpromptsubmit")) return false;
  const model = hookModelToken(input);
  if (model.startsWith("claude")) return false;
  if (/^(gpt-|o[0-9]|codex)/.test(model)) return true;
  if (typeof input?.effort === "string" || typeof input?.model_reasoning_effort === "string") return true;
  if (typeof input?.reasoning_effort === "string") return true;
  const hookCtx = readCodexHookContext(input);
  const ctxModel = String(hookCtx?.model || "").trim().toLowerCase();
  if (ctxModel && /^(gpt-|o[0-9]|codex)/.test(ctxModel)) return true;
  return false;
}

function isClaudeCodeHostPayload(input) {
  const event = hookEventName(input);
  if (event.includes("userpromptsubmit")) {
    if (isCodexLikePromptSubmit(input)) return false;
    const model = hookModelToken(input);
    if (/^(gpt-|o[0-9]|codex)/.test(model)) return false;
    if (input?.transcript_path) return true;
    if (model.startsWith("claude")) return true;
    if (input?.turn_id && typeof input?.session_id === "string") {
      if (input?.transcript_path || model.startsWith("claude")) return true;
      return false;
    }
    if (input?.session_id && !input?.conversation_id) {
      if (input?.transcript_path || model.startsWith("claude")) return true;
      return false;
    }
    return false;
  }
  if (input?.transcript_path) return true;
  if (event.includes("sessionstart") || event.includes("sessionend")) {
    if (input?.session_id) return true;
  }
  if ((event === "stop" || event.endsWith(".stop")) && input?.session_id) {
    const model = hookModelToken(input);
    if (/^(gpt-|o[0-9]|codex)/.test(model)) return false;
    if (typeof input?.loop_count !== "number") return true;
  }
  if (input?.session_id && !input?.conversation_id) {
    const model = hookModelToken(input);
    if (!model || model.startsWith("claude")) return true;
  }
  return false;
}

function isCodexHostPayload(input) {
  const event = resolveHookEventName(input);
  if (event.includes("userpromptsubmit")) {
    return isCodexLikePromptSubmit(input);
  }
  if ((event === "stop" || event.endsWith(".stop")) && input?.session_id) {
    const model = hookModelToken(input);
    if (/^(gpt-|o[0-9]|codex)/.test(model)) return true;
    if (typeof input?.last_assistant_message === "string") return true;
    if (typeof input?.loop_count !== "number") return true;
  }
  if (typeof input?.last_assistant_message === "string" || input?.stop_hook_active === true) {
    return true;
  }
  const model = hookModelToken(input);
  if (/^(gpt-|o[0-9]|codex)/.test(model)) return true;
  if (typeof input?.model_reasoning_effort === "string") return true;
  if (typeof input?.reasoning_effort === "string") return true;
  return false;
}

function isPromptSubmitPayload(input) {
  const event = resolveHookEventName(input);
  if (event.includes("userpromptsubmit") || event.includes("beforesubmitprompt")) return true;
  const hasPrompt = extractPromptText(input).length > 0;
  const hasSessionEnd =
    typeof input?.duration_ms === "number" ||
    typeof input?.durationMs === "number" ||
    (typeof input?.reason === "string" &&
      (typeof input?.session_id === "string" || typeof input?.conversation_id === "string"));
  const hasStopStatus = typeof input?.status === "string" && typeof input?.loop_count === "number";
  return hasPrompt && !hasSessionEnd && !hasStopStatus;
}

/**
 * Reject cross-host *prompt* payloads (e.g. Cursor stdin reaching --tool claude_code).
 * Lifecycle hooks (session start/end, stop) trust the hook command's --tool flag.
 */
function isStopHookName(hookName) {
  const name = String(hookName || "").toLowerCase();
  return name.includes("stop") && !name.includes("subagent");
}

function stopStatusAccepted(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (!value) return true;
  return (
    value === "completed" ||
    value === "complete" ||
    value === "success" ||
    value === "done" ||
    value === "finished" ||
    value === "aborted" ||
    value === "error" ||
    value === "cancelled" ||
    value === "canceled"
  );
}

function buildStopTelemetryEvent(tool, input, agentAccountEmail, modelMeta, now = Date.now()) {
  const pending = consumePendingSubmit(tool, input);
  if (!pending?.at) return null;
  const latencyMs = Math.min(
    1_800_000,
    Math.max(RESPONSE_LATENCY_MIN_MS, now - pending.at)
  );
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

function emitResponseEndEvents(tool, input, agentAccountEmail, modelMeta, now = Date.now()) {
  const sessionId = primarySessionId(input, tool);
  const lookupIds = hookSessionLookupIds(input, tool);
  if (sessionId) {
    markReadingIdleStart(tool, sessionId, now);
  }
  const event = buildStopTelemetryEvent(tool, input, agentAccountEmail, modelMeta, now);
  if (event) {
    const patched = patchQueuedSendLatency(tool, lookupIds, event.host_response_latency_ms);
    return { event, patched, recoveredSend: null };
  }
  if (tool === "codex") {
    const recovered = recoverCodexTurnEventsFromStop(input, tool, agentAccountEmail, modelMeta, now);
    if (recovered?.latency) {
      return { event: recovered.latency, patched: false, recoveredSend: recovered.send || null };
    }
  }
  return { event: null, patched: false, recoveredSend: null };
}

function hookPayloadMatchesTool(input, tool) {
  if (!input || typeof input !== "object") return false;
  if (!isPromptSubmitPayload(input)) return true;
  if (tool === "codex") {
    if (isCursorHostPayload(input)) return false;
    if (/^composer-/.test(hookModelToken(input))) return false;
    if (input?.transcript_path) return false;
    if (hookModelToken(input).startsWith("claude")) return false;
    // UserPromptSubmit is wired per-tool; accept Codex stdin unless clearly another host.
    return true;
  }
  if (tool === "claude_code") {
    if (isCursorHostPayload(input)) return false;
    if (isCodexLikePromptSubmit(input)) return false;
    if (/^composer-/.test(hookModelToken(input))) return false;
    return true;
  }
  if (tool === "cursor") {
    if (isCodexHostPayload(input) && !isCursorHostPayload(input)) return false;
    if (isClaudeCodeHostPayload(input) && !isCursorHostPayload(input)) return false;
    return true;
  }
  return true;
}

function hookEventToTelemetry(input, tool) {
  if (!hookPayloadMatchesTool(input, tool)) return null;
  if (!input || typeof input !== "object") return null;
  const now = Date.now();
  const sessionId = primarySessionId(input, tool);
  const agentAccountEmail = resolveAgentAccountEmail(input, tool);
  const modelMeta = buildModelMeta(input, tool);
  const eventName = resolveHookEventName(input);

  const hasPrompt = extractPromptText(input).length > 0;
  const hasSessionEnd =
    typeof input.duration_ms === "number" ||
    typeof input.durationMs === "number" ||
    (typeof input.reason === "string" &&
      (typeof input.session_id === "string" || typeof input.conversation_id === "string"));
  const hasStopStatus = typeof input.status === "string" && typeof input.loop_count === "number";

  const isExplicitPromptEvent =
    eventName.includes("userpromptsubmit") || eventName.includes("beforesubmitprompt");

  if (isExplicitPromptEvent || (hasPrompt && !hasSessionEnd && !hasStopStatus && !eventName)) {
    const prompt = extractPromptText(input);
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
    const dur = resolveSessionEndDurationMs(input);
    if (dur !== null) {
      const resolvedModel = mergeSessionScreenModelMeta(tool, sessionId, modelMeta);
      return {
        tool,
        interaction_kind: "engagement_segment",
        engagement_category: "reading_idle",
        duration_ms: dur,
        client_occurred_ms: now,
        agent_account_email: agentAccountEmail,
        ...resolvedModel
      };
    }
    return null;
  }

  if (isResponseEndPayload(input, eventName)) {
    if (hasStopStatus && !stopStatusAccepted(input.status)) {
      return null;
    }
    // Response latency is assembled in cmdHook so pending is consumed once.
    return null;
  }

  if (eventName.includes("sessionstart")) {
    if (tool === "claude_code" && typeof input.model === "string" && input.model.trim()) {
      cacheClaudeSessionModel(input.session_id, input.model);
    }
    return null;
  }

  return null;
}

function recordFlushResult(tool, result) {
  const path = join(promptlyStorageDir(), `last-flush-${tool}.json`);
  writeJson(path, { at: Date.now(), ...result });
}

async function cmdHook(flags) {
  const tool = normalizeTool(flags.tool);
  if (!tool) {
    console.error("Missing --tool claude_code|cursor|codex");
    process.exit(1);
  }
  if (tool === "claude_code") {
    sanitizeClaudeAgentEmailCache();
  }
  const input = await readStdinJson();
  if (input && !hookPayloadMatchesTool(input, tool)) {
    const clientHeader = flags.client || TOOL_CLIENT[tool];
    spawnDetachedFlush(tool);
    try {
      await flushQueue(tool, clientHeader);
    } catch (err) {
      console.error("[promptly]", String(err?.message || err));
      spawnDetachedFlush(tool);
    }
    process.exit(0);
  }
  let event = hookEventToTelemetry(input, tool);
  if (event?.interaction_kind === "send" && isDuplicateSend(tool, input, event)) {
    event = null;
  }
  const sessionId = primarySessionId(input, tool);
  const hookName = resolveHookEventName(input);
  const agentAccountEmail = resolveAgentAccountEmail(input, tool);
  const modelMeta = buildModelMeta(input, tool);
  ensureSessionTimingForPromptSubmit(tool, sessionId, hookName);
  if (sessionId) {
    const staleIdle = maybeFlushStaleReadingIdle(tool, sessionId, agentAccountEmail, modelMeta);
    if (staleIdle) {
      enqueueEvent(tool, staleIdle);
    }
  }
  if (hookName.includes("sessionstart") && sessionId) {
    markSessionStarted(tool, sessionId);
  }
  if (hookName.includes("sessionend") && sessionId) {
    const sessionIdle = flushReadingIdleSegment(tool, sessionId, agentAccountEmail, modelMeta);
    if (sessionIdle) {
      enqueueEvent(tool, sessionIdle);
    }
    const recovered = recoverOrphanedPendingSubmits(tool, input);
    if (recovered > 0) {
      traceHook(tool, input, null, `recovered_orphan_sends:${recovered}`);
    }
  }
  if (isResponseEndPayload(input, hookName)) {
    const response = emitResponseEndEvents(tool, input, agentAccountEmail, modelMeta);
    if (response.recoveredSend && !isDuplicateSend(tool, input, response.recoveredSend)) {
      ensureSessionTimingForPromptSubmit(tool, sessionId, "userpromptsubmit");
      enqueueEvent(tool, response.recoveredSend);
      traceHook(tool, input, response.recoveredSend, "codex_stop_transcript_recovery");
    }
    if (response.event) {
      event = response.event;
      if (sessionId) {
        rememberSessionScreenModel(tool, sessionId, {
          model_label: response.event.model_label,
          model_bucket: response.event.model_bucket
        });
      }
    } else if (!event || event.interaction_kind === "send") {
      event = null;
    }
    if (response.patched && !response.event) {
      traceHook(tool, input, null, "patched_send_latency_only");
    }
  }
  if (event) {
    if (sessionId) {
      const eventModel = {
        model_label: event.model_label || null,
        model_bucket: event.model_bucket || "unknown"
      };
      if (event.interaction_kind === "send" || event.interaction_kind === "response_latency") {
        rememberSessionScreenModel(tool, sessionId, eventModel);
      }
    }
    if (event.interaction_kind === "send" && sessionId) {
      const sendModel = mergeSessionScreenModelMeta(tool, sessionId, {
        model_label: event.model_label,
        model_bucket: event.model_bucket
      });
      const readingIdle = flushReadingIdleSegment(
        tool,
        sessionId,
        event.agent_account_email,
        sendModel
      );
      if (readingIdle) {
        enqueueEvent(tool, readingIdle);
      }
      const draftMs = consumeDraftDurationMs(tool, sessionId);
      if (draftMs) {
        enqueueEvent(
          tool,
          buildDraftingSegment(
            tool,
            sessionId,
            draftMs,
            event.agent_account_email,
            sendModel
          )
        );
      }
    }
    if (sessionId && event.interaction_kind === "engagement_segment" && event.engagement_category === "reading_idle") {
      markReadingIdleStart(tool, sessionId);
    }
    enqueueEvent(tool, event);
    if (event.interaction_kind === "send" && sessionId) {
      recordPendingSubmit(tool, input, {
        agent_account_email: event.agent_account_email || null,
        model_label: event.model_label || null,
        model_bucket: event.model_bucket || "unknown"
      });
    }
  }
  traceHook(tool, input, event, event ? null : "no_event_emitted");
  const clientHeader = flags.client || TOOL_CLIENT[tool];
  try {
    await awaitFlushHookQueue(tool, clientHeader, hookName, event);
    await maybeSyncVendorUsage(tool, clientHeader);
  } catch (err) {
    const message = String(err?.message || err);
    recordFlushResult(tool, { ok: false, error: message });
    spawnDetachedFlush(tool);
    // Hooks must not fail the host agent
    console.error("[promptly]", message);
  }
  process.exit(0);
}

async function cmdLogin(flags) {
  const tool = normalizeTool(flags.tool);
  const fromSibling = flags["from-sibling"] === true || flags["from-sibling"] === "true";
  const resetPrimaryFlag = flags["reset-primary"];
  const switchingPrimary =
    resetPrimaryFlag === true ||
    resetPrimaryFlag === "true" ||
    (typeof resetPrimaryFlag === "string" && resetPrimaryFlag.trim().length >= 6);
  const code = String(
    flags._rest[0] || flags.code || (typeof resetPrimaryFlag === "string" ? resetPrimaryFlag : "") || ""
  ).trim();
  const apiUrl = (flags["api-url"] || DEFAULT_API_URL).replace(/\/$/, "");

  if (!tool) {
    console.error("Missing --tool. Usage: promptly-telemetry login --tool codex <CODE>");
    process.exit(1);
  }

  if (switchingPrimary) {
    clearDevicePrimary();
  }

  if (fromSibling || (!code && !switchingPrimary && findPairedTool(tool))) {
    const anchorTool = findPairedTool(tool);
    if (!anchorTool) {
      console.error(
        "No other coding agent is paired on this computer yet. Pair one agent with a code from promptly-labs.com/integrations first."
      );
      process.exit(1);
    }
    try {
      const body = await exchangeSiblingTool(apiUrl, anchorTool, tool);
      saveCredentialsFromExchange(tool, body, apiUrl);
      const primary = readDevicePrimary() || writeDevicePrimary(getCredentials(tool), tool);
      console.log(`Connected ${tool} to the same Promptly account as ${anchorTool}: ${body.email || body.uid}`);
      console.log(`Device primary: ${primary.email || primary.uid} (first paired on this computer)`);
      console.log(`Verify: promptly-telemetry status --tool ${tool}`);
      return;
    } catch (err) {
      console.error(String(err?.message || err));
      process.exit(1);
    }
  }

  if (!code) {
    console.error("Usage: promptly-telemetry login --tool claude_code|cursor|codex <CODE>");
    console.error("       promptly-telemetry login --tool cursor --from-sibling");
    process.exit(1);
  }

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

  const primary = switchingPrimary ? null : readExplicitDevicePrimary() || readDevicePrimary();
  if (!switchingPrimary && primary?.uid && body.uid && body.uid !== primary.uid) {
    console.error(
      `This pairing code is for ${body.email || body.uid}, but this computer already sends stats to ${primary.email || primary.uid}.`
    );
    console.error(
      `To switch to ${body.email || body.uid}, run: promptly-telemetry align-device --set-primary ${code}`
    );
    process.exit(1);
  }

  saveCredentialsFromExchange(tool, body, apiUrl);
  const pairedTool = normalizeTool(body.tool) || tool;
  if (pairedTool !== tool) {
    console.error(`Warning: server paired as ${pairedTool} but --tool ${tool} was requested.`);
  }
  const devicePrimary = switchingPrimary
    ? setDevicePrimary(getCredentials(tool), tool)
    : writeDevicePrimary(getCredentials(tool), tool);
  const sourceUidsBefore = switchingPrimary ? collectLocalPairedUids() : [];
  const alignment = await alignToolsToDevicePrimary(apiUrl);
  if (switchingPrimary) {
    const sourceUids = [...new Set([...sourceUidsBefore, ...collectLocalPairedUids()])].filter(
      (uid) => uid && uid !== devicePrimary.uid
    );
    if (sourceUids.length) {
      try {
        const consolidation = await consolidateStatsOnServer(apiUrl, sourceUids);
        console.log(
          `Consolidated historical stats: ${consolidation.eventsMoved ?? 0} events → ${consolidation.target_email || devicePrimary.email || devicePrimary.uid}`
        );
      } catch (err) {
        console.error(`[promptly] Stats consolidation: ${String(err?.message || err)}`);
      }
    }
  }
  console.log(`Connected to Promptly as ${body.email || body.uid} (${pairedTool})`);
  console.log(`Device primary on this computer: ${devicePrimary.email || devicePrimary.uid}`);
  if (alignment.aligned.length) {
    console.log(`Also aligned: ${alignment.aligned.join(", ")}`);
  }
  console.log(`Verify: promptly-telemetry status --tool ${pairedTool}`);
  console.log(
    "Pair other agents with: promptly-telemetry login --tool <cursor|codex|claude_code> --from-sibling"
  );
}

async function cmdAlignDevice(flags) {
  const setPrimaryCode = String(flags["set-primary"] || flags._rest[0] || "").trim();
  if (setPrimaryCode) {
    flags._rest = [setPrimaryCode];
    await cmdFixAccount(flags);
    return;
  }
  console.error("To pick your Promptly account with a pairing code, run: promptly-telemetry fix-account YOUR_CODE");
  process.exit(1);
}

function normalizePairCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function collectAllKnownLocalUids() {
  const uids = new Set(collectLocalPairedUids());
  const legacy = readJson(legacyCredentialsPath(), null);
  if (legacy?.uid) uids.add(String(legacy.uid));
  for (const tool of ALL_TOOLS) {
    const creds = readJson(credentialsPathForTool(tool), null);
    if (creds?.uid) uids.add(String(creds.uid));
  }
  return [...uids];
}

/** One-shot: code account = only Promptly account on this computer; merge split stats. */
function stripLegacyCredentialsIfStale(targetUid) {
  const legacy = readJson(legacyCredentialsPath(), null);
  if (!legacy?.device_token) return;
  if (String(legacy.uid || "") === String(targetUid)) return;
  writeJson(legacyCredentialsPath(), {
    archived: true,
    archived_uid: legacy.uid || null,
    migrated_to_uid: targetUid,
    note: "Use credentials-claude_code.json, credentials-cursor.json, credentials-codex.json"
  });
}

function stampAllCredentialsForTarget(targetUid, targetEmail, apiUrl) {
  for (const tool of ALL_TOOLS) {
    const creds = getCredentials(tool);
    if (!creds?.device_token) continue;
    saveCredentials(tool, {
      ...creds,
      uid: targetUid,
      email: targetEmail || creds.email || null,
      api_url: apiUrl,
      tool
    });
  }
}

async function verifyLiveTrackingForAllTools() {
  console.log("Step 4/4: Verifying live tracking (test upload per agent)…");
  const results = [];
  for (const tool of ALL_TOOLS) {
    try {
      const creds = getCredentials(tool);
      if (!creds?.device_token) {
        throw new Error("not paired");
      }
      enqueueEvent(tool, {
        tool,
        interaction_kind: "send",
        composer_word_estimate: 1,
        composer_char_estimate: 4,
        client_occurred_ms: Date.now(),
        model_label: "fix-account-verify",
        model_bucket: "fix-account-verify"
      });
      const flush = await flushQueue(tool, TOOL_CLIENT[tool]);
      if (!flush.ok) {
        throw new Error(flush.error || "upload failed");
      }
      results.push({ tool, ok: true, written: flush.written ?? 1 });
      console.log(`  ✓ ${tool}: live tracking OK`);
    } catch (err) {
      results.push({ tool, ok: false, error: String(err?.message || err) });
      console.error(`  ✗ ${tool}: ${String(err?.message || err)}`);
    }
  }
  return results;
}

async function cmdFixAccount(flags) {
  const code = normalizePairCode(flags.code || flags._rest[0] || flags["set-primary"]);
  const apiUrl = (flags["api-url"] || DEFAULT_API_URL).replace(/\/$/, "");
  const anchorTool = normalizeTool(flags.tool) || "claude_code";

  if (code.length !== 8) {
    console.error("Usage: promptly-telemetry fix-account ABCD1234");
    console.error("Get a code at https://promptly-labs.com/integrations while signed into the account you want.");
    process.exit(1);
  }

  const sourceUidsBefore = collectAllKnownLocalUids();
  clearDevicePrimary();

  console.log("Step 1/4: Pairing with your code…");
  let body;
  try {
    body = await exchangePrimaryFromCode(apiUrl, anchorTool, code);
  } catch (err) {
    console.error(String(err?.message || err));
    process.exit(1);
  }

  const targetUid = String(body.uid || "").trim();
  const targetEmail = body.email || targetUid;
  console.log(`Main Promptly account on this computer: ${targetEmail}`);

  console.log("Step 2/4: Re-pairing Claude Code, Cursor, and Codex to that account…");
  const aligned = [];
  for (const tool of ALL_TOOLS) {
    if (tool === anchorTool) {
      aligned.push(tool);
      continue;
    }
    try {
      const sibling = await exchangeSiblingTool(apiUrl, anchorTool, tool);
      saveCredentialsFromExchange(tool, sibling, apiUrl);
      aligned.push(tool);
    } catch (err) {
      console.error(`[promptly] Could not pair ${tool}: ${String(err?.message || err)}`);
    }
  }
  setDevicePrimary(getCredentials(anchorTool), anchorTool);
  stampAllCredentialsForTarget(targetUid, targetEmail, apiUrl);
  stripLegacyCredentialsIfStale(targetUid);

  console.log("Step 3/4: Merging any split stats onto that account…");
  const sourceUids = [...new Set([...sourceUidsBefore, ...collectAllKnownLocalUids()])].filter(
    (uid) => uid && uid !== targetUid
  );

  let consolidation = null;
  if (sourceUids.length) {
    try {
      consolidation = await consolidateStatsOnServer(apiUrl, sourceUids);
      const moved = consolidation.eventsMoved ?? 0;
      const devices = consolidation.devicesMoved ?? 0;
      console.log(`Merged ${moved} historical events and ${devices} devices onto ${targetEmail}.`);
    } catch (err) {
      console.error(
        `[promptly] Could not merge old stats (${String(err?.message || err)}). New prompts will still track to ${targetEmail}.`
      );
    }
  } else {
    console.log("No split stats found to merge.");
  }

  const liveChecks = await verifyLiveTrackingForAllTools();
  const liveOk = liveChecks.every((row) => row.ok);

  const tools = ALL_TOOLS.map((tool) => {
    const creds = getCredentials(tool);
    return {
      tool,
      connected: Boolean(creds?.device_token),
      uid: creds?.uid || null,
      email: creds?.email || null,
      matches_primary: creds?.uid === targetUid
    };
  });

  if (!tools.every((row) => row.connected && row.matches_primary)) {
    console.error("[promptly] Warning: not all agents paired cleanly. Re-run fix-account with a fresh code.");
    process.exit(1);
  }

  if (!liveOk) {
    console.error(
      "[promptly] Pairing succeeded but live test uploads failed for some agents. Re-run fix-account after restarting Claude Code, Cursor, and Codex."
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        email: targetEmail,
        uid: targetUid,
        aligned_tools: aligned,
        consolidation,
        live_tracking: liveChecks,
        tools
      },
      null,
      2
    )
  );
  console.log(`Done. New prompts from all agents will track live to ${targetEmail}.`);
  console.log("Restart Claude Code, Cursor, and Codex if they were open during this fix.");
  console.log(`View stats: https://promptly-labs.com/account/statistics`);
}

function cmdStatus(flags) {
  const tool = normalizeTool(flags.tool);
  if (tool) {
    const creds = getCredentials(tool);
    if (!creds?.device_token) {
      console.log(JSON.stringify({ connected: false, tool }, null, 2));
      process.exit(1);
    }
    const lastFlush = readJson(join(promptlyStorageDir(), `last-flush-${tool}.json`), null);
    console.log(
      JSON.stringify(
        {
          connected: true,
          email: creds.email,
          uid: creds.uid,
          tool: creds.tool,
          api_url: creds.api_url || DEFAULT_API_URL,
          website_login_hint:
            "Statistics show events for this computer's Promptly account. Sign in on promptly-labs.com with the same email, or run: promptly-telemetry align-device",
          device_primary: readDevicePrimary(),
          last_flush: lastFlush,
          queue_depth: loadQueue(tool).length,
          recent_trace: (() => {
            const path = hookTracePath(tool);
            if (!existsSync(path)) return [];
            return readFileSync(path, "utf8")
              .trim()
              .split("\n")
              .slice(-3)
              .map((line) => {
                try {
                  return JSON.parse(line);
                } catch {
                  return { raw: line };
                }
              });
          })()
        },
        null,
        2
      )
    );
    return;
  }

  const summary = ALL_TOOLS.map((id) => {
    const creds = getCredentials(id);
    const primary = readDevicePrimary();
    return {
      tool: id,
      connected: Boolean(creds?.device_token),
      email: creds?.email || null,
      uid: creds?.uid || null,
      matches_device_primary: primary?.uid ? creds?.uid === primary.uid : null
    };
  });
  if (!summary.some((row) => row.connected)) {
    console.log("Not connected. Open https://promptly-labs.com/integrations to get a pairing code.");
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        device_primary: readDevicePrimary(),
        tools: summary
      },
      null,
      2
    )
  );
}

function cmdOpenLogin(flags) {
  const tool = normalizeTool(flags.tool) || "claude_code";
  const base = (flags["api-url"] || DEFAULT_API_URL).replace(/\/$/, "");
  console.log(`${base}/auth/integrations?tool=${tool}`);
}

function explainHookSample(input, tool) {
  if (!input) return { event: null, reason: "empty_input" };
  if (!hookPayloadMatchesTool(input, tool)) {
    return { event: null, reason: "payload_rejected_for_tool" };
  }
  const eventName = resolveHookEventName(input);
  const sessionId = primarySessionId(input, tool);
  if (isResponseEndPayload(input, eventName)) {
    const lookupIds = hookSessionLookupIds(input, tool);
    const pendingEntry = peekPendingSubmit(tool, input);
    if (!pendingEntry?.at && tool === "codex") {
      const agentAccountEmail = resolveAgentAccountEmail(input, tool);
      const modelMeta = buildModelMeta(input, tool);
      const recovered = recoverCodexTurnEventsFromStop(input, tool, agentAccountEmail, modelMeta);
      if (recovered?.send && recovered?.latency) {
        return {
          event: recovered.latency,
          recovered_send: recovered.send,
          reason: "codex_stop_transcript_recovery",
          event_name: eventName,
          session_id: sessionId || null,
          lookup_ids: lookupIds
        };
      }
    }
    if (!pendingEntry?.at) {
      return {
        event: null,
        reason: "response_end_without_pending_submit",
        event_name: eventName,
        session_id: sessionId || null,
        lookup_ids: lookupIds
      };
    }
    const agentAccountEmail = resolveAgentAccountEmail(input, tool);
    const modelMeta = buildModelMeta(input, tool);
    const latencyMs = Math.min(
      1_800_000,
      Math.max(RESPONSE_LATENCY_MIN_MS, Date.now() - pendingEntry.at)
    );
    return {
      event: {
        tool,
        interaction_kind: "response_latency",
        host_response_latency_ms: latencyMs,
        client_occurred_ms: Date.now(),
        agent_account_email: agentAccountEmail || pendingEntry.agent_account_email || null,
        model_label: modelMeta.model_label || pendingEntry.model_label || null,
        model_bucket: modelMeta.model_bucket || pendingEntry.model_bucket || "unknown"
      },
      reason: "response_end_with_pending",
      event_name: eventName,
      session_id: sessionId || null
    };
  }
  const event = hookEventToTelemetry(input, tool);
  if (event) {
    return { event, reason: "mapped", event_name: eventName, session_id: sessionId || null };
  }
  if (eventName.includes("sessionstart")) {
    return { event: null, reason: "session_start_lifecycle_only", event_name: eventName };
  }
  return { event: null, reason: "unclassified_or_below_threshold", event_name: eventName, session_id: sessionId || null };
}

function auditInstalledHooks(tool) {
  const paths = {
    cursor: [
      join(homedir(), ".cursor/plugins/local/promptly-cursor/hooks/hooks.json"),
      join(homedir(), "integrations/cursor/hooks/hooks.json")
    ],
    codex: [join(homedir(), "integrations/codex/hooks/hooks.json")],
    claude_code: [join(homedir(), "integrations/claude-code/hooks/hooks.json")]
  };
  if (tool === "codex") {
    const cacheRoot = join(homedir(), ".codex/plugins/cache/promptly-labs/promptly-codex");
    if (existsSync(cacheRoot)) {
      for (const entry of readdirSync(cacheRoot)) {
        const versionDir = join(cacheRoot, entry);
        for (const rel of ["hooks/hooks.json", "codex/hooks/hooks.json"]) {
          const filePath = join(versionDir, rel);
          if (existsSync(filePath)) paths.codex.push(filePath);
        }
      }
    }
  }
  const required = {
    cursor: ["beforeSubmitPrompt", "afterAgentResponse", "stop"],
    codex: ["UserPromptSubmit", "Stop", "SessionStart", "SessionEnd"],
    claude_code: ["UserPromptSubmit", "Stop", "SessionStart", "SessionEnd"]
  };
  const out = [];
  for (const filePath of paths[tool] || []) {
    if (!existsSync(filePath)) {
      out.push({ path: filePath, exists: false, ok: false });
      continue;
    }
    const raw = readFileSync(filePath, "utf8");
    const missing = (required[tool] || []).filter((key) => !raw.includes(`"${key}"`));
    const usesPluginRoot =
      tool === "cursor"
        ? raw.includes("CURSOR_PLUGIN_ROOT") || raw.includes("CLAUDE_PLUGIN_ROOT")
        : tool !== "codex" || raw.includes("PLUGIN_ROOT");
    const usesRelativeBin =
      (tool === "codex" || tool === "cursor") && /node \.\/bin\/promptly-telemetry/.test(raw);
    out.push({
      path: filePath,
      exists: true,
      ok: missing.length === 0 && usesPluginRoot && !usesRelativeBin,
      missing_hooks: missing,
      uses_plugin_root: usesPluginRoot,
      uses_relative_bin: usesRelativeBin
    });
  }
  return out;
}

function simulateHookFlow(tool) {
  const sessionId = `sim-${tool}-${Date.now()}`;
  const now = Date.now();
  const submitInput =
    tool === "codex"
      ? {
          hook_event_name: "UserPromptSubmit",
          session_id: sessionId,
          turn_id: "turn-1",
          prompt: "diagnostics simulate prompt",
          model: "gpt-5.5",
          effort: "xhigh"
        }
      : {
          hook_event_name: "beforeSubmitPrompt",
          conversation_id: sessionId,
          generation_id: `gen-${now}`,
          prompt: "diagnostics simulate prompt",
          model: "composer-2.5"
        };
  const responseInput =
    tool === "codex"
      ? {
          hook_event_name: "Stop",
          session_id: sessionId,
          model: "gpt-5.4",
          last_assistant_message: "done"
        }
      : {
          hook_event_name: "afterAgentResponse",
          conversation_id: sessionId,
          generation_id: `gen-${now}`,
          text: "done",
          model: "composer-2.5"
        };
  markSessionStarted(tool, sessionId);
  markDraftWindowStart(tool, sessionId, now - 5000);
  const send = hookEventToTelemetry(submitInput, tool);
  recordPendingSubmit(tool, submitInput, {
    agent_account_email: send?.agent_account_email || null,
    model_label: send?.model_label || null,
    model_bucket: send?.model_bucket || "unknown"
  });
  const draftMs = consumeDraftDurationMs(tool, sessionId);
  const response = emitResponseEndEvents(
    tool,
    responseInput,
    send?.agent_account_email || null,
    { model_label: send?.model_label || null, model_bucket: send?.model_bucket || "unknown" },
    now
  );
  return {
    session_id: sessionId,
    send,
    drafting_ms: draftMs,
    response: response.event,
    patched_send_latency: response.patched
  };
}

function cmdDiagnostics(flags) {
  const tool = normalizeTool(flags.tool) || "cursor";
  const sessionId = "promptly-diagnostics-session";
  const samples = [
    { label: "sessionStart", input: { hook_event_name: "sessionStart", session_id: sessionId } },
    {
      label: "beforeSubmitPrompt (cursor)",
      input: {
        hook_event_name: "beforeSubmitPrompt",
        conversation_id: sessionId,
        generation_id: "gen-diagnostics",
        prompt: "diagnostics hello",
        model: "composer-2.5"
      }
    },
    {
      label: "UserPromptSubmit (claude)",
      input: {
        hook_event_name: "UserPromptSubmit",
        session_id: sessionId,
        turn_id: "turn-claude-1",
        prompt: "diagnostics hello",
        model: "claude-sonnet-4-20250514"
      }
    },
    {
      label: "UserPromptSubmit (codex)",
      input: {
        hook_event_name: "UserPromptSubmit",
        session_id: sessionId,
        turn_id: "turn-1",
        prompt: "diagnostics hello",
        model: "gpt-5.5",
        effort: "xhigh"
      }
    },
    {
      label: "UserPromptSubmit (codex bare — no model in hook)",
      input: {
        hook_event_name: "UserPromptSubmit",
        session_id: sessionId,
        turn_id: "turn-bare",
        prompt: "diagnostics hello"
      }
    },
    {
      label: "afterAgentResponse (cursor)",
      input: {
        hook_event_name: "afterAgentResponse",
        conversation_id: sessionId,
        text: "done",
        model: "composer-2.5"
      }
    },
    {
      label: "Stop (codex)",
      input: {
        hook_event_name: "Stop",
        session_id: sessionId,
        model: "gpt-5.4",
        last_assistant_message: "done"
      }
    },
    {
      label: "stop (cursor success)",
      input: {
        hook_event_name: "stop",
        conversation_id: sessionId,
        status: "success",
        loop_count: 1,
        model: "composer-2.5"
      }
    },
    {
      label: "inferred afterAgentResponse (no hook_event_name)",
      input: { conversation_id: sessionId, text: "done", model: "composer-2.5" }
    },
    {
      label: "inferred codex Stop (no hook_event_name)",
      input: { session_id: sessionId, model: "gpt-5.4", last_assistant_message: "done" }
    }
  ];
  const pending = readJson(pendingSubmitsPath(tool), { pending: {} }).pending || {};
  const pendingEntries = Object.entries(pending);
  const output = {
    tool,
    hooks_audit: auditInstalledHooks(tool),
    hook_samples: samples.map((sample) => ({
      label: sample.label,
      ...explainHookSample(sample.input, tool)
    })),
    simulate: flags.simulate ? simulateHookFlow(tool) : undefined,
    local_state: {
      pending_count: pendingEntries.length,
      pending_orphans: pendingEntries.map(([key, value]) => ({
        key,
        age_s: value?.at ? Math.round((Date.now() - value.at) / 1000) : null,
        primary_id: value?.primary_id || null
      })),
      draft_timing: loadDraftTimingSessions(tool),
      queue_depth: loadQueue(tool).length,
      recent_trace: (() => {
        const path = hookTracePath(tool);
        if (!existsSync(path)) return [];
        return readFileSync(path, "utf8")
          .trim()
          .split("\n")
          .slice(-8)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return { raw: line };
            }
          });
      })()
    },
    notes: [
      "response_end_without_pending_submit means the assistant finished hook ran without a matching prompt submit — usually missing afterAgentResponse/Stop hooks or session id mismatch.",
      "pending_orphans that grow after each prompt mean response-end hooks are not firing; reinstall the plugin pack.",
      "Cursor stop/sessionEnd hooks run from the project root — hooks must use ${CURSOR_PLUGIN_ROOT}/bin/promptly-telemetry.mjs, not ./bin.",
      "Codex hooks must use ${PLUGIN_ROOT}/bin/promptly-telemetry.mjs — relative ./bin paths fail silently in Codex Desktop.",
      "After updating Codex hooks, quit and reopen Codex and re-trust the Promptly plugin hooks.",
      "Run with --simulate to exercise submit → draft → response on a fake session."
    ]
  };
  console.log(JSON.stringify(output, null, 2));
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

async function cmdLoginClaude(flags) {
  const callbackUrl = flags.callback || flags._rest?.[0] || null;
  const result = await runClaudeOAuthLoginOnly({ callbackUrl });
  if (!result.ok) {
    console.error("Claude login failed");
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

async function cmdUsageSync(flags) {
  const syncFlags = {
    force: flags.force === true || flags.force === "true",
    debug: flags.debug === true || flags.debug === "true",
    login_claude:
      flags.login_claude === true ||
      flags.login_claude === "true" ||
      flags["login-claude"] === true ||
      flags["login-claude"] === "true",
    force_claude_login:
      flags.force_claude_login === true ||
      flags.force_claude_login === "true" ||
      flags["force-claude-login"] === true ||
      flags["force-claude-login"] === "true",
    no_login:
      flags.no_login === true ||
      flags.no_login === "true" ||
      flags["no-login"] === true ||
      flags["no-login"] === "true"
  };
  const tool = normalizeTool(flags.tool);
  let creds = null;
  let clientHeader = null;
  if (tool) {
    creds = getCredentials(tool);
    clientHeader = flags.client || TOOL_CLIENT[tool];
    if (!creds?.device_token) {
      console.error(`Not connected for ${tool}. Run login --tool ${tool} first.`);
      process.exit(1);
    }
  } else {
    for (const candidate of ["claude_code", "codex", "cursor"]) {
      const row = getCredentials(candidate);
      if (row?.device_token) {
        creds = row;
        clientHeader = flags.client || TOOL_CLIENT[candidate];
        break;
      }
    }
    if (!creds?.device_token) {
      console.error("Not connected. Pair Claude Code or Codex at https://promptly-labs.com/integrations");
      process.exit(1);
    }
  }
  const result = await runVendorUsageSync({
    creds,
    clientHeader,
    flags: syncFlags
  });
  if (!result.ok) {
    console.error(result.error || "Usage sync failed");
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
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
    case "align-device":
      await cmdAlignDevice(flags);
      break;
    case "fix-account":
      await cmdFixAccount(flags);
      break;
    case "status":
      cmdStatus(flags);
      break;
    case "test-send":
      await cmdTestSend(flags);
      break;
    case "usage-sync":
      await cmdUsageSync(flags);
      break;
    case "login-claude":
      await cmdLoginClaude(flags);
      break;
    case "diagnostics":
      cmdDiagnostics(flags);
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
  fix-account <CODE>          One command: set this code's account as your only Promptly account, re-pair all agents, merge split stats
  login --tool <tool> <CODE>  Exchange pairing code for device token
  login --tool <tool> --from-sibling  Pair this agent to the same Promptly account as another agent on this computer
  align-device --set-primary <CODE>  Same as fix-account (legacy alias)
  test-send --tool <tool>     Upload one test prompt (verify stats pipeline)
  usage-sync [--login-claude] [--debug] [--no-login] [--tool <tool>]  Sync Claude, Codex, and Cursor subscription usage
  login-claude [--callback <url>]                  Browser sign-in for Claude subscription usage
  diagnostics [--tool <tool>] Simulate hook payloads and show local timing state
  status [--tool <tool>]      Show connection status for one or all tools
  open-login --tool <tool>    Print sign-in URL
  flush --tool <tool>         Flush queued events for one tool`);
  }
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
