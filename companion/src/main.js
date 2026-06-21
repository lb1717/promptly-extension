const { app, BrowserWindow, ipcMain, shell, systemPreferences, Menu, session } = require("electron");
const { execFile } = require("child_process");
const { readFileSync, existsSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");
const { promisify } = require("util");
const {
  readCompanionSettings,
  writeCompanionSettings,
  shouldAutoOpenTool
} = require("./companionSettings");
const {
  startHostAppWatcher,
  stopHostAppWatcher,
  notifyDockedWindowClosed
} = require("./hostAppWatcher");
const { pasteToHostProcess, resolvePasteHostName, rememberPasteHost } = require("./hostPaste");
const {
  getPermissionStatus,
  requestAllPermissions,
  requestMicrophoneAccess
} = require("./permissions");

const execFileAsync = promisify(execFile);
const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
})();
const ANCHOR_POLL_MS = 900;
const HOST_FOCUS_TRACK_MS = 1200;
const PRODUCTION_API_URL = "https://promptly-labs.com";
const EXPANDED_DEFAULT = { width: 380, height: 580, minWidth: 320, minHeight: 420 };
const COLLAPSED_HEIGHT = 44;
const COLLAPSED_BG = "#6d5ce8";
const EXPANDED_BG = "#f4f5f7";

/** @type {Set<BrowserWindow>} */
const companionWindows = new Set();

/** @type {WeakMap<BrowserWindow, { anchorAppBundleId: string | null; anchorProcessNames: string[]; anchorTool: string | null; pollTimer: ReturnType<typeof setInterval> | null; onTop: boolean | null }>} */
const windowLayerState = new WeakMap();

/** @type {WeakMap<BrowserWindow, { collapsed: boolean; expandedBounds: Electron.Rectangle | null }>} */
const windowChromeState = new WeakMap();

let companionSettings = readCompanionSettings();
/** @type {ReturnType<typeof setInterval> | null} */
let hostFocusTrackTimer = null;

if (process.platform === "darwin") {
  app.setName("Promptly");
  app.setActivationPolicy("regular");
}

function normalizeApiUrl(url) {
  return String(url || "").replace(/\/$/, "");
}

