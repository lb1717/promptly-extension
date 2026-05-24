# Promptly Account Setup (Firebase + Website API)

Promptly now uses one stack:

- Firebase Auth for user identity
- Firestore for user records and usage data
- Website API routes for `/api/optimize`, `/api/credits`, and admin metrics

The Cloudflare Worker path is no longer required for the main extension flow.

## 1) Create Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/).
2. Create project (example: `promptly-prod`).
3. In **Authentication > Sign-in method**, enable **Google**.
4. In **Firestore Database**, create database in production mode.
5. In **Project settings > Service accounts**, generate a service account key for server-side use.

## 2) Create web app and copy config

1. In Firebase project settings, add a **Web App**.
2. Put these values into `website/.env.local`:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000

NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...

FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-nano
OPENAI_REWRITE_TIMEOUT_MS=15000
OPENAI_CREATE_TIMEOUT_MS=30000
```

3. Restart the website dev server after editing env values.

## 3) Add authorized domains

In **Authentication > Settings > Authorized domains**, add:

- `localhost`
- your deployed website domain later (for example `promptly.ai`)

## 4) Verify account pages

Open:

- `http://localhost:3000/account`
- `http://localhost:3000/auth/extension`

Sign in with Google once. This creates or updates a Firestore user document:

- Collection: `users`
- Document ID: Firebase UID

Stored fields include:

- `email`
- `plan` (currently `free`)
- `dailyTokenLimit` (defaults to `4,000,000`)
- usage summary fields written by the website API
- timestamps

## 5) Website backend setup

The website backend now handles:

- Firebase token verification
- OpenAI calls
- daily credit tracking
- admin usage metrics

From `website/`:

```bash
npm install
npm run build
```

The important runtime routes are:

- `GET /api/credits`
- `POST /api/optimize`
- `GET /api/admin/stats`
- `GET /api/admin/users`
- `GET /api/account/stats` (compact summary shown on `/account`)
- `GET /api/account/stats/extended` (event-backed series for `/account/statistics`)

## 6) Extension auth setup

Google Cloud **does not** allow `chrome-extension://...` as an **Authorized JavaScript origin** on a Web OAuth client. Extensions should still use the Chromium redirect URL pattern:

`https://YOUR_EXTENSION_ID.chromiumapp.org/`

1. In **Firebase Console > Authentication > Sign-in method > Google**, copy the **Web client ID**.
2. In [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials), open that same **Web application** OAuth client.
3. Under **Authorized redirect URIs**, add:
   - `https://YOUR_EXTENSION_ID.chromiumapp.org/`
4. Reload the extension in `chrome://extensions`.

Extension options should now contain:

- **Promptly app / API base URL**: for local dev, `http://localhost:3000`
- **Firebase Web API key**
- **Firebase auth domain**
- optional **Firebase Web OAuth client ID**

The extension signs in with Google, exchanges that for a Firebase session, then sends a Firebase ID token to the website API.

## 7) Manage users centrally

Use Firebase Console:

- **Authentication > Users** for Promptly accounts
- **Firestore > users** for plan and usage metadata
- **Firestore > promptly_usage_daily** for per-day token usage and mode counts
- **Firestore > promptly_optimize_events** for per-optimize analytics rows when `/api/optimize` succeeds
- **Firestore > promptly_host_llm_events** for passive extension listener rows (typing + native sends) plus **mirrored** Improve/Generate completions from `/api/optimize` so statistics stay populated when in-page send detection misses

The website admin dashboard now reads from Firestore-backed website routes instead of Worker KV.

## 8) Prompt statistics collection & Firestore indexes

Each successful **`POST /api/optimize`** still updates **`promptly_usage_daily`** (authoritative quotas). It also writes an append‑only analytics row under **`promptly_optimize_events`** with:

- `billedPromptlyTokens` — Promptly’s OpenAI bill for that optimize round (what limits enforce)
- `optimizeLatencyMs`
- Extension telemetry (best-effort): composer character/word estimates and a **scraped host UI model label** from ChatGPT / Claude / Gemini (may be empty or wrong after host UI changes)

Independently, authenticated extensions periodically **`POST /api/telemetry/host-activity`** (batched) to append **`promptly_host_llm_events`** describing observed native typing/send activity. On each successful **`POST /api/optimize`**, the backend also appends a **`source: optimize_api`** row into the same collection (when composer length telemetry exists) so dashboards show activity tied to the Promptly panel even if the page never fired a trusted DOM “send” event.

Deploy the composite indexes from the repo root before `/api/account/stats/extended` can query events (field order must match Firebase):

- File: [`firestore.indexes.json`](../firestore.indexes.json)
- **`promptly_optimize_events`** and **`promptly_host_llm_events`**, each composite: **`uid` ASC**, **`utcDay` ASC**, **`__name__` ASC**

If you see `FAILED_PRECONDITION`/“requires an index”, use the link from the error or deploy with:

```bash
firebase deploy --only firestore:indexes
```

**Important:** “Host composer chars” / “detected model” / “passive host latency” are **hints for dashboards only**. They do **not** represent ChatGPT, Claude, or Gemini subscription metering and can diverge materially from exact vendor timings or token totals.

