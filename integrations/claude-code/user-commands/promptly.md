---
description: Improve a draft prompt with Promptly (rewrite mode only)
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "$HOME/integrations/claude-code/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`
