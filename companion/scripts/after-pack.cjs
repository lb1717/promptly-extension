/**
 * Ad-hoc sign the .app after pack so macOS Gatekeeper does not report "damaged"
 * for unsigned builds downloaded from the web. No Apple Developer account required.
 */
const { execFileSync } = require("child_process");
const path = require("path");

/** @param {import("app-builder-lib").AfterPackContext} context */
exports.default = async function afterPack(context) {
  if (process.platform !== "darwin") {
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const entitlements = path.join(context.packager.projectDir, "build", "entitlements.mac.plist");

  console.log(`[after-pack] Ad-hoc signing ${appPath}`);
  execFileSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", "--entitlements", entitlements, appPath],
    { stdio: "inherit" }
  );

  execFileSync("codesign", ["--verify", "--deep", appPath], { stdio: "inherit" });
  console.log("[after-pack] Signature verified");
};
