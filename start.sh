#!/bin/bash
# Pelican Panel Startup Wrapper for Discord & TeamSpeak Clone
export PORT=${SERVER_PORT:-4000}

echo "=========================================================="
echo "🚀 DISCORD & TEAMSPEAK PLATFORMU BAŞLATILIYOR..."
echo "🌐 Port: $PORT | IP: 0.0.0.0"
echo "=========================================================="

# Otomatik Git Güncellemesi (Eğer AUTO_UPDATE=1 ise her açılışta günceller)
if [ "$AUTO_UPDATE" = "1" ] && [ -d ".git" ]; then
  echo "🔄 Otomatik Git güncellemesi devrede..."
  git pull origin main || git pull
  cd server && npm run build && cd ..
  cd client && npm run build && cd ..
fi

# İlk çalıştırma veya eksik derleme denetimi
if [ ! -d "server/dist" ] || [ ! -d "client/dist" ]; then
  echo "🔨 İlk kurulum veya eksik dist tespit edildi, derleniyor..."
  cd server && npm install && npm run build && cd ..
  cd client && npm install && npm run build && cd ..
fi

# Ana sunucuyu çalıştır (React web arayüzünü ve Socket.IO'yu tek porttan sunar)
cd server
exec node dist/index.js