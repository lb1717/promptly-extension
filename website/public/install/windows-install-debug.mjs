#!/usr/bin/env node
/**
 * Temporary Windows install debug bundle — copy/paste output for Promptly support.
 */
import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { homedir, platform, release, userInfo } from "os";
import { join } from "path";

const integrations = process.argv[2] || join(homedir(), "integrations");
const cli = join(integrations, "packages/telemetry-cli/bin/promptly-telemetry.mjs");
const nodeExe = process.env.PROMPTLY_NODE_EXE || process.execPath;

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

function runCli(args) {
  if (!existsSync(cli)) return { error: "telemetry_cli_missing", path: cli };
  const result = spawnSync(nodeExe, [cli, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  let json = null;
  if (stdout) {
    try {
      json = JSON.parse(stdout);
    } catch {
      json = null;
    }
  }
  return {
    exit_code: result.status,
    json,
    stdout: json ? undefined : stdout || undefined,
    stderr: stderr || undefined
  };
}

function runCmd(cmd) {
  return safe(() => {
    const opts = {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    };
    if (process.platform === "win32") {
      opts.env.CHCP = "65001";
    }
    return execSync(cmd, opts).trim();
  });
}

function sanitizeTerminalText(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/\u00e2\u20ac\u201d/g, "-")
    .replace(/\u00e2\u20ac\u201c/g, '"')
    .replace(/\u00e2\u20ac\u2019/g, "'")
    .replace(/\u00e2\u20ac\u201c/g, '"')
    .replace(/\u00e2\u20ac\u00a2/g, "-")
    .replace(/\u00e2\u2020\u2019/g, "->")
    .replace(/\u00e2\u2020\u2018/g, "<-")
    .replace(/\u00c3\u00b7/g, " ")
    .replace(/\u00e2\u0153\u201c/g, "[enabled]")
    .replace(/\u00e2\u009d\u00bb/g, "*")
    .replace(/[\u0080-\u009f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, (ch) => {
      if (ch === "\u2014" || ch === "\u2013") return "-";
      if (ch === "\u2192") return "->";
      if (ch === "\u2190") return "<-";
      if (ch === "\u00b7") return " ";
      return "";
    });
}

function collectHookPaths() {
  const paths = new Set();
  for (const rel of [
    "codex/hooks/hooks.json",
    "cursor/hooks/hooks.json",
    "claude-code/hooks/hooks.json"
  ]) {
    paths.add(join(integrations, rel));
  }
  paths.add(join(homedir(), ".codex/hooks.json"));
  paths.add(join(homedir(), ".cursor/plugins/local/promptly-cursor/hooks/hooks.json"));
  for (const [cacheRoot, rels] of [
    [join(homedir(), ".codex/plugins/cache/promptly-labs/promptly-codex"), ["hooks/hooks.json", "codex/hooks/hooks.json"]],
    [join(homedir(), ".claude/plugins/cache/promptly-labs/promptly-claude-code"), ["hooks/hooks.json"]]
  ]) {
    if (!existsSync(cacheRoot)) continue;
    for (const entry of readdirSync(cacheRoot)) {
      for (const rel of rels) paths.add(join(cacheRoot, entry, rel));
    }
  }
  return [...paths];
}

function analyzeHookFile(filePath) {
  const row = { path: filePath, exists: existsSync(filePath) };
  if (!row.exists) return row;
  const raw = readFileSync(filePath, "utf8");
  row.bytes = raw.length;
  if (raw.trimStart().startsWith("#!")) {
    row.json_valid = false;
    row.json_error = "hooks.json contains script content instead of JSON (re-run setup)";
    row.ok = false;
    return row;
  }
  row.has_bare_node_runner = /node \\"/.test(raw);
  const target = nodeExe.toLowerCase();
  row.has_node_exe_path =
    raw.toLowerCase().includes(target) || raw.toLowerCase().includes(target.replace(/\\/g, "\\\\"));
  try {
    JSON.parse(raw);
    row.json_valid = true;
  } catch (err) {
    row.json_valid = false;
    row.json_error = String(err?.message || err);
  }
  const commands = [...raw.matchAll(/"command":\s*"((?:\\.|[^"\\])*)"/g)].map((m) =>
    m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  );
  row.command_count = commands.length;
  row.commands = commands.slice(0, 6);
  row.ok = row.json_valid && row.has_node_exe_path && !row.has_bare_node_runner;
  return row;
}

