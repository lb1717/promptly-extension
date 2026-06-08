---
name: promptly
description: Improve a draft with Promptly and execute it immediately
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "$HOME/integrations/claude-code/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`

The block above is my improved task. Start working on it now — do not ask me to confirm or restate it.
