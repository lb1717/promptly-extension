#!/usr/bin/env bash
# Package Promptly for Firefox Add-ons (temporary add-on / AMO upload).
# Uses browsers/manifest.firefox.json (Gecko id + background.scripts for compatibility).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="unknown"
if command -v node >/dev/null 2>&1; then
  VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('browsers/manifest.firefox.json','utf8')).version)" 2>/dev/null || echo unknown)"
fi

OUT="${1:-$ROOT/promptly-firefox-v${VERSION}.zip}"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

cp browsers/manifest.firefox.json "$STAGING/manifest.json"
cp -R content extension "$STAGING/"

rm -f "$OUT"
(
  cd "$STAGING"
  zip -r "$OUT" manifest.json content extension -x "*.DS_Store" "*.md"
)

echo ""
echo "=== Firefox extension package (version: ${VERSION}) ==="
echo "  Output: $OUT"
echo "  Load:   about:debugging -> This Firefox -> Load Temporary Add-on -> pick manifest.json inside zip (or unzip first)"
echo "=========================================================="
echo ""
unzip -l "$OUT" | head -30