function pathRow(label, filePath) {
  return {
    label,
    path: filePath,
    exists: existsSync(filePath),
    mtime: existsSync(filePath) ? new Date(statSync(filePath).mtimeMs).toISOString() : null
  };
}

const report = {
  generated_at: new Date().toISOString(),
  debug_mode: true,
  platform: {
    os: platform(),
    release,
    user: safe(() => userInfo().username),
    homedir: homedir(),
    userprofile: process.env.USERPROFILE || null,
    appdata: process.env.APPDATA || null
  },
  node: {
    exec_path: nodeExe,
    version: safe(() => execSync(`"${nodeExe}" -v`, { encoding: "utf8" }).trim())
  },
  integrations: {
    root: integrations,
    exists: existsSync(integrations),
    telemetry_cli: pathRow("telemetry_cli", cli),
    patch_script: pathRow("patch_script", join(integrations, "scripts/patch-windows-hooks.mjs")),
    sync_script: pathRow("sync_script", join(integrations, "scripts/sync-plugin-pack.mjs"))
  },
  key_paths: [
    pathRow("cursor_plugin", join(homedir(), ".cursor/plugins/local/promptly-cursor")),
    pathRow("codex_cache", join(homedir(), ".codex/plugins/cache/promptly-labs/promptly-codex")),
    pathRow("claude_cache", join(homedir(), ".claude/plugins/cache/promptly-labs/promptly-claude-code")),
    pathRow("codex_config", join(homedir(), ".codex/config.toml")),
    pathRow("codex_user_hooks", join(homedir(), ".codex/hooks.json")),
    pathRow("promptly_dir", join(homedir(), ".promptly")),
    pathRow("cursor_state_db", join(process.env.APPDATA || "", "Cursor/User/globalStorage/state.vscdb"))
  ],
  hooks: collectHookPaths().map(analyzeHookFile),
  hooks_summary: null,
  cli_binaries: safe(() => {
    const names = ["claude", "codex", "cursor"];
    const out = {};
    for (const name of names) {
      const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
      out[name] = safe(() => execSync(cmd, { encoding: "utf8" }).trim().split(/\r?\n/)[0]);
    }
    return out;
  }),
  plugin_lists: {
    claude: safe(() => sanitizeTerminalText(runCmd(process.platform === "win32" ? "chcp 65001 >nul & claude plugin list" : "claude plugin list"))),
    codex: safe(() => sanitizeTerminalText(runCmd(process.platform === "win32" ? "chcp 65001 >nul & codex plugin list" : "codex plugin list")))
  },
  codex_hook_trust: safe(() => runCli(["diagnostics", "--tool", "codex"]).json?.codex_hook_trust),
  codex_watch_daemon: safe(() => runCli(["diagnostics", "--tool", "codex"]).json?.codex_watch_daemon),
  codex_sessions: safe(() => runCli(["diagnostics", "--tool", "codex"]).json?.codex_sessions),
  codex_features: safe(() => runCmd(process.platform === "win32" ? "chcp 65001 >nul & codex features list" : "codex features list")),
  telemetry: {
    status_all: runCli(["status"]),
    diagnostics: {
      claude_code: runCli(["diagnostics", "--tool", "claude_code"]),
      cursor: runCli(["diagnostics", "--tool", "cursor"]),
      codex: runCli(["diagnostics", "--tool", "codex"])
    },
    status_by_tool: {
      claude_code: runCli(["status", "--tool", "claude_code"]),
      cursor: runCli(["status", "--tool", "cursor"]),
      codex: runCli(["status", "--tool", "codex"])
    },
    sync_runtimes: runCli(["sync-runtimes"])
  }
};

const hookRows = report.hooks.filter((row) => row.exists);
report.hooks_summary = {
  total_paths: report.hooks.length,
  existing: hookRows.length,
  json_valid: hookRows.filter((row) => row.json_valid).length,
  has_node_exe: hookRows.filter((row) => row.has_node_exe_path).length,
  still_bare_node: hookRows.filter((row) => row.has_bare_node_runner).length,
  all_ok: hookRows.filter((row) => row.ok).length
};

console.log(JSON.stringify(report, null, 2));