function readDefaultCreds() {
  const settings = readCompanionSettings();
  const isDevMode = process.env.PROMPTLY_DEV === "1";
  const devApiUrl = isDevMode ? normalizeApiUrl(process.env.PROMPTLY_API_URL || "") : "";
  const productionFallback = {
    apiUrl: devApiUrl || PRODUCTION_API_URL,
    productionApiUrl: PRODUCTION_API_URL,
    isDevMode,
    devApiUrl: devApiUrl || null,
    token: "",
    client: "promptly-cursor"
  };
  if (settings.signedOut) {
    return productionFallback;
  }
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

async function getFrontmostProcessName() {
  if (process.platform !== "darwin") {
    return null;
  }
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

function getMacAppBundlePath() {
  if (process.platform !== "darwin" || !app.isPackaged) {
    return null;
  }
  const exePath = app.getPath("exe");
  const marker = "/Contents/MacOS/";
  const index = exePath.indexOf(marker);
  if (index <= 0) {
    return null;
  }
  return exePath.slice(0, index);
}

/** Strip Gatekeeper quarantine once — stops repeat "app is damaged" after drag-install. */
function clearMacDownloadQuarantine() {
  const bundlePath = getMacAppBundlePath();
  if (!bundlePath) {
    return;
  }
  execFile("/usr/bin/xattr", ["-cr", bundlePath], () => {});
}

function getLayerState(win) {
  let state = windowLayerState.get(win);
  if (!state) {
    state = {
      anchorAppBundleId: null,
      anchorProcessNames: [],
      anchorTool: null,
      pollTimer: null,
      onTop: null
    };
    windowLayerState.set(win, state);
  }
  return state;
}

function configureMacWindowLayer(win, onTop) {
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

function processNameMatchesAnchor(processName, state) {
  const name = String(processName || "").trim().toLowerCase();
  if (!name) return false;
  if (state.anchorProcessNames.some((p) => p.toLowerCase() === name)) {
    return true;
  }
  return false;
}

function startAnchorWatch(win, anchorAppBundleId, anchorProcessName) {
  stopAnchorWatch(win);
  if (process.platform !== "darwin") {
    return;
  }
  const state = getLayerState(win);
  state.anchorAppBundleId = anchorAppBundleId;
  if (anchorProcessName) {
    const names = new Set(state.anchorProcessNames.map((n) => n.toLowerCase()));
    names.add(String(anchorProcessName).toLowerCase());
    state.anchorProcessNames = [...names].map((n) => {
      const hit = state.anchorProcessNames.find((p) => p.toLowerCase() === n);
      return hit || anchorProcessName;
    });
  }
  state.pollTimer = setInterval(() => {
    void (async () => {
      if (!win || win.isDestroyed() || win.isFocused()) {
        stopAnchorWatch(win);
        return;
      }
      const frontProcess = await getFrontmostProcessName();
      const frontBundle = await getFrontmostAppBundleId();
      if (!frontProcess && !frontBundle) {
        return;
      }
      if (isCompanionAppBundle(frontBundle)) {
        stopAnchorWatch(win);
        setCompanionOnTop(win, true);
        return;
      }
      if (processNameMatchesAnchor(frontProcess, state)) {
        stopAnchorWatch(win);
        setCompanionOnTop(win, true);
        return;
      }
      if (state.anchorAppBundleId && frontBundle === state.anchorAppBundleId) {
        stopAnchorWatch(win);
        setCompanionOnTop(win, true);
      }
    })();
  }, ANCHOR_POLL_MS);
}

function handleCompanionBlur(win) {
  void (async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!win || win.isDestroyed() || win.isFocused()) {
      return;
    }
    const bundle = await getFrontmostAppBundleId();
    if (isCompanionAppBundle(bundle)) {
      return;
    }
    const front = await getFrontmostProcessName();
    rememberPasteHost(front);
  })();
}

function getChromeState(win) {
  let state = windowChromeState.get(win);
  if (!state) {
    state = { collapsed: false, expandedBounds: null };
    windowChromeState.set(win, state);
  }
  return state;
}

function setWindowCollapsed(win, collapsed) {
  if (!win || win.isDestroyed()) {
    return { ok: false };
  }
  const state = getChromeState(win);
  const next = Boolean(collapsed);
  if (state.collapsed === next) {
    return { ok: true, collapsed: next };
  }

  const bounds = win.getBounds();
  if (next) {
    state.expandedBounds = { ...bounds };
    state.collapsed = true;

    win.setResizable(true);
    win.setMaximumSize(10000, 10000);
    win.setMinimumSize(1, 1);
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: COLLAPSED_HEIGHT
    });
    win.setBackgroundColor(COLLAPSED_BG);
    win.setResizable(false);
    win.setMinimumSize(bounds.width, COLLAPSED_HEIGHT);
    win.setMaximumSize(bounds.width, COLLAPSED_HEIGHT);
  } else {
    state.collapsed = false;

    win.setResizable(true);
    win.setMaximumSize(10000, 10000);
    win.setMinimumSize(1, 1);

    const restore = state.expandedBounds;
    if (restore) {
      win.setBounds(restore);
    } else {
      const [width] = win.getSize();
      win.setBounds({
        x: Math.round(bounds.x + width - EXPANDED_DEFAULT.width),
        y: bounds.y,
        width: EXPANDED_DEFAULT.width,
        height: EXPANDED_DEFAULT.height
      });
    }
    win.setBackgroundColor(EXPANDED_BG);
    win.setMinimumSize(EXPANDED_DEFAULT.minWidth, EXPANDED_DEFAULT.minHeight);
    win.setMaximumSize(10000, 10000);
  }

  return { ok: true, collapsed: next };
}

function openNewCompanionWindow() {
  const win = createCompanionWindow();
  win.show();
  win.focus();
  return win;
}

async function resolvePasteHost(win) {
  const anchorProcessNames =
    win && !win.isDestroyed() ? getLayerState(win).anchorProcessNames || [] : [];
  return resolvePasteHostName({
    anchorProcessNames,
    getFrontmostProcessName
  });
}

