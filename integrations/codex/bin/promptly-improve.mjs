#!/usr/bin/env node
/**
 * Promptly improve CLI — stdout is the improved prompt (improve mode only).
 */
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";

const DEFAULT_API = process.env.PROMPTLY_API_URL || "https://promptly-labs.com";
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

function resolveTool(explicit) {
  const fromFlag = normalizeTool(explicit);
  if (fromFlag) return fromFlag;

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

  return "claude_code";
}

function credsPath(tool) {
  return join(homedir(), ".promptly", `credentials-${tool}.json`);
}

function readCreds(tool) {
  try {
    return JSON.parse(readFileSync(credsPath(tool), "utf8"));
  } catch {
    return null;
  }
}

function apiBaseUrl(creds) {
  const fromEnv = String(process.env.PROMPTLY_API_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return String(creds?.api_url || DEFAULT_API).replace(/\/$/, "");
}

function parseArgs(argv) {
  const args = [...argv];
  let tool = null;
  const draftParts = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--tool" && args[i + 1]) {
      tool = args[++i];
      continue;
    }
    if (arg === "--api-url" && args[i + 1]) {
      process.env.PROMPTLY_API_URL = args[++i];
      continue;
    }
    draftParts.push(arg);
  }
  return { tool: resolveTool(tool), draft: draftParts.join(" ").trim() };
}

async function improvePrompt(draft, tool) {
  const creds = readCreds(tool);
  if (!creds?.device_token) {
    throw new Error(
      `Not connected for ${tool}. Pair at ${apiBaseUrl(null)}/auth/integrations?tool=${tool}`
    );
  }
  const credTool = normalizeTool(creds.tool);
  if (credTool && credTool !== tool) {
    throw new Error(`Credentials for ${tool} are paired as ${credTool}. Re-pair with --tool ${tool}.`);
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
      throw new Error("Promptly improve timed out — try a shorter draft.");
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

async function main() {
  const { tool, draft } = parseArgs(process.argv.slice(2));
  if (!draft) {
    console.error("Usage: promptly-improve [--tool claude_code|cursor|codex] \"your draft prompt\"");
    process.exit(1);
  }
  try {
    const improved = await improvePrompt(draft, tool);
    process.stdout.write(improved);
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(1);
  }
}

main();
