/**
 * Copy built installers to website/public/downloads/companion/ with stable filenames.
 * Run after: npm run dist:mac (and/or dist:win)
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const outDir = join(root, "..", "website", "public", "downloads", "companion");

const STABLE = {
  dmg: "Promptly-Companion-mac.dmg",
  zip: "Promptly-Companion-mac.zip",
  exe: "Promptly-Companion-setup.exe"
};

if (!existsSync(distDir)) {
  console.error("No dist/ folder — run npm run dist:mac first.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const files = readdirSync(distDir);
let copied = 0;

const dmg = files.find((n) => n.endsWith(".dmg"));
const zip = files.find((n) => n.endsWith(".zip") && /mac|darwin/i.test(n));
const exe = files.find((n) => n.endsWith(".exe"));

if (dmg) {
  copyFileSync(join(distDir, dmg), join(outDir, STABLE.dmg));
  console.log(`${dmg} → ${STABLE.dmg}`);
  copied += 1;
}
if (zip) {
  copyFileSync(join(distDir, zip), join(outDir, STABLE.zip));
  console.log(`${zip} → ${STABLE.zip}`);
  copied += 1;
}
if (exe) {
  copyFileSync(join(distDir, exe), join(outDir, STABLE.exe));
  console.log(`${exe} → ${STABLE.exe}`);
  copied += 1;
}

if (!copied) {
  console.error("No .dmg / .exe / .zip found in dist/");
  process.exit(1);
}

console.log("\nLive at: https://promptly-labs.com/downloads/companion/");
