/**
 * Copy built installers to website/public/downloads/companion/ for local smoke tests only.
 * Production downloads use GitHub Releases — do not rely on these stable filenames.
 * Run after: npm run dist:mac (and/or dist:win)
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const outDir = join(root, "..", "website", "public", "downloads", "companion");

function readVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

if (!existsSync(distDir)) {
  console.error("No dist/ folder — run npm run dist:mac first.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const version = readVersion();
const files = readdirSync(distDir);
let copied = 0;

const dmg = files.find((n) => n.endsWith(".dmg") && n.includes(version));
const zip = files.find((n) => n.endsWith(".zip") && /mac|darwin/i.test(n) && n.includes(version));
const exe = files.find((n) => n.endsWith(".exe") && n.includes(version));

if (dmg) {
  const dest = `Promptly-Companion-${version}-mac.dmg`;
  copyFileSync(join(distDir, dmg), join(outDir, dest));
  console.log(`${dmg} → ${dest}`);
  copied += 1;
}
if (zip) {
  const dest = `Promptly-Companion-${version}-mac.zip`;
  copyFileSync(join(distDir, zip), join(outDir, dest));
  console.log(`${zip} → ${dest}`);
  copied += 1;
}
if (exe) {
  const dest = `Promptly-Companion-${version}-win.exe`;
  copyFileSync(join(distDir, exe), join(outDir, dest));
  console.log(`${exe} → ${dest}`);
  copied += 1;
}

if (!copied) {
  console.error(`No versioned .dmg / .exe / .zip found in dist/ for v${version}`);
  process.exit(1);
}

console.log("\nLocal copies only — production uses GitHub Releases at /companion");
