---
description: Improve a draft with Promptly, then execute it (do not echo the rewrite)
argument-hint: [your draft prompt]
allowed-tools: Read, Bash(node:*)
---

!`node "$HOME/integrations/claude-code/bin/promptly-improve.mjs" --tool claude_code "$ARGUMENTS"`

The text above is my **task**, rewritten by Promptly for clarity. **Execute it now:**
- Do **not** reply with only the improved prompt or ask me to confirm it
- Do **not** restate or summarize the prompt and stop
- **Do** immediately start the work (read files, edit code, run commands, etc.)
