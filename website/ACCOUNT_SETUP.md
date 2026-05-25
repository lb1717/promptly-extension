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
- your deployed website domain later (for example `promptly-labs.com`)

### Branded Google sign-in (“Continue to …”)

Google’s account picker always shows a **domain** in “Sign in to continue to …” (it cannot show only an app name like “Promptly”). By default that domain is `{project-id}.firebaseapp.com`.

To replace it with your brand:

1. **OAuth consent screen (app name)** — [Google Cloud Console](https://console.cloud.google.com/apis/credentials/consent) → OAuth consent screen → set **App name** to `Promptly` and upload your logo. This updates the header of the dialog; the “continue to” line still shows a domain.

2. **Custom Firebase auth domain** (recommended: `auth.promptly-labs.com`):
   - Firebase Console → **Authentication** → **Settings** → **Authorized domains** → **Add custom domain** (or connect via **Hosting** if prompted).
   - Add DNS records Firebase gives you (typically CNAME `auth` → `{project-id}.firebaseapp.com`).
   - Wait for SSL provisioning (can take up to 24h).

3. **Google OAuth client** (same project) → **Credentials** → open the **Web client** used by Firebase → **Authorized redirect URIs**, add:
   - `https://auth.promptly-labs.com/__/auth/handler`
   - Keep existing `https://{project-id}.firebaseapp.com/__/auth/handler` until cutover is verified.

4. **Authorized JavaScript origins** — ensure these include:
   - `https://promptly-labs.com`
   - `https://www.promptly-labs.com`
   - `http://localhost:3000` (local dev)
   - `https://auth.promptly-labs.com` (after custom domain is live)

5. **Update app config** everywhere `authDomain` is set:
   - `website/.env.local`: `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=auth.promptly-labs.com`
   - Vercel/production env vars (same)
   - Extension options: **Firebase auth domain** → `auth.promptly-labs.com`
   - Redeploy website and reload extension.

After cutover, users should see **“Continue to: auth.promptly-labs.com”** (or your chosen subdomain) instead of `promptly-prod-976ef.firebaseapp.com`. Local dev can keep the default `firebaseapp.com` domain until you add localhost-compatible custom domain setup.

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
- `GET /api/account/stats/extended` (`/account/statistics` unified overview: merged per-AI prompt stacks, Promptly-vs-native latency, illustrative token/typing narratives)

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

Independently, authenticated extensions periodically **`POST /api/telemetry/host-activity`** (batched) to append **`promptly_host_llm_events`** describing observed native typing/send activity. On each successful **`POST /api/optimize`**, the backend also appends a **`source: optimize_api`** row into the same collection using the **greater of client telemetry composer length or** `prompt.length + user_instruction.length`, so dashboards show activity tied to Promptly unless both are unavailable.

### Passive empty but Firebase “works”?

1. **`promptly_host_llm_events` index** deployed and status **enabled** in Firebase Console (queries return 0 without it).
2. **Extension backend URL** in Options equals the hostname you browse for `/account/statistics`; custom preview hosts **`*.vercel.app`** have first-class allowance (older builds rewrote unsupported hosts → production only).
3. **Same Promptly/Firebase user** (`uid`) on sidebar sign-in vs website session.
4. **Smoke test**: one successful Improve should always write **`source: optimize_api`** (plus `promptly_optimize_events`).

`POST /api/telemetry/host-activity` replies with **`received`**, **`written`**, and **`invalid_skipped`** to debug malformed batches client-side without logging prompt bodies.

- File: [`firestore.indexes.json`](../firestore.indexes.json)
- **`promptly_optimize_events`**: **`uid` ASC**, **`utcDay` ASC**, **`__name__` ASC** (Optimize event timeline)
- **`promptly_host_llm_events`**: **`uid` ASC**, **`utcDay` ASC**, **`__name__` ASC** (legacy / other reads) **and** **`uid` ASC**, **`utcDay` DESC**, **`__name__` DESC** (statistics API loads newest rows first so passive charts stay accurate under the server document cap)

If you see `FAILED_PRECONDITION`/“requires an index”, use the link from the error or deploy with:

```bash
firebase deploy --only firestore:indexes
```

**Important:** “Host composer chars” / “detected model” / “passive host latency” are **hints for dashboards only**. They do **not** represent ChatGPT, Claude, or Gemini subscription metering and can diverge materially from exact vendor timings or token totals.

