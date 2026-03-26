# Promptly Secure Auto-Adjust

Promptly now includes:
- A **Manifest V3 extension** UI with `Auto adjust` and `Undo`.
- A **website-hosted API backend** that securely calls OpenAI for prompt optimization.
- Firebase-backed auth, Firestore usage tracking, and extension-safe provider key handling.

## Architecture

```text
Chrome Extension (no provider keys)
   -> POST /api/optimize (Website backend)
      -> OpenAI
```

## Setup Checklist (from zero)

```text
1) Cloudflare signup + docs
   - https://dash.cloudflare.com/sign-up
   - https://developers.cloudflare.com/workers/
   - https://developers.cloudflare.com/workers/wrangler/
   - https://developers.cloudflare.com/workers/configuration/secrets/

2) LLM provider signup
   DeepSeek (cheapest practical):
   - https://platform.deepseek.com/
   - https://platform.deepseek.com/api_keys

   OpenAI (reliable mainstream):
   - https://platform.openai.com/signup
   - https://platform.openai.com/api-keys
   - https://platform.openai.com/docs/quickstart

   Optional Mistral:
   - https://console.mistral.ai/

3) Local tooling
   - Install Node.js LTS: https://nodejs.org/
   - npm install in worker folder
   - npx wrangler login
```

## Project Tree

```text
content/                        # existing content overlay
extension/
  popup.html
  popup.js
  popup.css
  options.html
  options.js
  options.css
worker/
  package.json
  wrangler.toml
  src/
    index.js
    auth.js
    cors.js
    jsonSafe.js
    optimize.js
    providers.js
    rateLimiter.js
manifest.json
```

## Worker Setup

### 1) Install + login

```bash
cd worker
npm install
npx wrangler login
```

### 2) Create KV namespaces

```bash
npx wrangler kv:namespace create USER_KEYS
npx wrangler kv:namespace create USER_KEYS --preview
npx wrangler kv:namespace create USAGE_KV
npx wrangler kv:namespace create USAGE_KV --preview
```

Paste returned IDs into `worker/wrangler.toml`.

### 3) Create secrets

```bash
npx wrangler secret put PROVIDER_API_KEY
npx wrangler secret put USER_KEY_SALT
npx wrangler secret put ADMIN_TOKEN
```

### 4) Set non-secret vars in `worker/wrangler.toml`

Add under `[vars]`:

```toml
[vars]
PROVIDER = "deepseek" # or "openai" or "mistral"
OPENAI_MODEL = "gpt-5-nano"
# All optimize paths (Improve, auto-on-send, Generate Prompt) use OPENAI_REWRITE_MODEL.
OPENAI_REWRITE_MODEL = "gpt-5-nano"
OPENAI_REWRITE_TIMEOUT_MS = "10000"
DEEPSEEK_MODEL = "deepseek-chat"
MISTRAL_MODEL = "mistral-small-latest"
DEBUG_LOGS = "false"
ALLOWED_ORIGINS = "chrome-extension://REPLACE_WITH_EXTENSION_ID,http://localhost:5173"
```

## Create/Revoke User API Keys

Use admin endpoints (server-side protected by `x-admin-token`).

### Create key

```bash
curl -X POST "https://YOUR_WORKER.workers.dev/admin/keys/create" \
  -H "Origin: chrome-extension://REPLACE_WITH_EXTENSION_ID" \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"my-first-user"}'
```

Store returned `apiKey` in extension options.

### Revoke key

```bash
curl -X POST "https://YOUR_WORKER.workers.dev/admin/keys/revoke" \
  -H "Origin: chrome-extension://REPLACE_WITH_EXTENSION_ID" \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"api_key":"prmpt_xxx"}'
```

## Run Locally

```bash
cd worker
npx wrangler dev
```

Local endpoint: `http://127.0.0.1:8787/optimize`

## Deploy

```bash
cd worker
npx wrangler deploy
```

Copy deployed URL into extension options as `proxyBaseUrl`.

## Extension Setup

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked this repo folder.
4. Open extension options page:
   - Set `proxyBaseUrl` (your Worker URL)
   - Set `userApiKey` (generated from admin endpoint)
5. Open extension popup and test `Auto adjust`.

## Test Commands

### Health

```bash
curl "https://YOUR_WORKER.workers.dev/health" \
  -H "Origin: chrome-extension://REPLACE_WITH_EXTENSION_ID"
```

### Optimize

```bash
curl -X POST "https://YOUR_WORKER.workers.dev/optimize" \
  -H "Origin: chrome-extension://REPLACE_WITH_EXTENSION_ID" \
  -H "Authorization: Bearer prmpt_xxx" \
  -H "x-promptly-client: promptly-extension" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Write a launch email for a new product feature."}'
```

## Security & Threat Model

### Key risks
- Extension code is recoverable by attackers.
- Browser traffic can be replayed or scripted if endpoints are weak.
- Prompt payloads can contain adversarial text (prompt injection).
- High-volume abuse can create cost spikes.

### Mitigations implemented
- No provider API keys in extension.
- Provider key only in Worker secret (`PROVIDER_API_KEY`).
- Per-user API keys are **hashed with salt** in KV.
- Strict CORS allowlist (`ALLOWED_ORIGINS`).
- Required client header (`x-promptly-client`).
- Auth required for `/optimize`.
- Rate limiting:
  - User key: 30/min + 120/hour
  - IP: 60/min
- Prompt size guardrails:
  - max 12,000 chars
  - token estimate hard-stop
- Provider timeout.
- Metadata-only logging by default (no full prompt logging).
- JSON-only model output with safe parsing and normalization fallback.

### Limitations
- If a user API key leaks, attacker can call proxy until key revoked.
- CORS is not auth; it is defense-in-depth. Authorization is still required.
- Model output quality varies by provider/model.

## Key Rotation

1. Create new user key via admin endpoint.
2. Update extension options with new key.
3. Revoke old key.
4. If provider key compromised: rotate `PROVIDER_API_KEY` secret with Wrangler.
