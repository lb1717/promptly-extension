# Promptly IDE agent integrations

Connect **Claude Code**, **Cursor**, and **Codex** to your Promptly account. Track prompt counts and screen time (metadata only — no prompt bodies).

## Architecture

- **Plugins** install hooks that call `promptly-telemetry.mjs` (bundled in each plugin `bin/`).
- **CLI** batches events to `POST /api/telemetry/ide-activity` with a device token.
- **Website** pairing at `/auth/integrations` issues 8-character codes.
- **Statistics** appear in the **Coding agents** section at the bottom of [/account/statistics](https://promptly-labs.com/account/statistics).

## Quick install

Download the plugin pack from [promptly-labs.com/downloads/promptly-coding-agents.zip](https://promptly-labs.com/downloads/promptly-coding-agents.zip), unzip to your home folder (creates `~/integrations`), then follow [promptly-labs.com/integrations](https://promptly-labs.com/integrations).

### Claude Code

```bash
# After cloning https://github.com/promptly-labs/Promptly — or use your local repo path:
/plugin marketplace add ./integrations
/plugin install promptly-claude-code@promptly-labs
/reload-plugins
```

Install steps also live at [promptly-labs.com/integrations](https://promptly-labs.com/integrations).

### Codex

```bash
codex plugin marketplace add ./integrations
codex plugin install promptly-codex@promptly-labs
```

### Cursor

```bash
mkdir -p ~/.cursor/plugins/local
cp -R integrations/cursor ~/.cursor/plugins/local/promptly-cursor
# Restart Cursor (Developer: Reload Window)
```

## Connect your account

1. Open [promptly-labs.com/auth/integrations?tool=claude_code](https://promptly-labs.com/auth/integrations) (or `cursor` / `codex`).
2. Sign in and copy the **8-character pairing code**.
3. Run:

```bash
node integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs login ABCD1234 --tool claude_code
```

Or use the Promptly MCP tool `promptly_login` after enabling the plugin MCP server.

Credentials are stored in `~/.promptly/credentials.json`.

## Local development

```bash
export PROMPTLY_API_URL=http://localhost:3000
node integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs login CODE --tool claude_code
```

Deploy Firestore indexes before stats populate:

```bash
firebase deploy --only firestore:indexes
```

## E2E checklist

- [ ] Sign in at `/auth/integrations?tool=claude_code` and receive a pairing code
- [ ] `promptly-telemetry login <code> --tool claude_code` returns connected
- [ ] `promptly-telemetry status` shows email and tool
- [ ] Submit a prompt in Claude Code; hook runs without blocking the agent
- [ ] Firestore `promptly_ide_events` receives rows for your uid
- [ ] `/account/statistics` **Coding agents** section shows prompt counts
- [ ] Revoke device at `/api/integrations/devices` (DELETE) → telemetry returns 401
- [ ] Repeat for Cursor and Codex with `--tool cursor` / `--tool codex`

## Test telemetry manually

```bash
export PROMPTLY_API_URL=http://localhost:3000
echo '{"hook_event_name":"UserPromptSubmit","prompt":"hello world test"}' | \
  node integrations/packages/telemetry-cli/bin/promptly-telemetry.mjs hook --tool claude_code
```

## Repository layout

```
integrations/
├── packages/telemetry-cli/   # Shared CLI (source of truth)
├── packages/mcp-server/      # MCP connect/login/status
├── claude-code/              # Claude Code plugin bundle
├── cursor/                   # Cursor plugin bundle
├── codex/                    # Codex plugin bundle
└── marketplace/              # Marketplace manifest for /plugin marketplace add
```

When updating the CLI, copy `packages/telemetry-cli/bin/promptly-telemetry.mjs` into each plugin `bin/` directory.