function startHostFocusTracking() {
  if (process.platform !== "darwin" || hostFocusTrackTimer) {
    return;
  }
  hostFocusTrackTimer = setInterval(() => {
    void (async () => {
      const bundle = await getFrontmostAppBundleId();
      if (isCompanionAppBundle(bundle)) {
        return;
      }
      const front = await getFrontmostProcessName();
      rememberPasteHost(front);
    })();
  }, HOST_FOCUS_TRACK_MS);
}

function stopHostFocusTracking() {
  if (hostFocusTrackTimer) {
    clearInterval(hostFocusTrackTimer);
    hostFocusTrackTimer = null;
  }
}

function setupApplicationMenu() {
  const newWindowItem = {
    label: "New Window",
    accelerator: "CmdOrCtrl+N",
    click: () => {
      openNewCompanionWindow();
    }
  };

  const template = [];

  if (process.platform === "darwin") {
    template.push({
      label: "Promptly",
      submenu: [
        { label: "About Promptly", role: "about" },
        { type: "separator" },
        newWindowItem,
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { label: "Hide Promptly", role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { label: "Quit Promptly", role: "quit" }
      ]
    });
  } else {
    template.push({
      label: "File",
      submenu: [newWindowItem, { type: "separator" }, { role: "quit" }]
    });
  }

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" }
    ]
  });

  template.push({
    label: "Window",
    submenu: [
      newWindowItem,
      { label: "Close Window", role: "close" },
      { role: "minimize" },
      { type: "separator" },
      { role: "front" }
    ]
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function applyWindowAnchor(win, options = {}) {
  const state = getLayerState(win);
  state.anchorTool = options.anchorTool || null;
  state.anchorProcessNames = Array.isArray(options.anchorProcessNames) ? options.anchorProcessNames : [];
}

function syncExpandedBoundsOrigin(win) {
  const state = getChromeState(win);
  if (!state.collapsed || !state.expandedBounds) {
    return;
  }
  const bounds = win.getBounds();
  state.expandedBounds = {
    ...state.expandedBounds,
    x: bounds.x,
    y: bounds.y
  };
}

function registerCompanionWindow(win, options = {}) {
  companionWindows.add(win);
  applyWindowAnchor(win, options);
  win.__promptlySetAnchor = (anchorOptions) => applyWindowAnchor(win, anchorOptions);
  let readyResolve = null;
  win.__promptlyWaitUntilReady = () =>
    new Promise((resolve) => {
      if (win.isDestroyed()) {
        resolve();
        return;
      }
      if (win.__promptlyIsReady) {
        resolve();
        return;
      }
      readyResolve = resolve;
    });

  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
  }

  win.once("ready-to-show", () => {
    win.__promptlyIsReady = true;
    setCompanionOnTop(win, true);
    if (process.platform === "darwin" && app.dock) {
      app.dock.show();
    }
    if (!options.deferShow) {
      win.show();
    }
    if (readyResolve) {
      readyResolve();
      readyResolve = null;
    }
  });

  win.on("focus", () => {
    stopAnchorWatch(win);
    setCompanionOnTop(win, true);
  });

  win.on("blur", () => {
    handleCompanionBlur(win);
  });

  win.on("move", () => {
    syncExpandedBoundsOrigin(win);
  });

  win.on("closed", () => {
    stopAnchorWatch(win);
    companionWindows.delete(win);
    notifyDockedWindowClosed(win);
    delete win.__promptlySetAnchor;
    windowLayerState.delete(win);
    windowChromeState.delete(win);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadFile(join(__dirname, "renderer", "index.html"));
}

function createCompanionWindow(options = {}) {
  const iconPath = resolveAppIconPath();
  const win = new BrowserWindow({
    width: EXPANDED_DEFAULT.width,
    height: EXPANDED_DEFAULT.height,
    minWidth: EXPANDED_DEFAULT.minWidth,
    minHeight: EXPANDED_DEFAULT.minHeight,
    show: false,
    title: "Promptly Companion",
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: "#f4f5f7",
    autoHideMenuBar: false,
    frame: false,
    transparent: false,
    visibleOnAllWorkspaces: false,
    visibleOnFullScreen: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  getChromeState(win);
  registerCompanionWindow(win, options);
  return win;
}

function hasEnabledAutoOpenTarget() {
  return ["claude_code", "codex", "cursor"].some((tool) => shouldAutoOpenTool(tool, companionSettings));
}

function restartHostWatcher() {
  stopHostAppWatcher();
  if (process.platform === "darwin" && hasEnabledAutoOpenTarget()) {
    startHostAppWatcher({
      settings: companionSettings,
      createCompanionWindow,
      setCompanionOnTop,
      systemPreferences
    });
  }
}

ipcMain.handle("promptly:get-config", () => readDefaultCreds());
ipcMain.handle("promptly:refresh-config", () => readDefaultCreds());
ipcMain.handle("promptly:open-external", (_event, url) => {
  const target = String(url || "").trim();
  if (/^https?:\/\//i.test(target)) {
    void shell.openExternal(target);
    return { ok: true };
  }
  return { ok: false, error: "Invalid URL" };
});
ipcMain.handle("promptly:open-window", () => {
  openNewCompanionWindow();
  return { ok: true };
});
ipcMain.handle("promptly:close-window", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    return { ok: false };
  }
  win.close();
  return { ok: true };
});
ipcMain.handle("promptly:set-collapsed", (event, collapsed) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return { ok: false };
  }
  return setWindowCollapsed(win, collapsed);
});
ipcMain.handle("promptly:get-window-bounds", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    return null;
  }
  return win.getBounds();
});
ipcMain.handle("promptly:set-window-position", (event, position) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    return { ok: false };
  }
  const x = Math.round(Number(position?.x));
  const y = Math.round(Number(position?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, error: "Invalid position" };
  }
  win.setPosition(x, y);
  const state = getChromeState(win);
  if (state.collapsed && state.expandedBounds) {
    state.expandedBounds.x = x;
    state.expandedBounds.y = y;
  }
  return { ok: true };
});
ipcMain.handle("promptly:paste-to-host", async (event, text) => {
  if (
    process.platform === "darwin" &&
    systemPreferences &&
    typeof systemPreferences.isTrustedAccessibilityClient === "function" &&
    !systemPreferences.isTrustedAccessibilityClient(false)
  ) {
    systemPreferences.isTrustedAccessibilityClient(true);
  }
  const win = BrowserWindow.fromWebContents(event.sender);
  const host = await resolvePasteHost(win);
  if (!host) {
    return {
      ok: false,
      error:
        "Could not find Claude, Codex, ChatGPT, or Cursor. Click into the app you want to paste into, then try again."
    };
  }
  return pasteToHostProcess(host, text);
});

