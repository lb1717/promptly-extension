#!/usr/bin/env bash
# Package Promptly for Chromium-compatible browsers that accept Chrome-style MV3 extensions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="unknown"
if command -v node >/dev/null 2>&1; then
  VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version)" 2>/dev/null || echo unknown)"
fi

OUT="${1:-$ROOT/promptly-chromium-v${VERSION}.zip}"
rm -f "$OUT"
zip -r "$OUT" manifest.json content extension -x "*.DS_Store" "*.md"

echo ""
echo "=== Chromium-compatible extension package (version: ${VERSION}) ==="
echo "  Output: $OUT"
echo "  Targets: Brave, Opera, Vivaldi, Arc, and other Chromium browsers"
echo "  Dev:    Load unpacked from the repo root or extracted zip in the browser's extensions page"
echo "==================================================================="
echo ""
unzip -l "$OUT" | head -30
