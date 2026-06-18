# Promptly Companion

Desktop prompt workshop for Promptly — type a draft, improve it, refine with feedback, copy into any AI app.

Connects to **https://promptly-labs.com** by default (same account/token as your IDE integration).

## Install & run

```bash
cd companion
npm install
npm start
```

That's it. The app uses your paired device token from `~/.promptly/credentials-cursor.json` (or claude_code / codex) and talks to the live Promptly API.

## Auth

The companion calls:

- `POST /api/companion/optimize` — improve + refine
- `GET /api/companion/suggestions` — suggestion chips

**Auto-detect (recommended):** pair an IDE integration first — credentials are read on launch.

**Manual:** open Settings (gear) and paste your device token. API URL should stay `https://promptly-labs.com`.

Pair a device at [promptly-labs.com/integrations](https://promptly-labs.com/integrations).

## Admin config

Templates, models, and suggestion chips are editable at **Admin → Companion PE** on the website.

## Local development only

If you're hacking on the website backend locally:

```bash
cd website && npm run dev   # in one terminal
cd companion && npm run dev:local   # in another — NOT for normal use
```

Normal users should always use `npm start` (production).

## How to use

1. Type your draft → **Improve** (Cmd/Ctrl+Enter)
2. Pick suggestion chips, edit the prompt, copy when ready
3. **Apply feedback** at the bottom to refine
4. **+** starts a new prompt

## Notes

- Tall narrow always-on-top window (~380×680), anchored to the app you're working in
- Not wired to screen reading or auto-paste yet
