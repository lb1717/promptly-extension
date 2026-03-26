import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDirName = process.env.NEXT_DIST_DIR || ".next";
const nextDir = path.join(root, distDirName);

try {
  fs.rmSync(nextDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 120
  });
  console.log(`[promptly] cleaned ${distDirName} cache`);
} catch (error) {
  console.warn(`[promptly] failed to clean ${distDirName} cache:`, error);
}
