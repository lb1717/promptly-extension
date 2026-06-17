#!/usr/bin/env node
/**
 * Patch agent hooks.json on Windows: replace bare `node` with a quoted node.exe path
 * inside the JSON string so hooks remain valid JSON and run under restricted shells.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

function resolveNodeExe(nodeExe = process.env.PROMPTLY_NODE_EXE || process.execPath) {
  return String(nodeExe || process.execPath).trim();
}

function hookFileUsesNodeExe(raw, nodeExe) {
  const lower = raw.toLowerCase();
  const target = nodeExe.toLowerCase();
  return lower.includes(target) || lower.includes(target.replace(/\\/g, "\\\\"));
}

export function patchWindowsHookFile(filePath, nodeExe = resolveNodeExe()) {
  if (process.platform !== "win32") {
    return { path: filePath, patched: false, reason: "not_win32" };
  }
  if (!existsSync(filePath)) {
    return { path: filePath, patched: false, reason: "missing" };
  }
  const raw = readFileSync(filePath, "utf8");
  if (!/node \\"/.test(raw)) {
    try {
      JSON.parse(raw);
      if (hookFileUsesNodeExe(raw, nodeExe)) {
        return { path: filePath, patched: false, reason: "already_patched" };
      }
    } catch {
      return { path: filePath, patched: false, reason: "invalid_json" };
    }
    return { path: filePath, patched: false, reason: "no_node_runner" };
  }
  const jsonFragment = `\\"${nodeExe.replace(/\\/g, "\\\\")}\\" `;
  const patched = raw.replace(/node /g, jsonFragment);
  if (patched === raw) {
    return { path: filePath, patched: false, reason: "no_match" };
  }
  JSON.parse(patched);
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

export function patchAllWindowsHookFiles(nodeExe = resolveNodeExe(), integrations) {
  const results = [];
  for (const filePath of collectWindowsHookJsonPaths(integrations)) {
    results.push(patchWindowsHookFile(filePath, nodeExe));
  }
  return results;
}

function isCliMain() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  let entry = process.argv[1];
  try {
    entry = fileURLToPath(pathToFileURL(entry).href);
  } catch {
    /* keep argv[1] */
  }
  const norm = (value) => value.replace(/\\/g, "/").toLowerCase();
  return norm(self) === norm(entry);
}

function runCli() {
  const nodeExe = resolveNodeExe();
  const extra = process.argv.slice(2).filter(Boolean);
  const targets = extra.length ? extra : collectWindowsHookJsonPaths();
  let patched = 0;
  for (const filePath of targets) {
    const result = patchWindowsHookFile(filePath, nodeExe);
    if (result.patched) {
      patched += 1;
      console.log(`[promptly] patched hooks: ${filePath}`);
    }
  }
  if (!patched) {
    console.log("[promptly] no Windows hook files needed patching");
  }
}

if (isCliMain()) {
  runCli();
}
