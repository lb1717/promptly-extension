import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "index.html");
const pdfPath = path.join(__dirname, "Promptly-Labs-Sales-Deck.pdf");
const fileUrl = pathToFileURL(htmlPath).href;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1123, height: 794 }
});
await page.goto(fileUrl, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  landscape: true,
  printBackground: true,
  preferCSSPageSize: true,
  tagged: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 }
});
await browser.close();

console.log(`Saved: ${pdfPath}`);
