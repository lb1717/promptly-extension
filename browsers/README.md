# Promptly across browsers

Promptly uses one shared codebase:

| Path | Role |
|------|------|
| `content/` | In-page tab UI on ChatGPT, Claude, Gemini |
| `extension/` | Background auth, API calls, options |
| `manifest.json` | Chrome + Edge (Chromium MV3) |

The **desktop app** (`desktop/`) is only the Promptly website in a native window. The bar on AI sites always comes from a **browser extension** installed in whichever browser you use for chat.

## Chrome

Already supported. Package for the Web Store:

```bash
bash scripts/package-extension-for-store.sh
```

Load unpacked during development: `chrome://extensions` → Developer mode → Load unpacked → repo root.

## Firefox

Uses `browsers/manifest.firefox.json` (Gecko extension id, no Chrome-only `oauth2` block).

```bash
bash scripts/package-extension-firefox.sh
```

Temporary install: `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `manifest.json` from an extracted zip.

Publish: [Firefox Add-ons (AMO)](https://addons.mozilla.org/developers/).

Sign-in uses the same web popup flow as Chrome (`/auth/extension-sign-in` on promptly-labs.com), not Firefox profile Google tokens.

## Microsoft Edge

Same bundle as Chrome (Chromium WebExtensions).

```bash
bash scripts/package-extension-edge.sh
```

Load unpacked: `edge://extensions` → Developer mode → **Load unpacked** → repo root.

Publish: [Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge).

## Safari (macOS)

Safari requires an Xcode wrapper project. From repo root on macOS with Xcode:

```bash
xcrun safari-web-extension-converter . \
  --project-location safari/PromptlySafari \
  --app-name Promptly \
  --swift \
  --copy-resources \
  --force
```

Then open `safari/PromptlySafari/Promptly.xcodeproj`, set your Team signing, and run or archive for Mac App Store / direct distribution.

After conversion, enable the extension in **Safari → Settings → Extensions**. Test on ChatGPT / Claude / Gemini.

See [Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari_web_extensions) for store submission.

## Desktop app + extension together

1. Install the extension in **each browser** you use for AI chat.
2. Install the **desktop app** for account/billing (optional convenience).
3. Sign in via the **Sign in** button on the Promptly tab in chat, or via the website / desktop app (same Firebase account).

Session is stored per browser profile today; cross-device sync is via the same Promptly account email on sign-in.

## Build all packages

```bash
bash scripts/package-extension-for-store.sh
bash scripts/package-extension-firefox.sh
bash scripts/package-extension-edge.sh
```
