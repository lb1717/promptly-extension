#!/usr/bin/env bash
# Build a Chrome Web Store–ready .zip (manifest at root; no website/worker/dev junk).
# Default output: promptly-chrome-store-v<manifest-version>.zip at repo root, plus
# promptly-chrome-store-UPLOAD.zip (same bytes) so the upload path is always obvious.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="unknown"
if command -v node >/dev/null 2>&1; then
  VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version)" 2>/dev/null || echo unknown)"
fi

if [[ -n "${1:-}" ]]; then
  OUT="$1"
else
  OUT="$ROOT/promptly-chrome-store-v${VERSION}.zip"
fi

UPLOAD_ALIAS="$ROOT/promptly-chrome-store-UPLOAD.zip"
rm -f "$OUT" "$UPLOAD_ALIAS"
zip -r "$OUT" \
  manifest.json \
  content \
  extension \
  -x "*.DS_Store" "*.md"
cp -f "$OUT" "$UPLOAD_ALIAS"

echo ""
echo "=== Chrome Web Store package (manifest version: ${VERSION}) ==="
echo "  Versioned:    $OUT"
echo "  Upload here:  $UPLOAD_ALIAS"
echo "================================================================"
echo ""
unzip -l "$OUT" | head -40
