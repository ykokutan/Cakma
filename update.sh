#!/bin/bash
echo "======================================================"
echo "🔄 Discord / TeamSpeak Platformu Güncelleme Başlatıldı"
echo "======================================================"

# 1. En son kodları çek
if [ -d ".git" ]; then
  echo "📡 Git repository güncelleniyor (git pull)..."
  git pull origin main || git pull
else
  echo "ℹ️ .git dizini bulunamadı, dosya yükleme modu."
fi

# 2. Bağımlılıkları kur
echo "📦 Bağımlılıklar yükleniyor..."
cd server && npm install && cd ..
cd client && npm install && cd ..
if [ -d "dedicated-server" ]; then
  cd dedicated-server && npm install && cd ..
fi

# 3. Projeleri derle (TypeScript & Vite Production Build)
echo "🔨 Projeler derleniyor..."
cd server && npm run build && cd ..
cd client && npm run build && cd ..
if [ -d "dedicated-server" ]; then
  cd dedicated-server && npm run build && cd ..
fi

echo "======================================================"
echo "✅ GÜNCELLEME BAŞARIYLA TAMAMLANDI!"
echo "Pelican Panel üzerinden 'Restart' butonuna basabilirsiniz."
echo "======================================================"
