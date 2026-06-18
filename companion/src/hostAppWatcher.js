const { screen } = require("electron");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { shouldAutoOpenTool } = require("./companionSettings");

const execFileAsync = promisify(execFile);

const WATCH_MS = 2000;
const WINDOW_MARGIN = 14;
const HOST_FOCUS_MS = 90;
const SPACE_PIN_MS = 40;

/**
 * Host apps we can dock beside. Claude Code and Codex run as GUI processes named "Claude" / "Codex" on macOS.
 */
const HOST_TARGETS = [
  {
    tool: "claude_code",
    processNames: ["Claude"]
  },
  {
    tool: "codex",
    processNames: ["Codex"]
  },
  {
    tool: "cursor",
    processNames: ["Cursor"]
  }
];

/** @type {import('electron').BrowserWindow | null} */
let dockedWindow = null;
/** @type {string | null} */
let dockedTool = null;
/** @type {string | null} */
let dockedProcessName = null;
/** @type {number | null} */
let dockedDisplayId = null;
/** @type {string | null} */
let lastFrontTool = null;
let dismissed = false;
let watchTimer = null;
let tickInFlight = false;
let accessibilityPrompted = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFrontmostProcessName() {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", [
      "-e",
      'tell application "System Events" to get name of first application process whose frontmost is true'
    ]);
    return String(stdout || "").trim() || null;
  } catch {
    return null;
  }
}

async function focusHostProcess(processName) {
  if (process.platform !== "darwin" || !processName) {
    return;
  }
  const safe = String(processName).replace(/"/g, '\\"');
  try {
    await execFileAsync("/usr/bin/osascript", [
      "-e",
      `tell application "System Events"
        if exists process "${safe}" then
          set frontmost of process "${safe}" to true
        end if
      end tell`
    ]);
  } catch {
    /* continue */
  }
  try {
    await execFileAsync("/usr/bin/osascript", ["-e", `tell application "${safe}" to activate`]);
  } catch {
    /* process name may differ from app name */
  }
}

async function getProcessWindowBounds(processName) {
  if (process.platform !== "darwin" || !processName) {
    return null;
  }
  const safe = String(processName).replace(/"/g, '\\"');
  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", [
      "-e",
      `tell application "System Events"
        if not (exists process "${safe}") then return ""
        tell process "${safe}"
          if (count of windows) is 0 then return ""
          set win to front window
          set p to position of win
          set s to size of win
          return (item 1 of p as text) & "," & (item 2 of p as text) & "," & (item 1 of s as text) & "," & (item 2 of s as text)
        end tell
      end tell`
    ]);
    const parts = String(stdout || "").trim().split(",").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return null;
    }
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  } catch {
    return null;
  }
}

function computeDockedBounds(hostBounds, win) {
  if (!hostBounds || !win || win.isDestroyed()) {
    return null;
  }
  const [width, height] = win.getSize();
  const anchorX = hostBounds.x + hostBounds.width / 2;
  const anchorY = hostBounds.y + hostBounds.height / 2;
  const display = screen.getDisplayNearestPoint({ x: anchorX, y: anchorY });
  const area = display.workArea;
  let x = Math.round(hostBounds.x + hostBounds.width - width - WINDOW_MARGIN);
  let y = Math.round(hostBounds.y + WINDOW_MARGIN);
  x = Math.max(area.x, Math.min(x, area.x + area.width - width));
  y = Math.max(area.y, Math.min(y, area.y + area.height - height));
  return { x, y, width, height, displayId: display.id };
}

async function pinWindowToActiveSpace(win) {
  if (!win || win.isDestroyed() || process.platform !== "darwin") {
    return;
  }
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  await sleep(SPACE_PIN_MS);
  win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
}

async function positionDockedWindowInitially(win, processName, setCompanionOnTop) {
  if (!win || win.isDestroyed() || !processName) {
    return;
  }

  await focusHostProcess(processName);
  await sleep(HOST_FOCUS_MS);

  const hostBounds = await getProcessWindowBounds(processName);
  const dockedBounds = computeDockedBounds(hostBounds, win);
  if (!dockedBounds) {
    return;
  }

  await pinWindowToActiveSpace(win);
  dockedDisplayId = dockedBounds.displayId;

  win.setBounds({
    x: dockedBounds.x,
    y: dockedBounds.y,
    width: dockedBounds.width,
    height: dockedBounds.height
  });

  if (!win.isVisible()) {
    win.show();
  }

  setCompanionOnTop(win, true);
  win.moveTop();
}

