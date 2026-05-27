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

Sign-in opens a new browser tab at `/auth/extension` on promptly-labs.com (same account UI as the website), not a popup window. After sign-in, the tab briefly shows a success screen and returns you to the AI chat tab.

## Microsoft Edge

Same shared Chromium extension core as Chrome, with its own package for Microsoft Edge Add-ons. Edge must be tested separately because Microsoft assigns its own store/listing ID, and the website bridge may need that ID through `NEXT_PUBLIC_EDGE_EXTENSION_ID`.

```bash
bash scripts/package-extension-edge.sh
```

Load unpacked: `edge://extensions` → Developer mode → **Load unpacked** → repo root.

Publish: [Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge).

After Microsoft assigns the Edge extension ID/listing URL, set these website env vars before deploying the site:

```bash
NEXT_PUBLIC_EDGE_EXTENSION_ID=<microsoft-edge-extension-id>
NEXT_PUBLIC_EDGE_ADDONS_URL=<microsoft-edge-add-ons-listing-url>
```

## Other Chromium browsers

Brave, Opera, Vivaldi, Arc, and similar Chromium browsers use the same MV3 extension core as Chrome/Edge. Package a generic Chromium zip when a store or manual install flow needs a browser-neutral artifact:

```bash
bash scripts/package-extension-chromium.sh
```

Load unpacked from the repo root or from an extracted zip in that browser's extensions page.

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

If the Safari wrapper produces a stable extension ID/listing URL, set these website env vars before deploying the site:

```bash
NEXT_PUBLIC_SAFARI_EXTENSION_ID=<safari-extension-id>
NEXT_PUBLIC_SAFARI_EXTENSION_URL=<safari-app-or-extension-url>
```

## Desktop app + extension together

1. Install the extension in **each browser** you use for AI chat.
2. Install the **desktop app** for account/billing (optional convenience).
3. Sign in via the **Sign in** button on the Promptly tab in chat, or via the website / desktop app (same Firebase account).

Session is stored per browser profile today; cross-device sync is via the same Promptly account email on sign-in.

## Build all packages

```bash
bash scripts/package-extension-for-store.sh
bash scripts/package-extension-edge.sh
bash scripts/package-extension-chromium.sh
bash scripts/package-extension-firefox.sh
```

Safari is generated through Xcode with `xcrun safari-web-extension-converter`, not by the zip scripts above.

## Cross-browser validation checklist

Run Microsoft Edge first, then repeat the same flow in Chrome, Firefox, Safari, and the other Chromium browsers you plan to publish for:

1. Install or load the package for that browser.
2. Open ChatGPT, Claude, and Gemini.
3. Confirm the Promptly tab appears inside the AI page.
4. Sign in from the Promptly tab (opens `/auth/extension` in a new tab; returns to the AI tab when done).
5. Confirm Google sign-in and email sign-in both return to the extension.
6. Improve a prompt and confirm the API call succeeds.
7. Open/manage the account page from the extension.
8. Confirm the website session syncs back to the extension.
