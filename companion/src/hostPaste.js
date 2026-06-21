const { clipboard } = require("electron");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const ALLOWED_HOSTS = ["Claude", "Codex", "Cursor", "ChatGPT"];

/** Last host app the user typed in (tracked while another app is frontmost). */
let lastRememberedHost = null;

function isAllowedProcess(name) {
  const n = String(name || "").trim().toLowerCase();
  return ALLOWED_HOSTS.some((host) => host.toLowerCase() === n);
}

function rememberPasteHost(name) {
  const host = String(name || "").trim();
  if (!isAllowedProcess(host)) {
    return;
  }
  lastRememberedHost = host;
}

function escapeAppleScriptString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function isHostProcessRunning(processName) {
  if (process.platform !== "darwin") {
    return false;
  }
  const host = String(processName || "").trim();
  if (!host) {
    return false;
  }
  const safe = escapeAppleScriptString(host);
  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", [
      "-e",
      `tell application "System Events" to return (exists process "${safe}")`
    ]);
    return String(stdout || "").trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

function uniqueHostCandidates(names) {
  const seen = new Set();
  const out = [];
  for (const name of names) {
    const host = String(name || "").trim();
    if (!isAllowedProcess(host)) {
      continue;
    }
    const key = host.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(host);
  }
  return out;
}

/**
 * Pick the best host to paste into: window anchor → current frontmost host →
 * last app the user typed in → any running supported host.
 */
async function resolvePasteHostName({ anchorProcessNames = [], getFrontmostProcessName }) {
  if (process.platform !== "darwin") {
    return null;
  }

  const front = typeof getFrontmostProcessName === "function" ? await getFrontmostProcessName() : null;
  if (isAllowedProcess(front)) {
    rememberPasteHost(front);
  }

  const candidates = uniqueHostCandidates([
    ...(Array.isArray(anchorProcessNames) ? anchorProcessNames : []),
    front,
    lastRememberedHost,
    ...ALLOWED_HOSTS
  ]);

  for (const name of candidates) {
    if (await isHostProcessRunning(name)) {
      rememberPasteHost(name);
      return name;
    }
  }

  return null;
}

function buildPasteScript(processName) {
  const safeProcess = escapeAppleScriptString(processName);

  // System Events only — skip "tell application X to activate" (adds ~1–2s).
  return `tell application "System Events"
  if not (exists process "${safeProcess}") then return "missing_process"
  tell process "${safeProcess}"
    set frontmost to true
    keystroke "a" using command down
    keystroke "v" using command down
  end tell
end tell
return "ok"`;
}

function mapPasteError(raw) {
  const text = String(raw || "").trim();
  if (text.includes("-25211") || text.toLowerCase().includes("assistive access")) {
    return "Enable Accessibility for Promptly Companion in System Settings → Privacy & Security → Accessibility.";
  }
  if (text.includes("-2741")) {
    return "Paste automation failed (AppleScript error). Click into the host app prompt box and paste manually.";
  }
  if (text === "missing_process") {
    return "That app is not running anymore. Open Claude, Codex, ChatGPT, or Cursor and try again.";
  }
  return text || "Paste failed";
}

async function pasteToHostProcess(processName, text) {
  if (process.platform !== "darwin") {
    return { ok: false, error: "Paste into other apps is only supported on macOS." };
  }

  const host = String(processName || "").trim();
  if (!isAllowedProcess(host)) {
    return {
      ok: false,
      error: "Could not find Claude, Codex, ChatGPT, or Cursor. Click into the app you want to paste into, then try again."
    };
  }

  const content = String(text || "");
  if (!content.trim()) {
    return { ok: false, error: "Write a prompt before pasting." };
  }

  clipboard.writeText(content);

  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", buildPasteScript(host)]);
    const method = String(stdout || "").trim();
    if (!method || method === "missing_process" || method.startsWith("error:")) {
      return { ok: false, error: mapPasteError(method), method: null };
    }
    rememberPasteHost(host);
    return { ok: true, method, host };
  } catch (err) {
    const stderr = String(err.stderr || err.message || err);
    return { ok: false, error: mapPasteError(stderr), method: null };
  }
}

module.exports = {
  ALLOWED_HOSTS,
  isAllowedProcess,
  rememberPasteHost,
  resolvePasteHostName,
  pasteToHostProcess
};
