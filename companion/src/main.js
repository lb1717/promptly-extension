const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { execFile } = require("child_process");
const { readFileSync, existsSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const LAYER_POLL_MS = 500;
const PRODUCTION_API_URL = "https://promptly-labs.com";

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string | null} */
let anchorAppBundleId = null;
/** @type {ReturnType<typeof setInterval> | null} */
let layerPollTimer = null;
/** @type {{ visible: boolean | null; onTop: boolean | null }} */
let layerState = { visible: null, onTop: null };

function normalizeApiUrl(url) {
  return String(url || "").replace(/\/$/, "");
}

function isLocalApiUrl(url) {
  try {
    const hostname = new URL(String(url || "")).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
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
  return (
    id.includes("electron") ||
    id.includes("promptly") ||
    id === app.name?.toLowerCase()
  );
}

function resetLayerState() {
  layerState = { visible: null, onTop: null };
}

function applyWindowLayer({ visible, onTop }) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (process.platform === "darwin") {
    if (layerState.visible !== visible) {
      if (visible) {
        if (!mainWindow.isVisible()) {
          mainWindow.showInactive();
        }
      } else {
        mainWindow.hide();
      }
      layerState.visible = visible;
    }

    if (layerState.onTop !== onTop) {
      if (onTop) {
        mainWindow.setAlwaysOnTop(true, "floating");
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } else {
        mainWindow.setAlwaysOnTop(false, "normal");
      }
      layerState.onTop = onTop;
    }
    return;
  }

  if (process.platform === "win32") {
    if (layerState.onTop !== onTop) {
      mainWindow.setAlwaysOnTop(onTop, onTop ? "screen-saver" : "normal");
      layerState.onTop = onTop;
    }
    return;
  }

  if (layerState.onTop !== onTop) {
    mainWindow.setAlwaysOnTop(onTop);
    layerState.onTop = onTop;
  }
}

async function syncWindowLayer() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isFocused()) {
    applyWindowLayer({ visible: true, onTop: true });
    return;
  }

  if (process.platform !== "darwin") {
    applyWindowLayer({ visible: true, onTop: false });
    return;
  }

  const frontBundle = await getFrontmostAppBundleId();
  if (!frontBundle) {
    return;
  }

  if (isCompanionAppBundle(frontBundle)) {
    applyWindowLayer({ visible: true, onTop: true });
    return;
  }

  if (anchorAppBundleId && frontBundle === anchorAppBundleId) {
    applyWindowLayer({ visible: true, onTop: true });
    return;
  }

  // Hide when another app is frontmost (other Desktop, browser, etc.) instead of
  // toggling always-on-top every poll — avoids flash loops and stray appearances.
  applyWindowLayer({ visible: false, onTop: false });
}

function startLayerPolling() {
  stopLayerPolling();
  layerPollTimer = setInterval(() => {
    void syncWindowLayer();
  }, LAYER_POLL_MS);
}

function stopLayerPolling() {
  if (layerPollTimer) {
    clearInterval(layerPollTimer);
    layerPollTimer = null;
  }
}

function captureAnchorApp() {
  void (async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const frontBundle = await getFrontmostAppBundleId();
    if (frontBundle && !isCompanionAppBundle(frontBundle)) {
      anchorAppBundleId = frontBundle;
    }
    await syncWindowLayer();
  })();
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

function createWindow() {
  const iconPath = resolveAppIconPath();
  mainWindow = new BrowserWindow({
    width: 380,
    height: 680,
    minWidth: 320,
    minHeight: 480,
    show: false,
    title: "Promptly Companion",
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: "#f4f5f7",
    autoHideMenuBar: true,
    visibleOnFullScreen: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    applyWindowLayer({ visible: true, onTop: true });
    mainWindow?.show();
    startLayerPolling();
  });

  mainWindow.on("focus", () => {
    applyWindowLayer({ visible: true, onTop: true });
  });

  mainWindow.on("blur", () => {
    captureAnchorApp();
  });

  mainWindow.on("closed", () => {
    stopLayerPolling();
    resetLayerState();
    mainWindow = null;
    anchorAppBundleId = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadFile(join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("promptly:get-config", () => readDefaultCreds());

app.whenReady().then(() => {
  const iconPath = resolveAppIconPath();
  if (process.platform === "darwin" && iconPath && app.dock) {
    app.dock.setIcon(iconPath);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
