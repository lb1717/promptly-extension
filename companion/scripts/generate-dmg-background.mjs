import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "build");
const width = 660;
const height = 320;
const INSTALL_COMMAND = 'xattr -cr "/Applications/Promptly Companion.app"';

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#f4f5f7"/>

  <text x="330" y="36" text-anchor="middle" fill="#141820" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="20" font-weight="700">Install Promptly Companion</text>
  <text x="330" y="58" text-anchor="middle" fill="#6b7280" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="12">Two steps — first time only</text>

  <text x="330" y="92" text-anchor="middle" fill="#141820" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="14" font-weight="600">1. Drag Promptly Companion to Applications</text>

  <path d="M 250 168 L 395 168" stroke="#6d5ce8" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M 385 161 L 400 168 L 385 175" fill="#6d5ce8"/>

  <text x="330" y="228" text-anchor="middle" fill="#141820" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="14" font-weight="600">2. Open Install command.txt · copy · paste in Terminal</text>

  <rect x="80" y="242" width="500" height="36" rx="6" fill="#ffffff" stroke="#d8dce5"/>
  <text x="92" y="265" fill="#141820" font-family="Menlo,Monaco,Consolas,monospace" font-size="11">${INSTALL_COMMAND.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</text>
</svg>`;

writeFileSync(join(outDir, "dmg-background.svg"), svg, "utf8");
writeFileSync(join(outDir, "Install command.txt"), `${INSTALL_COMMAND}\n`, "utf8");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("Install sharp to regenerate dmg-background.png: npm install --save-dev sharp");
  process.exit(1);
}

await sharp(Buffer.from(svg), { density: 144 })
  .resize(width, height)
  .png()
  .toFile(join(outDir, "dmg-background.png"));
console.log("Wrote build/dmg-background.png and build/Install command.txt");
