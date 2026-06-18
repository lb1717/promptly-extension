/**
 * electron-builder renames helper bundles to the product name, but the Electron
 * runtime still looks for "Electron Helper*.app" with matching executables.
 * Rename bundle folders, binaries, and plist entries back to Electron defaults.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const HELPER_FIXES = [
  {
    bundleTo: "Electron Helper.app",
    execTo: "Electron Helper",
    matches: ["Promptly Companion Helper.app", "Electron Helper.app"]
  },
  {
    bundleTo: "Electron Helper (GPU).app",
    execTo: "Electron Helper (GPU)",
    matches: ["Promptly Companion Helper (GPU).app", "Electron Helper (GPU).app"]
  },
  {
    bundleTo: "Electron Helper (Plugin).app",
    execTo: "Electron Helper (Plugin)",
    matches: ["Promptly Companion Helper (Plugin).app", "Electron Helper (Plugin).app"]
  },
  {
    bundleTo: "Electron Helper (Renderer).app",
    execTo: "Electron Helper (Renderer)",
    matches: ["Promptly Companion Helper (Renderer).app", "Electron Helper (Renderer).app"]
  }
];

function plistSet(plistPath, key, value) {
  const quoted = `"${String(value).replace(/"/g, '\\"')}"`;
  execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${quoted}`, plistPath], { stdio: "pipe" });
}

function findHelperBundle(frameworksDir, names) {
  for (const name of names) {
    const candidate = path.join(frameworksDir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function fixHelperBundle(bundlePath, bundleTo, execTo) {
  const contentsDir = path.join(bundlePath, "Contents");
  const macOsDir = path.join(contentsDir, "MacOS");
  const plistPath = path.join(contentsDir, "Info.plist");
  const frameworksDir = path.dirname(bundlePath);
  const targetBundlePath = path.join(frameworksDir, bundleTo);

  const entries = fs.readdirSync(macOsDir);
  const execFrom = entries.find((name) => !name.startsWith("."));
  if (!execFrom) {
    throw new Error(`No helper executable in ${macOsDir}`);
  }

  const execFromPath = path.join(macOsDir, execFrom);
  const execToPath = path.join(macOsDir, execTo);

  if (execFrom !== execTo) {
    if (fs.existsSync(execToPath)) {
      fs.rmSync(execToPath, { force: true });
    }
    fs.renameSync(execFromPath, execToPath);
  }

  plistSet(plistPath, "CFBundleExecutable", execTo);
  try {
    plistSet(plistPath, "CFBundleName", execTo);
  } catch {
    const quoted = `"${String(execTo).replace(/"/g, '\\"')}"`;
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Add :CFBundleName string ${quoted}`, plistPath], {
      stdio: "pipe"
    });
  }

  if (path.basename(bundlePath) !== bundleTo) {
    if (fs.existsSync(targetBundlePath)) {
      fs.rmSync(targetBundlePath, { recursive: true, force: true });
    }
    fs.renameSync(bundlePath, targetBundlePath);
    bundlePath = targetBundlePath;
  }

  console.log(`[after-pack] Fixed helper ${bundleTo} (${execTo})`);
  return bundlePath;
}

/** @param {import("app-builder-lib").AfterPackContext} context */
exports.default = async function afterPack(context) {
  if (process.platform !== "darwin") {
    return;
  }

  const frameworksDir = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Frameworks"
  );

  for (const fix of HELPER_FIXES) {
    const bundlePath = findHelperBundle(frameworksDir, fix.matches);
    if (!bundlePath) {
      console.warn(`[after-pack] Helper bundle not found for ${fix.bundleTo}`);
      continue;
    }
    fixHelperBundle(bundlePath, fix.bundleTo, fix.execTo);
  }
};
