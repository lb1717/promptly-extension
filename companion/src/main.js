const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { readFileSync, existsSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");

const PRODUCTION_API_URL = "https://promptly-labs.com";

/** @type {Set<BrowserWindow>} */
const companionWindows = new Set();

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

/**
 * Float above other apps on THIS macOS Space only — never mirror onto other Desktops.
 */
function pinWindowToCurrentSpace(win) {
  if (!win || win.isDestroyed()) {
    return;
  }
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(false);
    win.setAlwaysOnTop(true, "floating");
  } else if (process.platform === "win32") {
    win.setAlwaysOnTop(true, "screen-saver");
  } else {
    win.setAlwaysOnTop(true);
  }
}

function registerCompanionWindow(win) {
  companionWindows.add(win);

  win.once("ready-to-show", () => {
    pinWindowToCurrentSpace(win);
    win.show();
  });

  win.on("focus", () => {
    pinWindowToCurrentSpace(win);
  });

  win.on("closed", () => {
    companionWindows.delete(win);
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
    // Stay on the Space where this window is created — do not follow three-finger swipes.
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
