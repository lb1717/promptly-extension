const { app, shell } = require("electron");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const MICROPHONE_SETTINGS_URLS = [
  "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone",
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Microphone"
];

const ACCESSIBILITY_SETTINGS_URLS = [
  "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility",
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Accessibility"
];

const PRIVACY_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension";

async function openFirstWorkingUrl(urls) {
  if (process.platform !== "darwin") {
    return false;
  }
  for (const url of urls) {
    try {
      await execFileAsync("/usr/bin/open", [url]);
      return true;
    } catch {
      /* try next */
    }
  }
  try {
    await execFileAsync("/usr/bin/open", [PRIVACY_SETTINGS_URL]);
  } catch {
    return false;
  }
  return false;
}

function openMicrophoneSettings() {
  void openFirstWorkingUrl(MICROPHONE_SETTINGS_URLS);
  return true;
}

function openAccessibilitySettings() {
  void openFirstWorkingUrl(ACCESSIBILITY_SETTINGS_URLS);
  return true;
}

function getMicrophoneStatus(systemPreferences) {
  if (
    process.platform !== "darwin" ||
    !systemPreferences ||
    typeof systemPreferences.getMediaAccessStatus !== "function"
  ) {
    return "unknown";
  }
  return systemPreferences.getMediaAccessStatus("microphone");
}

function getAccessibilityGranted(systemPreferences) {
  if (
    process.platform !== "darwin" ||
    !systemPreferences ||
    typeof systemPreferences.isTrustedAccessibilityClient !== "function"
  ) {
    return false;
  }
  return systemPreferences.isTrustedAccessibilityClient(false);
}

async function requestMicrophoneAccess(systemPreferences) {
  if (process.platform !== "darwin") {
    return { granted: true, status: "granted", openedSettings: false, prompted: false };
  }

  let status = getMicrophoneStatus(systemPreferences);
  if (status === "granted") {
    return { granted: true, status, openedSettings: false, prompted: false };
  }

  let prompted = false;
  if (status === "not-determined" && typeof systemPreferences.askForMediaAccess === "function") {
    prompted = true;
    const granted = await systemPreferences.askForMediaAccess("microphone");
    status = getMicrophoneStatus(systemPreferences);
    if (granted || status === "granted") {
      return { granted: true, status, openedSettings: false, prompted: true };
    }
  }

  return {
    granted: false,
    status,
    openedSettings: openMicrophoneSettings(),
    prompted
  };
}

function requestAccessibilityAccess(systemPreferences) {
  if (process.platform !== "darwin") {
    return { granted: true, status: "granted", openedSettings: false, prompted: false };
  }

  if (
    !systemPreferences ||
    typeof systemPreferences.isTrustedAccessibilityClient !== "function"
  ) {
    return { granted: false, status: "unknown", openedSettings: false, prompted: false };
  }

  const alreadyGranted = systemPreferences.isTrustedAccessibilityClient(false);
  if (alreadyGranted) {
    return { granted: true, status: "granted", openedSettings: false, prompted: false };
  }

  systemPreferences.isTrustedAccessibilityClient(true);
  const granted = systemPreferences.isTrustedAccessibilityClient(false);
  return {
    granted,
    status: granted ? "granted" : "denied",
    openedSettings: granted ? false : openAccessibilitySettings(),
    prompted: true
  };
}

async function requestAllPermissions(systemPreferences) {
  const microphone = await requestMicrophoneAccess(systemPreferences);
  const accessibility = requestAccessibilityAccess(systemPreferences);
  return {
    appName: app.getName(),
    isPackaged: app.isPackaged,
    microphone,
    accessibility
  };
}

function getPermissionStatus(systemPreferences) {
  return {
    appName: app.getName(),
    isPackaged: app.isPackaged,
    microphone: {
      granted: getMicrophoneStatus(systemPreferences) === "granted",
      status: getMicrophoneStatus(systemPreferences)
    },
    accessibility: {
      granted: getAccessibilityGranted(systemPreferences),
      status: getAccessibilityGranted(systemPreferences) ? "granted" : "denied"
    }
  };
}

module.exports = {
  getPermissionStatus,
  requestAllPermissions,
  requestMicrophoneAccess,
  requestAccessibilityAccess,
  openMicrophoneSettings,
  openAccessibilitySettings
};
