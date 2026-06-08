#!/usr/bin/env node
/**
 * Promptly MCP server — account pairing, status, and /promptly improve prompt.
 */
import { createInterface } from "readline";
import { homedir } from "os";
import { join } from "path";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";

const DEFAULT_API = process.env.PROMPTLY_API_URL || "https://promptly-labs.com";
const DEFAULT_TOOL = process.env.PROMPTLY_TOOL || "claude_code";
const OPTIMIZE_TIMEOUT_MS = 45000;

const TOOL_CLIENT = {
  claude_code: "promptly-claude-code",
  cursor: "promptly-cursor",
  codex: "promptly-codex"
};

function normalizeTool(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (v === "claude_code" || v === "cursor" || v === "codex") return v;
  return null;
}

function inferToolFromPathSegment(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("promptly-cursor") || lower.includes("/cursor/") || lower.includes("\\cursor\\")) {
    return "cursor";
  }
  if (lower.includes("promptly-codex") || lower.includes("/codex/") || lower.includes("\\codex\\")) {
    return "codex";
  }
  if (
    lower.includes("promptly-claude") ||
    lower.includes("claude-code") ||
    lower.includes("claude_code")
  ) {
    return "claude_code";
  }
  return null;
}

function resolveTool() {
  const fromEnv = normalizeTool(process.env.PROMPTLY_TOOL);
  if (fromEnv) return fromEnv;

  for (const root of [
    process.env.PROMPTLY_PLUGIN_ROOT,
    process.env.CLAUDE_PLUGIN_ROOT,
    process.env.PLUGIN_ROOT
  ]) {
    const inferred = inferToolFromPathSegment(root);
    if (inferred) return inferred;
  }

  try {
    const inferred = inferToolFromPathSegment(fileURLToPath(import.meta.url));
    if (inferred) return inferred;
  } catch {
    /* ignore */
  }

  return normalizeTool(DEFAULT_TOOL) || "claude_code";
}

function credsPath(tool) {
  return join(homedir(), ".promptly", `credentials-${tool}.json`);
}

function readCreds(tool = resolveTool()) {
  try {
    return JSON.parse(readFileSync(credsPath(tool), "utf8"));
  } catch {
    return null;
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function toolResult(text, isError = false) {
  return {
    content: [{ type: "text", text: String(text) }],
    isError
  };
}

function promptTextMessage(text) {
  return {
    description: "Promptly improved prompt",
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: String(text)
        }
      }
    ]
  };
}

const tools = [
  {
    name: "promptly_connect",
    description: "Get the Promptly sign-in URL to connect your account for IDE telemetry",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          enum: ["claude_code", "cursor", "codex"],
          description: "Which coding agent you are using"
        }
      },
      required: ["tool"]
    }
  },
  {
    name: "promptly_login",
    description: "Exchange an 8-character pairing code from the Promptly website for a device token",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "8-character pairing code" },
        tool: { type: "string", enum: ["claude_code", "cursor", "codex"] }
      },
      required: ["code", "tool"]
    }
  },
  {
    name: "promptly_status",
    description: "Check whether Promptly IDE telemetry is connected for this machine",
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string", enum: ["claude_code", "cursor", "codex"] }
      }
    }
  }
];

const prompts = [
  {
    name: "promptly",
    description: "Improve a draft prompt with Promptly before sending it to the agent (rewrite mode only)",
    arguments: [
      {
        name: "prompt",
        description: "Your draft prompt to rewrite and improve",
        required: true
      }
    ]
  }
];

function apiBaseUrl(creds) {
  const fromEnv = String(process.env.PROMPTLY_API_URL || "").trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return String(creds?.api_url || DEFAULT_API).replace(/\/$/, "");
}

