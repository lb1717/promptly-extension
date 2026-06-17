#!/usr/bin/env node
/**
 * Patch agent hooks.json on Windows: replace bare `node` with a quoted node.exe path
 * inside the JSON string so hooks remain valid JSON and run under restricted shells.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export function patchWindowsHookFile(filePath, nodeExe = process.execPath) {
  if (process.platform !== "win32") {
    return { path: filePath, patched: false, reason: "not_win32" };
  }
  if (!existsSync(filePath)) {
    return { path: filePath, patched: false, reason: "missing" };
  }
  const raw = readFileSync(filePath, "utf8");
  if (!/node \\"/.test(raw)) {
    return { path: filePath, patched: false, reason: "already_patched" };
  }
  const jsonFragment = `\\"${nodeExe.replace(/\\/g, "\\\\")}\\" `;
  const patched = raw.replace(/node /g, jsonFragment);
  if (patched === raw) {
    return { path: filePath, patched: false, reason: "no_match" };
  }
  try {
    JSON.parse(patched);
  } catch (err) {
    throw new Error(`Invalid hooks JSON after patch (${filePath}): ${err?.message || err}`);
  }
  writeFileSync(filePath, patched, "utf8");
  return { path: filePath, patched: true };
}

export function collectWindowsHookJsonPaths(integrations = join(homedir(), "integrations")) {
  const paths = new Set();
  for (const rel of [
    "codex/hooks/hooks.json",
    "cursor/hooks/hooks.json",
    "claude-code/hooks/hooks.json"
  ]) {
    paths.add(join(integrations, rel));
  }
  paths.add(join(homedir(), ".cursor/plugins/local/promptly-cursor/hooks/hooks.json"));

  for (const [cacheRoot, rels] of [
    [join(homedir(), ".codex/plugins/cache/promptly-labs/promptly-codex"), ["hooks/hooks.json", "codex/hooks/hooks.json"]],
    [join(homedir(), ".claude/plugins/cache/promptly-labs/promptly-claude-code"), ["hooks/hooks.json"]]
  ]) {
    if (!existsSync(cacheRoot)) continue;
    for (const entry of readdirSync(cacheRoot)) {
      for (const rel of rels) {
        paths.add(join(cacheRoot, entry, rel));
      }
    }
  }
  return [...paths];
}

export function patchAllWindowsHookFiles(nodeExe = process.execPath, integrations) {
  const results = [];
  for (const filePath of collectWindowsHookJsonPaths(integrations)) {
    results.push(patchWindowsHookFile(filePath, nodeExe));
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const extra = process.argv.slice(2).filter(Boolean);
  const targets = extra.length ? extra : collectWindowsHookJsonPaths();
  let patched = 0;
  for (const filePath of targets) {
    const result = patchWindowsHookFile(filePath);
    if (result.patched) {
      patched += 1;
      console.log(`[promptly] patched hooks: ${filePath}`);
    }
  }
  if (!patched) {
    console.log("[promptly] no Windows hook files needed patching");
  }
}
