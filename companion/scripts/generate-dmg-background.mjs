import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "build");
const width = 660;
const height = 320;
const INSTALL_COMMAND = 'xattr -cr "/Applications/Promptly Companion.app"';

function escapeSvgText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildInstallBackgroundSvg(w, h) {
  const cx = w / 2;
  const scale = w / width;
  const titleY = 36 * scale;
  const subtitleY = 58 * scale;
  const step1Y = 92 * scale;
  const arrowY = 168 * scale;
  const step2Y = 228 * scale;
  const cmdBoxY = 242 * scale;
  const cmdBoxH = 36 * scale;
  const cmdTextY = 265 * scale;
  const cmdBoxX = 80 * scale;
  const cmdBoxW = w - cmdBoxX * 2;
  const titleSize = 20 * scale;
  const subtitleSize = 12 * scale;
  const stepSize = 14 * scale;
  const cmdSize = 11 * scale;
  const arrowStart = 250 * scale;
  const arrowEnd = 395 * scale;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="#f4f5f7"/>

  <text x="${cx}" y="${titleY}" text-anchor="middle" fill="#141820" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="${titleSize}" font-weight="700">Install Promptly Companion</text>
  <text x="${cx}" y="${subtitleY}" text-anchor="middle" fill="#6b7280" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="${subtitleSize}">Two steps — first time only</text>

  <text x="${cx}" y="${step1Y}" text-anchor="middle" fill="#141820" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="${stepSize}" font-weight="600">1. Drag Promptly Companion to Applications</text>

  <path d="M ${arrowStart} ${arrowY} L ${arrowEnd} ${arrowY}" stroke="#6d5ce8" stroke-width="${3 * scale}" fill="none" stroke-linecap="round"/>
  <path d="M ${arrowEnd - 15 * scale} ${arrowY - 7 * scale} L ${arrowEnd} ${arrowY} L ${arrowEnd - 15 * scale} ${arrowY + 7 * scale}" fill="#6d5ce8"/>

  <text x="${cx}" y="${step2Y}" text-anchor="middle" fill="#141820" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="${stepSize}" font-weight="600">2. Open Install command.txt · copy · paste in Terminal</text>

  <rect x="${cmdBoxX}" y="${cmdBoxY}" width="${cmdBoxW}" height="${cmdBoxH}" rx="${6 * scale}" fill="#ffffff" stroke="#d8dce5"/>
  <text x="${cmdBoxX + 12 * scale}" y="${cmdTextY}" fill="#141820" font-family="Menlo,Monaco,Consolas,monospace" font-size="${cmdSize}">${escapeSvgText(INSTALL_COMMAND)}</text>
</svg>`;
}

const svg1x = buildInstallBackgroundSvg(width, height);
writeFileSync(join(outDir, "dmg-background.svg"), svg1x, "utf8");
writeFileSync(join(outDir, "Install command.txt"), `${INSTALL_COMMAND}\n`, "utf8");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("Install sharp to regenerate dmg-background.png: npm install --save-dev sharp");
  process.exit(1);
}

async function writeDmgBackground(outputName, svg, pixelWidth, pixelHeight) {
  await sharp(Buffer.from(svg))
    .resize(pixelWidth, pixelHeight, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 72 })
    .toFile(join(outDir, outputName));
}

await writeDmgBackground("dmg-background.png", svg1x, width, height);
await writeDmgBackground("dmg-background@2x.png", buildInstallBackgroundSvg(width * 2, height * 2), width * 2, height * 2);

console.log("Wrote build/dmg-background.png, build/dmg-background@2x.png, and build/Install command.txt");
