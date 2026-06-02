#!/usr/bin/env node
/**
 * Bundle integrations/ into website/public/downloads/promptly-coding-agents.zip
 */
import { ZipArchive } from "archiver";
import { cpSync, createWriteStream, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const integrationsDir = join(repoRoot, "integrations");
const outDir = join(repoRoot, "website/public/downloads");
const zipPath = join(outDir, "promptly-coding-agents.zip");
const marketplaceSrc = join(integrationsDir, ".claude-plugin/marketplace.json");
const marketplaceCodex = join(integrationsDir, ".agents/plugins/marketplace.json");

if (!existsSync(integrationsDir)) {
  console.error("[promptly] integrations/ not found — cannot build plugin pack");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(dirname(marketplaceCodex), { recursive: true });
cpSync(marketplaceSrc, marketplaceCodex);

await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  output.on("close", () => {
    console.log(`[promptly] Wrote ${zipPath} (${archive.pointer()} bytes)`);
    resolve(undefined);
  });

  archive.on("error", reject);
  output.on("error", reject);

  archive.pipe(output);
  archive.directory(integrationsDir, "integrations");
  void archive.finalize();
});
