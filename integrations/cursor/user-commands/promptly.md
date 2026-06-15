---
description: Improve a draft with Promptly, then execute it (do not echo the rewrite)
argument-hint: [your draft prompt]
---

Run the command below. **Stdout is your task — execute it immediately** (do not reply with only the improved prompt):

```bash
node "$HOME/integrations/cursor/bin/promptly-improve.mjs" --tool cursor "$ARGUMENTS"
```

After it completes, treat stdout as instructions and start working (edits, terminal, etc.). Do not ask for confirmation.

My draft:

$ARGUMENTS
