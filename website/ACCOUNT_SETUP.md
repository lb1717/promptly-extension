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

The website admin dashboard now reads from Firestore-backed website routes instead of Worker KV.
