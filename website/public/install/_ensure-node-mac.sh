# Promptly install helper — source via: eval "$(curl -fsSL .../_ensure-node-mac.sh)"
# Provides: ensure_curl_mac, ensure_unzip_mac, ensure_node_mac

if ! declare -f promptly_is_quiet >/dev/null 2>&1; then
  promptly_is_quiet() { [[ "${PROMPTLY_QUIET:-}" == "1" ]]; }
  promptly_detail() { promptly_is_quiet && return; echo "$@"; }
  promptly_ok() { echo "✓ $1"; }
fi

ensure_curl_mac() {
  if command -v curl >/dev/null 2>&1; then
    return 0
  fi
  echo "✗ curl is required but not found."
  echo "  On Mac, run: xcode-select --install"
  exit 1
}

ensure_unzip_mac() {
  if command -v unzip >/dev/null 2>&1; then
    return 0
  fi
  echo "✗ unzip is required but not found."
  echo "  On Mac, run: xcode-select --install"
  exit 1
}

_promptly_install_node_tarball_mac() {
  local version="20.18.1"
  local arch arch_label folder dest url
  arch="$(uname -m)"
  case "$arch" in
    arm64 | aarch64) arch_label="arm64" ;;
    x86_64) arch_label="x64" ;;
    *)
      echo "✗ Unsupported Mac architecture: $arch"
      return 1
      ;;
  esac
  folder="node-v${version}-darwin-${arch_label}"
  dest="${HOME}/.promptly/node"
  url="https://nodejs.org/dist/v${version}/${folder}.tar.gz"
  echo "  Downloading Node.js ${version} for macOS (${arch_label})…"
  mkdir -p "${dest}"
  curl -fsSL "$url" | tar -xz -C "${dest}"
  export PATH="${dest}/${folder}/bin:${PATH}"
  local path_line="export PATH=\"${dest}/${folder}/bin:\$PATH\""
  local profile="${HOME}/.zprofile"
  touch "$profile"
  if ! grep -qF "${dest}/${folder}/bin" "$profile" 2>/dev/null; then
    {
      echo ""
      echo "# Promptly install — Node.js"
      echo "$path_line"
    } >>"$profile"
  fi
}

ensure_node_mac() {
  promptly_detail "→ Checking Node.js…"
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "parseInt(process.versions.node.split('.')[0], 10)" 2>/dev/null || echo 0)"
    if [[ "$major" -ge 18 ]]; then
      promptly_detail "$(node --version)"
      if ! command -v npm >/dev/null 2>&1; then
        echo "✗ npm not found. Reinstall Node.js from https://nodejs.org/"
        exit 1
      fi
      if ! node -e "process.exit(0)" >/dev/null 2>&1; then
        echo "✗ Node.js found but not runnable — close Terminal, reopen, and retry."
        exit 1
      fi
      promptly_is_quiet && promptly_ok "Node.js ready" || echo "✓ Node.js OK"
      return 0
    fi
    promptly_detail "  Found Node $(node --version) — need v18 or newer."
  else
    promptly_detail "  Node.js not found on this Mac."
  fi

  promptly_detail "→ Installing Node.js (required for Promptly hooks)…"

  if command -v brew >/dev/null 2>&1; then
    echo "  Trying Homebrew…"
    if brew install node@20 2>/dev/null || brew install node; then
      brew link --overwrite --force node@20 2>/dev/null || brew link --overwrite node 2>/dev/null || true
      hash -r 2>/dev/null || true
    fi
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "  Trying official Node.js binary (no Homebrew needed)…"
    _promptly_install_node_tarball_mac || true
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo "✗ Could not install Node.js automatically."
    echo "  1. Install Node.js 20 LTS from https://nodejs.org/"
    echo "  2. Close and reopen Terminal"
    echo "  3. Rerun the Promptly install command"
    if command -v open >/dev/null 2>&1; then
      open "https://nodejs.org/" 2>/dev/null || true
    fi
    exit 1
  fi

  local major_after
  major_after="$(node -p "parseInt(process.versions.node.split('.')[0], 10)" 2>/dev/null || echo 0)"
  if [[ "$major_after" -lt 18 ]]; then
    echo "✗ Node.js $(node --version) is still too old. Install v18+ from https://nodejs.org/"
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "✗ npm not found after Node.js install."
    exit 1
  fi

  promptly_detail "$(node --version)"
  if ! node -e "process.exit(0)" >/dev/null 2>&1; then
    echo "✗ Node.js installed but not runnable — close Terminal, reopen, and retry."
    exit 1
  fi
  promptly_is_quiet && promptly_ok "Node.js ready" || echo "✓ Node.js OK"
}
