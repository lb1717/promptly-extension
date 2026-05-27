#!/usr/bin/env bash
# Package Promptly for Microsoft Edge Add-ons (same MV3 bundle as Chrome).
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
  OUT="$ROOT/promptly-edge-v${VERSION}.zip"
fi

UPLOAD_ALIAS="$ROOT/promptly-edge-store-UPLOAD.zip"
rm -f "$OUT" "$UPLOAD_ALIAS"
zip -r "$OUT" manifest.json content extension -x "*.DS_Store" "*.md"
cp -f "$OUT" "$UPLOAD_ALIAS"

echo ""
echo "=== Edge extension package (version: ${VERSION}) ==="
echo "  Versioned:   $OUT"
echo "  Upload here: $UPLOAD_ALIAS"
echo "  Portal:      Microsoft Partner Center -> Edge Add-ons"
echo "  Dev:    edge://extensions -> Developer mode -> Load unpacked (repo root) or load extracted zip"
echo "====================================================="
echo ""
unzip -l "$OUT" | head -30
