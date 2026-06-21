import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "build");
const width = 660;
const height = 460;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f8f9fb"/>
      <stop offset="100%" stop-color="#eef0f4"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000000" flood-opacity="0.08"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>

  <text x="330" y="42" text-anchor="middle" fill="#141820" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="22" font-weight="700">Install Promptly Companion</text>
  <text x="330" y="66" text-anchor="middle" fill="#6b7280" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13">First-time setup only — you only do this once</text>

  <text x="330" y="118" text-anchor="middle" fill="#141820" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="14" font-weight="600">1. Drag Promptly Companion to Applications</text>

  <path d="M 250 205 L 395 205" stroke="#6d5ce8" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M 385 198 L 400 205 L 385 212" fill="#6d5ce8"/>

  <rect x="40" y="285" width="580" height="155" rx="12" fill="#ffffff" stroke="#d8dce5" filter="url(#shadow)"/>
  <text x="60" y="312" fill="#141820" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13" font-weight="600">2. Open Terminal and paste:</text>
  <rect x="60" y="322" width="540" height="34" rx="6" fill="#f4f5f7" stroke="#d8dce5"/>
  <text x="72" y="344" fill="#141820" font-family="Menlo,Monaco,Consolas,monospace" font-size="11">xattr -cr "/Applications/Promptly Companion.app"</text>

  <text x="60" y="382" fill="#141820" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13" font-weight="600">3. In Applications, right-click Promptly Companion → Open → Open</text>
  <text x="60" y="404" fill="#6b7280" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="11">Do not double-click the first time — macOS blocks unsigned apps until you use Open.</text>
  <text x="60" y="424" fill="#6b7280" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="11">After that, open normally from Applications or Spotlight.</text>
</svg>`;

writeFileSync(join(outDir, "dmg-background.svg"), svg, "utf8");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("Install sharp to regenerate dmg-background.png: npm install --save-dev sharp");
  process.exit(1);
}

await sharp(Buffer.from(svg)).png().toFile(join(outDir, "dmg-background.png"));
console.log("Wrote build/dmg-background.png");
