import * as esbuild from "esbuild";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "src/renderer/app.bundle.js");

await esbuild.build({
  entryPoints: [join(root, "src/renderer/app.js")],
  bundle: true,
  outfile,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  logLevel: "info"
});

console.log(`[promptly] bundled renderer -> ${outfile}`);
