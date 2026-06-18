const { clipboard } = require("electron");
const { execFile } = require("child_process");
const { writeFileSync, unlinkSync } = require("fs");
const { tmpdir } = require("os");
const { join } = require("path");
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

  return `tell application "System Events"
  if not (exists process "${safeProcess}") then
    return "missing_process"
  end if
  tell process "${safeProcess}"
    set frontmost to true
    delay 0.25
    if (count of windows) is 0 then
      return "no_window"
    end if
    set clipText to (the clipboard as text)
    set targetField to my findBestInput(front window)
    if targetField is not missing value then
      set focused of targetField to true
      delay 0.08
      try
        set value of targetField to clipText
        return "set_value"
      end try
    end if
    set frontmost to true
    delay 0.12
    keystroke "a" using command down
    delay 0.05
    keystroke "v" using command down
    return "clipboard_paste"
  end tell
end tell

on findBestInput(parentElement)
  set bestElement to missing value
  set bestY to -1
  tell application "System Events"
    try
      repeat with e in UI elements of parentElement
        try
          set elementRole to role of e
          if elementRole is "AXTextArea" then
            set elementPos to position of e
            set elementY to item 2 of elementPos
            if elementY > bestY then
              set bestY to elementY
              set bestElement to e
            end if
          else if elementRole is "AXTextField" then
            set elementPos to position of e
            set elementY to item 2 of elementPos
            if elementY > bestY then
              set bestY to elementY
              set bestElement to e
            end if
          end if
        end try
        try
          set deeperElement to my findBestInput(e)
          if deeperElement is not missing value then
            set deeperPos to position of deeperElement
            set deeperY to item 2 of deeperPos
            if deeperY > bestY then
              set bestY to deeperY
              set bestElement to deeperElement
            end if
          end if
        end try
      end repeat
    end try
  end tell
  return bestElement
end findBestInput
`;
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
  if (text === "no_window") {
    return "Could not find a window in the target app.";
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
  const scriptPath = join(tmpdir(), `promptly-paste-${process.pid}-${Date.now()}.applescript`);

  try {
    writeFileSync(scriptPath, buildPasteScript(host), "utf8");
    const { stdout } = await execFileAsync("/usr/bin/osascript", [scriptPath]);
    const method = String(stdout || "").trim();
    if (!method || method.startsWith("error:") || method === "missing_process" || method === "no_window") {
      return { ok: false, error: mapPasteError(method), method: null };
    }
    return { ok: true, method, host };
  } catch (err) {
    const stderr = String(err.stderr || err.message || err);
    return { ok: false, error: mapPasteError(stderr), method: null };
  } finally {
    try {
      unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  ALLOWED_HOSTS,
  isAllowedProcess,
  pasteToHostProcess
};
