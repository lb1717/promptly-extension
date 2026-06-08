# Promptly IDE agent integrations

Connect **Claude Code**, **Cursor**, and **Codex** to your Promptly account. Track prompt counts and screen time (metadata only — no prompt bodies). Use **`/promptly`** in each agent to rewrite a draft prompt (improve mode).

## Architecture

- **Plugins** install hooks that call `promptly-telemetry.mjs` (bundled in each plugin `bin/`).
- **CLI** batches events to `POST /api/telemetry/ide-activity` with a device token.
- **Website** pairing at `/auth/integrations` issues 8-character codes.
- **Statistics** appear in the **Coding agents** section at [/account/statistics](https://promptly-labs.com/account/statistics).

Sync shared files from `packages/` before building the zip:

```bash
node integrations/scripts/sync-plugin-pack.mjs
cd website && npm run prebuild
```

## Install (recommended)

Use the one-command setup at [promptly-labs.com/integrations](https://promptly-labs.com/integrations). Scripts **remove the old plugin**, download a fresh pack, reinstall, and register **`/promptly`**:

| Agent | `/promptly` installed to |
| --- | --- |
| **Claude Code** | `~/.claude/commands/promptly.md` |
| **Cursor** | `~/.cursor/commands/promptly.md` |
| **Codex** | `~/.codex/skills/promptly/SKILL.md` (Codex skill — bare `/promptly`) |

Re-run install anytime to refresh hooks, MCP, and slash commands without re-pairing.

## Improve a prompt (`/promptly`)

| Agent | Usage |
| --- | --- |
| **Claude Code** | `/promptly your draft here` — runs improve via bash |
| **Cursor** | `/promptly your draft here` in chat |
| **Codex** | `/promptly your draft here` (skill; quit/reopen Codex after install) |

Pair each agent separately (`login --tool claude_code|cursor|codex`).

## Repository layout

```
integrations/
├── packages/telemetry-cli/   # Shared CLI (source of truth)
├── packages/mcp-server/      # MCP connect/login/status/improve
├── packages/promptly-improve/
├── scripts/sync-plugin-pack.mjs
├── claude-code/
├── cursor/
├── codex/
│   └── skill/SKILL.md        # Codex /promptly skill
└── .claude-plugin/           # Marketplace manifest
```
