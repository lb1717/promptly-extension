const { existsSync, readFileSync, writeFileSync, mkdirSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");

const SETTINGS_PATH = join(homedir(), ".promptly", "companion-settings.json");

const DEFAULT_SETTINGS = {
  autoOpen: {
    claude_code: true,
    codex: true,
    cursor: false
  },
  openOnCompanionLaunch: false,
  permissionsOnboardingComplete: false
};

function readCompanionSettings() {
  try {
    if (!existsSync(SETTINGS_PATH)) {
      return { ...DEFAULT_SETTINGS, autoOpen: { ...DEFAULT_SETTINGS.autoOpen } };
    }
    const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      autoOpen: { ...DEFAULT_SETTINGS.autoOpen, ...(raw.autoOpen || {}) },
      permissionsOnboardingComplete: raw.permissionsOnboardingComplete === true
    };
  } catch {
    return { ...DEFAULT_SETTINGS, autoOpen: { ...DEFAULT_SETTINGS.autoOpen } };
  }
}

function writeCompanionSettings(next) {
  const dir = join(homedir(), ".promptly");
  mkdirSync(dir, { recursive: true });
  const merged = {
    ...readCompanionSettings(),
    ...next,
    autoOpen: { ...readCompanionSettings().autoOpen, ...(next.autoOpen || {}) }
  };
  writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

function hasPairedCredentials(tool) {
  const key = tool.replace(/-/g, "_");
  const path = join(homedir(), ".promptly", `credentials-${key}.json`);
  if (!existsSync(path)) return false;
  try {
    const creds = JSON.parse(readFileSync(path, "utf8"));
    return Boolean(creds?.device_token);
  } catch {
    return false;
  }
}

function shouldAutoOpenTool(tool, settings) {
  if (!settings.autoOpen?.[tool]) return false;
  return hasPairedCredentials(tool);
}

module.exports = {
  SETTINGS_PATH,
  readCompanionSettings,
  writeCompanionSettings,
  hasPairedCredentials,
  shouldAutoOpenTool
};
