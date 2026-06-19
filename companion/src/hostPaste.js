const { clipboard } = require("electron");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const ALLOWED_HOSTS = ["Claude", "Codex", "Cursor", "ChatGPT"];

function isAllowedProcess(name) {
  const n = String(name || "").trim().toLowerCase();
  return ALLOWED_HOSTS.some((host) => host.toLowerCase() === n);
}

function escapeAppleScriptString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
    return "Paste automation failed (AppleScript error). Try focusing the host app prompt box and paste manually.";
  }
  if (text === "missing_process") {
    return "Target app is not running. Open Claude, Codex, ChatGPT, or Cursor first.";
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
      error: "No supported host app. Open Claude, Codex, ChatGPT, or Cursor beside Companion."
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
    return { ok: true, method, host };
  } catch (err) {
    const stderr = String(err.stderr || err.message || err);
    return { ok: false, error: mapPasteError(stderr), method: null };
  }
}

module.exports = {
  ALLOWED_HOSTS,
  isAllowedProcess,
  pasteToHostProcess
};
