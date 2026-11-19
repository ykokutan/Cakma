#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
CONF_PATH="$CLIENT_DIR/src-tauri/tauri.conf.json"

VERSION=$(node -e "console.log(require('$CONF_PATH').version)")
echo "Building Çakma v$VERSION for macOS (Universal: Apple Silicon + Intel)..."

rustup target add aarch64-apple-darwin x86_64-apple-darwin

cd "$CLIENT_DIR"
npm ci

if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "Updater signing key detected."
  npx tauri build --target universal-apple-darwin --bundles dmg,app
else
  echo "No TAURI_SIGNING_PRIVATE_KEY set; building unsigned .dmg/.app."
  npx tauri build --target universal-apple-darwin --bundles dmg,app
fi

DMG_DIR="$CLIENT_DIR/src-tauri/target/universal-apple-darwin/release/bundle/dmg"
DMG_FILE=$(ls -t "$DMG_DIR"/*.dmg 2>/dev/null | head -n 1 || true)

if [[ -n "$DMG_FILE" ]]; then
  mkdir -p "$ROOT_DIR/downloads"
  cp "$DMG_FILE" "$ROOT_DIR/downloads/Cakma-macOS-Universal.dmg"
  echo "Ready: $ROOT_DIR/downloads/Cakma-macOS-Universal.dmg"
else
  echo "Warning: .dmg not found in $DMG_DIR"
fi
