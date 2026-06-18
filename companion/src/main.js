const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { execFile } = require("child_process");
const { readFileSync, existsSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const LAYER_POLL_MS = 350;
const PRODUCTION_API_URL = "https://promptly-labs.com";

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string | null} */
let anchorAppBundleId = null;
/** @type {ReturnType<typeof setInterval> | null} */
let layerPollTimer = null;

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

function applyAlwaysOnTop(onTop) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (process.platform === "darwin") {
    mainWindow.setAlwaysOnTop(onTop, onTop ? "floating" : "normal");
    if (onTop) {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  } else if (process.platform === "win32") {
    mainWindow.setAlwaysOnTop(onTop, onTop ? "screen-saver" : "normal");
  } else {
    mainWindow.setAlwaysOnTop(onTop);
  }
}

async function syncWindowLayer() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isFocused()) {
    applyAlwaysOnTop(true);
    return;
  }

  if (process.platform !== "darwin") {
    applyAlwaysOnTop(false);
    return;
  }

  const frontBundle = await getFrontmostAppBundleId();
  if (!frontBundle) {
    return;
  }

  if (isCompanionAppBundle(frontBundle)) {
    applyAlwaysOnTop(true);
    return;
  }

  if (!anchorAppBundleId) {
    applyAlwaysOnTop(false);
    return;
  }

  applyAlwaysOnTop(frontBundle === anchorAppBundleId);
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 680,
    minWidth: 320,
    minHeight: 480,
    show: false,
    title: "Promptly Companion",
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
    applyAlwaysOnTop(true);
    mainWindow?.show();
    startLayerPolling();
  });

  mainWindow.on("focus", () => {
    applyAlwaysOnTop(true);
  });

  mainWindow.on("blur", () => {
    captureAnchorApp();
  });

  mainWindow.on("closed", () => {
    stopLayerPolling();
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