async function optimizePromptViaApi(draft, tool) {
  const creds = readCreds(tool);
  if (!creds?.device_token) {
    const base = apiBaseUrl(null);
    throw new Error(
      `Not connected to Promptly for ${tool}. Open ${base}/auth/integrations?tool=${tool}, sign in, copy the pairing code, then run:\nnode integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs login <CODE> --tool ${tool}`
    );
  }
  const credTool = normalizeTool(creds.tool);
  if (credTool && credTool !== tool) {
    throw new Error(
      `Credentials file for ${tool} is paired as ${credTool}. Generate a new code for ${tool} on promptly-labs.com and run login again with --tool ${tool}.`
    );
  }
  const apiUrl = apiBaseUrl(creds);
  const clientHeader = TOOL_CLIENT[tool] || TOOL_CLIENT.claude_code;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPTIMIZE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${apiUrl}/api/optimize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.device_token}`,
        "x-promptly-client": clientHeader,
        "x-promptly-live-config": "1"
      },
      body: JSON.stringify({
        prompt: draft,
        user_instruction: "",
        optimize_mode: "improve"
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Promptly improve timed out — try again with a shorter draft.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body.error || `Promptly improve failed (${response.status})`));
  }
  const optimized = String(body.optimized_prompt || "").trim();
  if (!optimized) {
    throw new Error("Promptly returned an empty improved prompt.");
  }
  return optimized;
}

async function handlePromptGet(name, args) {
  if (name !== "promptly") {
    throw new Error(`Unknown prompt: ${name}`);
  }
  const draft = String(args?.prompt || "").trim();
  if (!draft) {
    return promptTextMessage(
      "Provide your draft prompt as the `prompt` argument when invoking /promptly.\n\nExample: /promptly refactor the auth module to use OAuth2 with refresh tokens"
    );
  }
  const tool = resolveTool();
  const optimized = await optimizePromptViaApi(draft, tool);
  return promptTextMessage(optimized);
}

async function handleToolCall(name, args) {
  if (name === "promptly_connect") {
    const tool = normalizeTool(args?.tool) || resolveTool();
    return toolResult(
      `Open this URL in your browser, sign in, and copy the pairing code:\n${DEFAULT_API.replace(/\/$/, "")}/auth/integrations?tool=${tool}\n\nThen run: promptly-telemetry login <CODE> --tool ${tool}`
    );
  }
  if (name === "promptly_login") {
    const code = String(args?.code || "").trim();
    const tool = normalizeTool(args?.tool) || resolveTool();
    if (!code || !tool) {
      return toolResult("code and tool are required", true);
    }
    const { spawnSync } = await import("child_process");
    const script = join(process.env.CLAUDE_PLUGIN_ROOT || process.env.PLUGIN_ROOT || ".", "bin", "promptly-telemetry.mjs");
    const nodeScript = existsSync(script)
      ? script
      : join(homedir(), ".promptly", "promptly-telemetry.mjs");
    const bin = existsSync(script) ? "node" : "npx";
    const argsList = existsSync(script)
      ? [script, "login", code, "--tool", tool]
      : ["-y", "@promptly/telemetry-cli", "login", code, "--tool", tool];
    const r = spawnSync(bin, argsList, { encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || "");
    return toolResult(out.trim() || (r.status === 0 ? "Connected." : "Login failed"), r.status !== 0);
  }
  if (name === "promptly_status") {
    const tool = normalizeTool(args?.tool) || resolveTool();
    const c = readCreds(tool);
    if (!c?.device_token) {
      return toolResult(`Not connected for ${tool}. Use promptly_connect first.`);
    }
    return toolResult(`Connected as ${c.email || c.uid} (${c.tool || tool})`);
  }
  return toolResult(`Unknown tool: ${name}`, true);
}

const rl = createInterface({ input: process.stdin, terminal: false });
let buffer = "";

rl.on("line", async (line) => {
  buffer = line;
  let msg;
  try {
    msg = JSON.parse(buffer);
  } catch {
    return;
  }
  const { id, method, params } = msg;

  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: "promptly-mcp", version: "1.2.0" }
      }
    });
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools } });
    return;
  }

  if (method === "tools/call") {
    const result = await handleToolCall(params?.name, params?.arguments || {});
    send({ jsonrpc: "2.0", id, result });
    return;
  }

  if (method === "prompts/list") {
    send({ jsonrpc: "2.0", id, result: { prompts } });
    return;
  }

  if (method === "prompts/get") {
    try {
      const result = await handlePromptGet(params?.name, params?.arguments || {});
      send({ jsonrpc: "2.0", id, result });
    } catch (error) {
      const message = String(error?.message || error);
      send({
        jsonrpc: "2.0",
        id,
        result: promptTextMessage(message)
      });
    }
    return;
  }

  if (id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  }
});
