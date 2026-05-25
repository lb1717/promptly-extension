# Promptly Desktop

Native window for [promptly-labs.com](https://promptly-labs.com) — account, billing, and settings without opening a browser tab.

The Promptly bar on ChatGPT, Claude, and Gemini still comes from the **browser extension** (Chrome, Firefox, Edge, or Safari). Install the extension for whichever browser you use to chat with AI; use this app for your Promptly account.

## Run locally

```bash
cd desktop
npm install
npm start
```

Point at local website dev server:

```bash
npm run dev
```

Override URL:

```bash
PROMPTLY_APP_URL=https://promptly-labs.com/account npm start
```

## Distribution (not configured yet)

Packaging signed `.dmg` / `.exe` installers for download from the website is a follow-up (`electron-builder`).

See [browsers/README.md](../browsers/README.md) for extension install across Chrome, Firefox, Edge, and Safari.
