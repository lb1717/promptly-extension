#!/usr/bin/env bash
# Alias for setup-mac.sh — requires a pairing code.
set -euo pipefail

PROMPTLY_INSTALL_BASE="${PROMPTLY_INSTALL_BASE:-https://promptly-labs.com/install}"
CODE="${1:-${PROMPTLY_PAIR_CODE:-}}"

if [[ -z "${CODE}" ]]; then
  echo "Get a pairing code at https://promptly-labs.com/integrations, then run:"
  echo "  curl -fsSL ${PROMPTLY_INSTALL_BASE}/setup-mac.sh | bash -s -- YOUR_CODE"
  exit 1
fi

curl -fsSL "${PROMPTLY_INSTALL_BASE}/setup-mac.sh" | bash -s -- "${CODE}"
