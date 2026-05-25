#!/usr/bin/env bash
# Package Promptly for Microsoft Edge Add-ons (same MV3 bundle as Chrome).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="unknown"
if command -v node >/dev/null 2>&1; then
  VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version)" 2>/dev/null || echo unknown)"
fi

OUT="${1:-$ROOT/promptly-edge-v${VERSION}.zip}"
rm -f "$OUT"
zip -r "$OUT" manifest.json content extension -x "*.DS_Store" "*.md"

echo ""
echo "=== Edge extension package (version: ${VERSION}) ==="
echo "  Output: $OUT"
echo "  Upload: Microsoft Partner Center -> Edge Add-ons"
echo "  Dev:    edge://extensions -> Developer mode -> Load unpacked (repo root) or load extracted zip"
echo "====================================================="
echo ""
unzip -l "$OUT" | head -30
