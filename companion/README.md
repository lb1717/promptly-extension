# Promptly Companion

Desktop prompt workshop for Promptly — type a draft, improve it, refine with feedback, copy into any AI app.

Connects to **https://promptly-labs.com** by default (same account/token as your IDE integration).

## Download (end users)

**https://promptly-labs.com/companion**

No Apple Developer Program required for users. The Mac build is unsigned — first launch: **Right-click → Open**.

## Install & run (developers)

```bash
cd companion
npm install
npm start
```

Uses your paired device token from `~/.promptly/credentials-cursor.json` (or claude_code / codex).

## Build installers for the website

```bash
cd companion
npm install
npm run dist:mac          # Mac .dmg + .zip → dist/
npm run copy-to-website   # copies to website/public/downloads/companion/
```

Deploy the website — files are served at `/downloads/companion/…` and linked from `/companion`.

Windows (on a Windows machine or CI):

```bash
npm run dist:win
npm run copy-to-website
```

### GitHub Releases (optional)

Tag a release to build Mac + Windows in CI:

```bash
git tag companion-v0.1.0
git push origin companion-v0.1.0
```

The download page also picks up assets from the latest GitHub release if env URLs are not set.

### Apple Developer Program?

**Not required** to host downloads on your site. It only removes macOS “unidentified developer” warnings (notarization). Unsigned builds work fine with Right-click → Open.

## Auth

- `POST /api/companion/optimize` — improve + refine
- `POST /api/companion/suggestions` — suggestion chips

Pair at [promptly-labs.com/integrations](https://promptly-labs.com/integrations) or paste a device token in Settings.

## Admin config

Templates and models: **Admin → Companion PE** on the website.

## Local backend dev

```bash
cd website && npm run dev
cd companion && npm run dev:local
```

Normal users: `npm start` (production API only).
