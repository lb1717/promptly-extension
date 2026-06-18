import { createConnection } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const companionRoot = join(__dirname, "..");

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function resolveDevApiUrl() {
  const fromEnv = String(process.env.PROMPTLY_API_URL || "").replace(/\/$/, "");
  if (fromEnv) {
    return fromEnv;
  }

  // When multiple `next dev` instances are running, Next.js bumps ports (3000 → 3001 → 3002).
  // Prefer the highest open port so we hit the most recently started local server.
  const candidates = [3002, 3001, 3000];
  for (const port of candidates) {
    if (await portOpen(port)) {
      return `http://localhost:${port}`;
    }
  }
  return "http://localhost:3000";
}

const apiUrl = await resolveDevApiUrl();
console.log(`[companion dev] Using API ${apiUrl}`);

const electronBin = join(companionRoot, "node_modules", ".bin", "electron");
spawn(electronBin, ["."], {
  cwd: companionRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    PROMPTLY_API_URL: apiUrl
  }
});
