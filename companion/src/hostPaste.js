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

function buildPasteScript(processName, tmpPath) {
  const safeProcess = String(processName).replace(/"/g, '\\"');
  const safePath = String(tmpPath).replace(/"/g, '\\"');

  return `
set pasteText to read POSIX file "${safePath}" as «class utf8»

on findBestInput(uiElement)
  set bestElement to missing value
  set bestY to -1
  try
    repeat with e in UI elements of uiElement
      try
        set elementRole to role of e
        if elementRole is "AXTextArea" or elementRole is "AXTextField" then
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
  return bestElement
end findBestInput

set pasteResult to "failed"

try
  tell application "System Events"
    if not (exists process "${safeProcess}") then
      return "missing_process"
    end if
    tell process "${safeProcess}"
      set frontmost to true
      delay 0.25
      if (count of windows) is 0 then
        return "no_window"
      end if
      set targetField to my findBestInput(front window)
      if targetField is not missing value then
        set focused of targetField to true
        delay 0.08
        try
          set value of targetField to pasteText
          set pasteResult to "set_value"
        on error
          set pasteResult to "set_value_error"
        end try
      end if
    end tell
  end tell
on error errMsg number errNum
  return "error:" & errNum
end try

if pasteResult is not "set_value" then
  set the clipboard to pasteText
  tell application "System Events"
    tell process "${safeProcess}"
      set frontmost to true
      delay 0.12
      keystroke "a" using command down
      delay 0.05
      keystroke "v" using command down
    end tell
  end tell
  set pasteResult to "clipboard_paste"
end if

return pasteResult
`;
}

function mapPasteError(raw) {
  const text = String(raw || "").trim();
  if (text.includes("-25211") || text.toLowerCase().includes("assistive access")) {
    return "Enable Accessibility for Promptly Companion in System Settings → Privacy & Security → Accessibility.";
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

  const tmpPath = join(tmpdir(), `promptly-paste-${process.pid}-${Date.now()}.txt`);
  writeFileSync(tmpPath, content, "utf8");

  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", buildPasteScript(host, tmpPath)]);
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
      unlinkSync(tmpPath);
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
