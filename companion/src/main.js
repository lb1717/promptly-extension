const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { execFile } = require("child_process");
const { readFileSync, existsSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const ANCHOR_POLL_MS = 900;
const PRODUCTION_API_URL = "https://promptly-labs.com";

/** @type {Set<BrowserWindow>} */
const companionWindows = new Set();

/** @type {WeakMap<BrowserWindow, { anchorAppBundleId: string | null; pollTimer: ReturnType<typeof setInterval> | null; onTop: boolean | null }>} */
const windowLayerState = new WeakMap();

function normalizeApiUrl(url) {
  return String(url || "").replace(/\/$/, "");
}

function readDefaultCreds() {
  const isDevMode = process.env.PROMPTLY_DEV === "1";
  const devApiUrl = isDevMode ? normalizeApiUrl(process.env.PROMPTLY_API_URL || "") : "";
  for (const tool of ["cursor", "claude_code", "codex"]) {
    const path = join(homedir(), ".promptly", `credentials-${tool}.json`);
    if (!existsSync(path)) continue;
    try {
      const creds = JSON.parse(readFileSync(path, "utf8"));
      if (creds?.device_token) {
        const credsApiUrl = normalizeApiUrl(creds.api_url || PRODUCTION_API_URL);
        return {
          apiUrl: devApiUrl || credsApiUrl || PRODUCTION_API_URL,
          productionApiUrl: PRODUCTION_API_URL,
          isDevMode,
          devApiUrl: devApiUrl || null,
          token: String(creds.device_token),
          client: `promptly-${tool.replace(/_/g, "-")}`
        };
      }
    } catch {
      /* try next */
    }
  }
  return {
    apiUrl: devApiUrl || PRODUCTION_API_URL,
    productionApiUrl: PRODUCTION_API_URL,
    isDevMode,
    devApiUrl: devApiUrl || null,
    token: String(process.env.PROMPTLY_DEVICE_TOKEN || process.env.PROMPTLY_AUTH_TOKEN || ""),
    client: "promptly-cursor"
  };
}

async function getFrontmostAppBundleId() {
  if (process.platform !== "darwin") {
    return null;
  }
  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", [
      "-e",
      'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'
    ]);
    return String(stdout || "").trim() || null;
  } catch {
    return null;
  }
}

function isCompanionAppBundle(bundleId) {
  const id = String(bundleId || "").toLowerCase();
  if (!id) {
    return false;
  }
  return id.includes("electron") || id.includes("promptly") || id === app.name?.toLowerCase();
}

function resolveAppIconPath() {
  const candidates = [
    join(__dirname, "..", "build", "icon.png"),
    join(__dirname, "renderer", "assets", "promptly-logo.png")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getLayerState(win) {
  let state = windowLayerState.get(win);
  if (!state) {
    state = { anchorAppBundleId: null, pollTimer: null, onTop: null };
    windowLayerState.set(win, state);
  }
  return state;
}

function configureMacWindowLayer(win, onTop) {
  // Stay on this Space, but allow floating above fullscreen apps (e.g. fullscreen Cursor).
  win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
  if (onTop) {
    win.setAlwaysOnTop(true, "screen-saver");
  } else {
    win.setAlwaysOnTop(false, "normal");
  }
}

function setCompanionOnTop(win, onTop) {
  if (!win || win.isDestroyed()) {
    return;
  }
  const state = getLayerState(win);
  if (state.onTop === onTop) {
    return;
  }
  state.onTop = onTop;
  if (onTop) {
    if (process.platform === "darwin") {
      configureMacWindowLayer(win, true);
    } else if (process.platform === "win32") {
      win.setAlwaysOnTop(true, "screen-saver");
    } else {
      win.setAlwaysOnTop(true);
    }
    win.moveTop();
  } else {
    if (process.platform === "darwin") {
      configureMacWindowLayer(win, false);
    } else if (process.platform === "win32") {
      win.setAlwaysOnTop(false, "normal");
    } else {
      win.setAlwaysOnTop(false);
    }
  }
}

function stopAnchorWatch(win) {
  const state = getLayerState(win);
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function startAnchorWatch(win, anchorAppBundleId) {
  stopAnchorWatch(win);
  if (!anchorAppBundleId || process.platform !== "darwin") {
    return;
  }
  const state = getLayerState(win);
  state.anchorAppBundleId = anchorAppBundleId;
  state.pollTimer = setInterval(() => {
    void (async () => {
      if (!win || win.isDestroyed() || win.isFocused()) {
        stopAnchorWatch(win);
        return;
      }
      const frontBundle = await getFrontmostAppBundleId();
      if (!frontBundle) {
        return;
      }
      if (isCompanionAppBundle(frontBundle)) {
        stopAnchorWatch(win);
        setCompanionOnTop(win, true);
        return;
      }
      if (frontBundle === state.anchorAppBundleId) {
        stopAnchorWatch(win);
        setCompanionOnTop(win, true);
      }
    })();
  }, ANCHOR_POLL_MS);
}

function handleCompanionBlur(win) {
  void (async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (!win || win.isDestroyed() || win.isFocused()) {
      return;
    }
    const frontBundle = await getFrontmostAppBundleId();
    if (!frontBundle || isCompanionAppBundle(frontBundle)) {
      return;
    }
    setCompanionOnTop(win, false);
    startAnchorWatch(win, frontBundle);
  })();
}

function registerCompanionWindow(win) {
  companionWindows.add(win);
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
  }

  win.once("ready-to-show", () => {
    setCompanionOnTop(win, true);
    win.show();
  });

  win.on("focus", () => {
    stopAnchorWatch(win);
    setCompanionOnTop(win, true);
  });

  win.on("blur", () => {
    handleCompanionBlur(win);
  });

  win.on("closed", () => {
    stopAnchorWatch(win);
    companionWindows.delete(win);
    windowLayerState.delete(win);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadFile(join(__dirname, "renderer", "index.html"));
}

function createCompanionWindow() {
  const iconPath = resolveAppIconPath();
  const win = new BrowserWindow({
    width: 380,
    height: 680,
    minWidth: 320,
    minHeight: 480,
    show: false,
    title: "Promptly Companion",
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: "#f4f5f7",
    autoHideMenuBar: true,
    visibleOnAllWorkspaces: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  registerCompanionWindow(win);
  return win;
}

ipcMain.handle("promptly:get-config", () => readDefaultCreds());
ipcMain.handle("promptly:open-window", () => {
  createCompanionWindow();
  return { ok: true };
});

app.whenReady().then(() => {
  const iconPath = resolveAppIconPath();
  if (process.platform === "darwin" && iconPath && app.dock) {
    app.dock.setIcon(iconPath);
  }
  createCompanionWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createCompanionWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
