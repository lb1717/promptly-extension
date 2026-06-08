#!/usr/bin/env node
/**
 * Copy shared packages into each agent plugin bundle (source of truth: integrations/packages/).
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = (name) => join(root, "packages", name);

const copies = [
  [join(pkg("telemetry-cli"), "bin/promptly-telemetry.mjs"), "bin/promptly-telemetry.mjs"],
  [join(pkg("promptly-improve"), "bin/promptly-improve.mjs"), "bin/promptly-improve.mjs"],
  [join(pkg("mcp-server"), "index.mjs"), "mcp/server.mjs"]
];

for (const agent of ["claude-code", "cursor", "codex"]) {
  const agentDir = join(root, agent);
  for (const [src, relDest] of copies) {
    if (!existsSync(src)) continue;
    const dest = join(agentDir, relDest);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
}

writeFileSync(
  join(root, "claude-code/.mcp.json"),
  `${JSON.stringify(
    {
      mcpServers: {
        promptly: {
          command: "node",
          args: ["${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs"],
          env: { PROMPTLY_TOOL: "claude_code" }
        }
      }
    },
    null,
    2
  )}\n`
);

writeFileSync(
  join(root, "cursor/mcp.json"),
  `${JSON.stringify(
    {
      mcpServers: {
        promptly: {
          command: "node",
          args: ["./mcp/server.mjs"],
          env: { PROMPTLY_TOOL: "cursor" }
        }
      }
    },
    null,
    2
  )}\n`
);

const codexMcp = {
  mcpServers: {
    promptly: {
      command: "node",
      args: ["${PLUGIN_ROOT}/mcp/server.mjs"],
      env: { PROMPTLY_TOOL: "codex" }
    }
  }
};
writeFileSync(join(root, "codex/.mcp.json"), `${JSON.stringify(codexMcp, null, 2)}\n`);
writeFileSync(join(root, "codex/mcp.json"), `${JSON.stringify(codexMcp, null, 2)}\n`);

function hookJson(tool) {
  return {
    version: 1,
    hooks: {
      beforeSubmitPrompt: [{ command: `node ./bin/promptly-telemetry.mjs hook --tool ${tool}` }],
      stop: [{ command: `node ./bin/promptly-telemetry.mjs hook --tool ${tool}` }],
      sessionStart: [{ command: `node ./bin/promptly-telemetry.mjs hook --tool ${tool}` }],
      sessionEnd: [{ command: `node ./bin/promptly-telemetry.mjs hook --tool ${tool}` }]
    }
  };
}

writeFileSync(join(root, "cursor/hooks/hooks.json"), `${JSON.stringify(hookJson("cursor"), null, 2)}\n`);
writeFileSync(join(root, "codex/hooks/hooks.json"), `${JSON.stringify(hookJson("codex"), null, 2)}\n`);

writeFileSync(
  join(root, "claude-code/hooks/hooks.json"),
  `${JSON.stringify(
    {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: "command",
                command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/promptly-telemetry.mjs" hook --tool claude_code',
                timeout: 15
              }
            ]
          }
        ],
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/promptly-telemetry.mjs" hook --tool claude_code',
                timeout: 15
              }
            ]
          }
        ],
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/promptly-telemetry.mjs" hook --tool claude_code',
                timeout: 15
              }
            ]
          }
        ],
        SessionEnd: [
          {
            hooks: [
              {
                type: "command",
                command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/promptly-telemetry.mjs" hook --tool claude_code',
                timeout: 15
              }
            ]
          }
        ]
      }
    },
    null,
    2
  )}\n`
);

writeFileSync(
  join(root, "claude-code/commands/promptly.md"),
  [
    "---",
    "description: Improve a draft prompt with Promptly (rewrite mode only)",
    "argument-hint: [your draft prompt]",
    "allowed-tools: Read, Bash(node:*)",
    "---",
    "",
    '!`node "${CLAUDE_PLUGIN_ROOT}/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`',
    ""
  ].join("\n")
);

writeFileSync(
  join(root, "claude-code/user-commands/promptly.md"),
  [
    "---",
    "description: Improve a draft prompt with Promptly (rewrite mode only)",
    "argument-hint: [your draft prompt]",
    "allowed-tools: Read, Bash(node:*)",
    "---",
    "",
    '!`node "$HOME/integrations/claude-code/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`',
    ""
  ].join("\n")
);

const cursorSlash = `---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
---

Run Promptly improve and reply with **only** the improved prompt (no preamble):

\`\`\`bash
node "$HOME/integrations/cursor/bin/promptly-improve.mjs" --tool cursor "$ARGUMENTS"
\`\`\`

Draft:

$ARGUMENTS
`;

writeFileSync(join(root, "cursor/commands/promptly.md"), cursorSlash);
writeFileSync(join(root, "cursor/user-commands/promptly.md"), cursorSlash);

mkdirSync(join(root, "codex/skill"), { recursive: true });
writeFileSync(
  join(root, "codex/skill/SKILL.md"),
  `---
name: promptly
description: Improve a draft prompt with Promptly before sending (rewrite mode). User invokes /promptly with their draft.
disable-model-invocation: true
---

Run Promptly improve on the user's draft. Execute:

\`\`\`bash
node "$HOME/integrations/codex/bin/promptly-improve.mjs" --tool codex "$ARGUMENTS"
\`\`\`

Reply with **only** the improved prompt text — no explanation or preamble.

User draft:

$ARGUMENTS
`
);

console.log("[promptly] synced plugin pack from packages/");
