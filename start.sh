#!/bin/bash
# Pelican Panel Startup Wrapper for Discord & TeamSpeak Clone
export PORT=${SERVER_PORT:-4000}
ROOT_DIR="$(pwd)"

echo "=========================================================="
echo "🚀 DISCORD & TEAMSPEAK PLATFORMU BAŞLATILIYOR..."
echo "🌐 Port: $PORT | IP: 0.0.0.0"
echo "=========================================================="

# Otomatik Git Güncellemesi (Her zaman origin/main ile zorunlu senkronize eder)
if [ "$AUTO_UPDATE" = "1" ] && [ -d ".git" ]; then
  echo "🔄 Otomatik Git güncellemesi devrede..."
  git fetch origin main
  git reset --hard origin/main
  if [ -d "$ROOT_DIR/server" ]; then
    cd "$ROOT_DIR/server" && npm run build
  fi
  if [ -d "$ROOT_DIR/client" ]; then
    cd "$ROOT_DIR/client" && npm run build
  fi
  cd "$ROOT_DIR"
fi

# İlk çalıştırma veya eksik derleme denetimi
if [ ! -d "$ROOT_DIR/server/dist" ] || [ ! -d "$ROOT_DIR/client/dist" ]; then
  echo "🔨 İlk kurulum veya eksik dist tespit edildi, derleniyor..."
  if [ -d "$ROOT_DIR/server" ]; then
    cd "$ROOT_DIR/server" && npm install && npm run build
  fi
  if [ -d "$ROOT_DIR/client" ]; then
    cd "$ROOT_DIR/client" && npm install && npm run build
  fi
  cd "$ROOT_DIR"
fi

# Ana sunucuyu çalıştır (React web arayüzünü ve Socket.IO'yu tek porttan sunar)
cd "$ROOT_DIR/server"
exec node dist/index.js