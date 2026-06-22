#!/usr/bin/env bash
# Install Promptly Companion desktop app to /Applications and clear quarantine.
set -euo pipefail

export PROMPTLY_QUIET="${PROMPTLY_QUIET:-1}"
PROMPTLY_INSTALL_BASE="${PROMPTLY_INSTALL_BASE:-https://promptly-labs.com/install}"

if ! command -v curl >/dev/null 2>&1; then
  echo "✗ curl is required. On Mac run: xcode-select --install"
  exit 1
fi

eval "$(curl -fsSL "${PROMPTLY_INSTALL_BASE}/_install-common-mac.sh")"
if ! declare -f promptly_install_companion_mac >/dev/null 2>&1; then
  echo "✗ Failed to load install helpers from ${PROMPTLY_INSTALL_BASE}/_install-common-mac.sh"
  exit 1
fi

promptly_install_companion_mac
