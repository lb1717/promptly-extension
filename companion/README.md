# Promptly Companion (experiment)

A standalone desktop prompt workshop — type your draft here, improve it via Promptly, refine with follow-up feedback, and copy the result into any AI app.

Separate from the browser extension and the main Promptly desktop app.

## Run locally

### 1. Start the website API (if testing against local backend)

```bash
cd website
npm install
npm run dev
```

### 2. Auth

The companion calls `POST /api/optimize` with a **device token** (same as Cursor / Claude Code integrations).

**Option A — auto-detect (easiest)**  
If you've already paired an IDE integration, the app reads `~/.promptly/credentials-cursor.json` (or claude_code / codex) on launch.

**Option B — environment variables**

```bash
export PROMPTLY_API_URL=http://localhost:3000
export PROMPTLY_DEVICE_TOKEN=pt_your_token_here
```

**Option C — in-app Settings**  
Click the gear icon and paste API URL + device token. Values are saved in local storage.

Pair a device at [promptly-labs.com/integrations](https://promptly-labs.com/integrations) if you don't have a token yet.

### 3. Launch the companion

```bash
cd companion
npm install
npm run dev    # auto-picks localhost (3002 → 3001 → 3000); shows API in header
# or
npm start      # points at promptly-labs.com
```

## How to use

1. Type your draft and click **Improve** (or Cmd/Ctrl+Enter).
2. Layout (top → bottom):
   - **Note** (after follow-up only) — what changed
   - **Further improve chips**
   - **Prompt box** — stretches to fill the window; Copy in top-right
   - **Follow-up input** + **Apply feedback** — always anchored at the bottom
3. Copy the prompt and paste into any AI app.

## Window shape

Tall narrow always-on-top window (~380×680) designed as a side companion.

## Notes

- This is an experiment — not wired to screen reading or auto-paste yet.
- Uses `x-promptly-client: promptly-cursor` (or whichever IDE credential file was found).
- Follow-up uses `optimize_mode: "refine"` via **`POST /api/companion/optimize`** (separate from extension prompt engineering).
- Improve suggestion chips come from **`GET /api/companion/suggestions`** — editable in Admin → **Companion PE**.
- Run the local website (`cd website && npm run dev`) when testing. Check the header shows `local 300x`.
