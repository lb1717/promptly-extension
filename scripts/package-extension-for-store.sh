#!/usr/bin/env bash
# Build a Chrome Web Store–ready .zip (manifest at root; no website/worker/dev junk).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-$ROOT/promptly-extension-store.zip}"
rm -f "$OUT"
zip -r "$OUT" \
  manifest.json \
  content \
  extension \
  -x "*.DS_Store" "*.md"
echo "Wrote $OUT"
unzip -l "$OUT" | head -40
