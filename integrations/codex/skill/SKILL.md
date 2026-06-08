---
name: promptly
description: Improve a draft prompt with Promptly before sending (rewrite mode). User invokes /promptly with their draft.
disable-model-invocation: true
---

Run Promptly improve on the user's draft. Execute:

```bash
node "$HOME/integrations/codex/bin/promptly-improve.mjs" --tool codex "$ARGUMENTS"
```

Reply with **only** the improved prompt text — no explanation or preamble.

User draft:

$ARGUMENTS
