const { app, BrowserWindow, ipcMain, shell, systemPreferences, Menu } = require("electron");
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
const { pasteToHostProcess, isAllowedProcess } = require("./hostPaste");

const execFileAsync = promisify(execFile);
const ANCHOR_POLL_MS = 900;
const PRODUCTION_API_URL = "https://promptly-labs.com";
const EXPANDED_DEFAULT = { width: 380, height: 680, minWidth: 320, minHeight: 480 };
const COLLAPSED_SIZE = { width: 236, height: 44 };
const COLLAPSED_BG = "#6d5ce8";
const EXPANDED_BG = "#f4f5f7";

/** @type {Set<BrowserWindow>} */
const companionWindows = new Set();

/** @type {WeakMap<BrowserWindow, { anchorAppBundleId: string | null; anchorProcessNames: string[]; anchorTool: string | null; pollTimer: ReturnType<typeof setInterval> | null; onTop: boolean | null }>} */
const windowLayerState = new WeakMap();

/** @type {WeakMap<BrowserWindow, { collapsed: boolean; expandedBounds: Electron.Rectangle | null }>} */
const windowChromeState = new WeakMap();

let companionSettings = readCompanionSettings();

if (process.platform === "darwin") {
  app.setName("Promptly");
}

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
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (!win || win.isDestroyed() || win.isFocused()) {
      return;
    }
    const frontProcess = await getFrontmostProcessName();
    const frontBundle = await getFrontmostAppBundleId();
    if (isCompanionAppBundle(frontBundle)) {
      return;
    }
    const state = getLayerState(win);
    if (processNameMatchesAnchor(frontProcess, state)) {
      return;
    }
    setCompanionOnTop(win, false);
    startAnchorWatch(win, frontBundle, frontProcess);
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
      x: Math.round(bounds.x + bounds.width - COLLAPSED_SIZE.width),
      y: bounds.y,
      width: COLLAPSED_SIZE.width,
      height: COLLAPSED_SIZE.height
    });
    win.setBackgroundColor(COLLAPSED_BG);
    win.setResizable(false);
    win.setMinimumSize(COLLAPSED_SIZE.width, COLLAPSED_SIZE.height);
    win.setMaximumSize(COLLAPSED_SIZE.width, COLLAPSED_SIZE.height);
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
  if (win && !win.isDestroyed()) {
    const state = getLayerState(win);
    for (const name of state.anchorProcessNames || []) {
      if (isAllowedProcess(name)) {
        return name;
      }
    }
  }
  const front = await getFrontmostProcessName();
  if (isAllowedProcess(front)) {
    return front;
  }
  return null;
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
      error: "Open Claude, Codex, ChatGPT, or Cursor beside Companion, then try again."
    };
  }
  return pasteToHostProcess(host, text);
});
ipcMain.handle("promptly:get-settings", () => companionSettings);
ipcMain.handle("promptly:save-settings", (_event, patch) => {
  companionSettings = writeCompanionSettings(patch || {});
  restartHostWatcher();
  return companionSettings;
});

app.whenReady().then(() => {
  setupApplicationMenu();

  const iconPath = resolveAppIconPath();
  if (process.platform === "darwin" && iconPath && app.dock) {
    app.dock.setIcon(iconPath);
  }

  restartHostWatcher();

  const openOnLaunch =
    companionSettings.openOnCompanionLaunch || !hasEnabledAutoOpenTarget();
  if (openOnLaunch) {
    createCompanionWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && !hasEnabledAutoOpenTarget()) {
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
