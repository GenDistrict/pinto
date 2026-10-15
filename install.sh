#!/bin/sh
set -eu
PINTO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PINTO_ROOT"
if [ ! -f package-lock.json ]; then printf '%s\n' 'Download the full PINTO source repository first.' >&2; exit 1; fi
if [ "$(uname -s)" != Darwin ]; then printf '%s\n' 'This bootstrap supports macOS. On Windows use install.ps1.' >&2; exit 1; fi
PINTO_OS_VERSION=$(sw_vers -productVersion)
if ! printf '%s\n' "$PINTO_OS_VERSION" | awk -F. '{exit !($1>13 || ($1==13 && $2>=5))}'; then printf '%s\n' 'PINTO requires macOS 13.5 or later.' >&2; exit 1; fi
if command -v node >/dev/null 2>&1 && node -e 'let [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)'; then
  PINTO_NODE=$(command -v node)
else
  PINTO_VERSION=24.18.0
  PINTO_ARCH=$(uname -m)
  case "$PINTO_ARCH" in arm64) ;; x86_64) PINTO_ARCH=x64 ;; *) printf '%s\n' 'Unsupported CPU architecture.' >&2; exit 1 ;; esac
  PINTO_NAME="node-v$PINTO_VERSION-darwin-$PINTO_ARCH"
  PINTO_RUNTIME="$PINTO_ROOT/.pinto/runtime"
  PINTO_NODE="$PINTO_RUNTIME/$PINTO_NAME/bin/node"
  if [ ! -x "$PINTO_NODE" ]; then
    mkdir -p "$PINTO_RUNTIME"
    printf '%s\n' 'Preparing the local Node.js runtime...'
    curl --fail --location --retry 3 --proto '=https' "https://nodejs.org/dist/v$PINTO_VERSION/$PINTO_NAME.tar.gz" -o "$PINTO_RUNTIME/$PINTO_NAME.tar.gz"
    curl --fail --location --retry 3 --proto '=https' "https://nodejs.org/dist/v$PINTO_VERSION/SHASUMS256.txt" -o "$PINTO_RUNTIME/SHASUMS256.txt"
    PINTO_EXPECTED=$(awk -v file="$PINTO_NAME.tar.gz" '$2 == file {print $1}' "$PINTO_RUNTIME/SHASUMS256.txt")
    PINTO_ACTUAL=$(shasum -a 256 "$PINTO_RUNTIME/$PINTO_NAME.tar.gz" | awk '{print $1}')
    if [ -z "$PINTO_EXPECTED" ] || [ "$PINTO_EXPECTED" != "$PINTO_ACTUAL" ]; then printf '%s\n' 'Node.js checksum verification failed.' >&2; exit 1; fi
    tar -xzf "$PINTO_RUNTIME/$PINTO_NAME.tar.gz" -C "$PINTO_RUNTIME"
  fi
fi
PATH="$(dirname "$PINTO_NODE"):$PATH"
export PATH
electron_config_cache="$PINTO_ROOT/.pinto/electron-cache"
export electron_config_cache
npm ci --no-audit --no-fund --cache "$PINTO_ROOT/.pinto/npm-cache"
"$PINTO_NODE" node_modules/electron/install.js
npm run build
exec "$PINTO_NODE" scripts/setup.mjs "$@"
