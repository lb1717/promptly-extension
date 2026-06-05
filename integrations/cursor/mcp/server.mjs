#!/usr/bin/env node
/**
 * Minimal Promptly MCP server — connect account and check status.
 */
import { createInterface } from "readline";
import { homedir } from "os";
import { join } from "path";
import { readFileSync, existsSync } from "fs";

const DEFAULT_API = process.env.PROMPTLY_API_URL || "https://promptly-labs.com";

const DEFAULT_TOOL = "cursor";

function credsPath(tool = DEFAULT_TOOL) {
  return join(homedir(), ".promptly", `credentials-${tool}.json`);
}

function readCreds(tool = DEFAULT_TOOL) {
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
    inputSchema: { type: "object", properties: {} }
  }
];

async function handleToolCall(name, args) {
  if (name === "promptly_connect") {
    const tool = args?.tool || "claude_code";
    return toolResult(
      `Open this URL in your browser, sign in, and copy the pairing code:\n${DEFAULT_API.replace(/\/$/, "")}/auth/integrations?tool=${tool}\n\nThen run: promptly-telemetry login <CODE> --tool ${tool}`
    );
  }
  if (name === "promptly_login") {
    const code = String(args?.code || "").trim();
    const tool = String(args?.tool || "").trim();
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
    const c = readCreds();
    if (!c?.device_token) {
      return toolResult("Not connected. Use promptly_connect first.");
    }
    return toolResult(`Connected as ${c.email || c.uid} (${c.tool})`);
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
        capabilities: { tools: {} },
        serverInfo: { name: "promptly-mcp", version: "1.0.0" }
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

  if (id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  }
});