function maintainDockedWindow(win, setCompanionOnTop) {
  if (!win || win.isDestroyed()) {
    return;
  }
  if (!win.isVisible()) {
    win.show();
  }
  setCompanionOnTop(win, true);
}

function matchTargetForProcessName(name, settings) {
  const n = String(name || "").trim();
  if (!n) return null;
  for (const target of HOST_TARGETS) {
    if (!shouldAutoOpenTool(target.tool, settings)) {
      continue;
    }
    if (target.processNames.some((p) => p.toLowerCase() === n.toLowerCase())) {
      return target;
    }
  }
  return null;
}

function isDockedWindow(win) {
  return Boolean(dockedWindow && win === dockedWindow && !dockedWindow.isDestroyed());
}

function notifyDockedWindowClosed(win) {
  if (!isDockedWindow(win)) {
    return;
  }
  dismissed = true;
  dockedWindow = null;
  dockedTool = null;
  dockedProcessName = null;
  dockedDisplayId = null;
}

function updateDockedAnchor(win, target, processName) {
  dockedTool = target.tool;
  dockedProcessName = processName;
  if (typeof win.__promptlySetAnchor === "function") {
    win.__promptlySetAnchor({
      anchorTool: target.tool,
      anchorProcessNames: target.processNames
    });
  }
}

async function waitForCompanionReady(win) {
  if (!win || win.isDestroyed()) {
    return;
  }
  if (typeof win.__promptlyWaitUntilReady === "function") {
    await win.__promptlyWaitUntilReady();
  }
}

function startHostAppWatcher({ settings, createCompanionWindow, setCompanionOnTop, systemPreferences }) {
  if (process.platform !== "darwin") {
    return;
  }

  const tick = async () => {
    if (tickInFlight) {
      return;
    }
    tickInFlight = true;
    try {
      if (
        systemPreferences &&
        !accessibilityPrompted &&
        typeof systemPreferences.isTrustedAccessibilityClient === "function"
      ) {
        accessibilityPrompted = true;
        if (!systemPreferences.isTrustedAccessibilityClient(false)) {
          systemPreferences.isTrustedAccessibilityClient(true);
        }
      }

      const frontProcess = await getFrontmostProcessName();
      const frontTarget = matchTargetForProcessName(frontProcess, settings);

      if (!frontTarget) {
        if (lastFrontTool) {
          dismissed = false;
        }
        lastFrontTool = null;
        return;
      }

      const hostChanged = frontTarget.tool !== lastFrontTool;
      if (hostChanged) {
        dismissed = false;
        lastFrontTool = frontTarget.tool;
      }

      if (dismissed) {
        return;
      }

      const creating = !dockedWindow || dockedWindow.isDestroyed();
      if (creating) {
        dockedWindow = createCompanionWindow({
          anchorTool: frontTarget.tool,
          anchorProcessNames: frontTarget.processNames,
          deferShow: true
        });
        dockedTool = frontTarget.tool;
        dockedProcessName = frontProcess;
        await waitForCompanionReady(dockedWindow);
        await positionDockedWindowInitially(dockedWindow, frontProcess, setCompanionOnTop);
        return;
      }

      if (dockedTool !== frontTarget.tool) {
        updateDockedAnchor(dockedWindow, frontTarget, frontProcess);
        await positionDockedWindowInitially(dockedWindow, frontProcess, setCompanionOnTop);
        return;
      }

      dockedProcessName = frontProcess;
      maintainDockedWindow(dockedWindow, setCompanionOnTop);
    } finally {
      tickInFlight = false;
    }
  };

  stopHostAppWatcher();
  void tick();
  watchTimer = setInterval(() => {
    void tick();
  }, WATCH_MS);
}

function stopHostAppWatcher() {
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
}

module.exports = {
  HOST_TARGETS,
  startHostAppWatcher,
  stopHostAppWatcher,
  notifyDockedWindowClosed,
  isDockedWindow,
  positionDockedWindowInitially,
  getProcessWindowBounds
};
