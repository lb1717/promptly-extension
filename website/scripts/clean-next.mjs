import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const nextDir = path.join(root, process.env.NEXT_DIST_DIR || ".next");

try {
  fs.rmSync(nextDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 120
  });
  console.log(`[promptly] cleaned ${path.basename(nextDir)} cache`);
} catch (error) {
  console.warn(`[promptly] failed to clean ${path.basename(nextDir)} cache:`, error);
}

// Remove legacy production dist dir if present.
const legacyDir = path.join(root, ".next-build");
try {
  fs.rmSync(legacyDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 120
  });
  console.log("[promptly] cleaned legacy .next-build cache");
} catch {
  // ignore
}