ipcMain.handle("promptly:get-app-info", () => ({
  name: app.getName(),
  version: APP_VERSION,
  isPackaged: app.isPackaged
}));

ipcMain.handle("promptly:get-permission-status", () => getPermissionStatus(systemPreferences));
ipcMain.handle("promptly:request-all-permissions", async () =>
  requestAllPermissions(systemPreferences)
);
ipcMain.handle("promptly:request-microphone-access", async () =>
  requestMicrophoneAccess(systemPreferences)
);
ipcMain.handle("promptly:complete-permissions-onboarding", (_event, patch) => {
  companionSettings = writeCompanionSettings({
    permissionsOnboardingComplete: true,
    ...(patch || {})
  });
  return companionSettings;
});
ipcMain.handle("promptly:get-settings", () => companionSettings);
ipcMain.handle("promptly:save-settings", (_event, patch) => {
  companionSettings = writeCompanionSettings(patch || {});
  restartHostWatcher();
  return companionSettings;
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === "media");

  setupApplicationMenu();

  clearMacDownloadQuarantine();

  const iconPath = resolveAppIconPath();
  if (process.platform === "darwin") {
    if (app.dock) {
      app.dock.show();
      if (iconPath) {
        app.dock.setIcon(iconPath);
      }
    }
  }

  restartHostWatcher();
  startHostFocusTracking();
  createCompanionWindow();

  app.on("activate", () => {
    const windows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
    const minimized = windows.filter((win) => win.isMinimized());
    if (minimized.length > 0) {
      minimized[0].restore();
      minimized[0].focus();
      return;
    }
    const hidden = windows.filter((win) => !win.isVisible());
    if (hidden.length > 0) {
      hidden[0].show();
      hidden[0].focus();
      return;
    }
    if (windows.length === 0) {
      createCompanionWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopHostAppWatcher();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
