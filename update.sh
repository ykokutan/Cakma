#!/bin/bash
echo "======================================================"
echo "🔄 Discord / TeamSpeak Platformu Güncelleme Başlatıldı"
echo "======================================================"

# 1. En son kodları çek (disk şişmesini önlemek için sığ çekme + git temizliği)
if [ -d ".git" ]; then
  echo "📡 Git repository güncelleniyor (sığ çekme + temizlik)..."
  git fetch --depth 1 origin main && git reset --hard origin/main || git pull origin main || git pull
  git reflog expire --expire=now --all 2>/dev/null || true
  git gc --prune=now 2>/dev/null || true
else
  echo "ℹ️ .git dizini bulunamadı, dosya yükleme modu."
fi

# 2. Bağımlılıkları kur
echo "📦 Bağımlılıklar yükleniyor..."
cd server && npm install --no-audit --no-fund && cd ..
cd client && npm install --no-audit --no-fund
if [ "$(uname -s)" = "Linux" ]; then
  ARCH="$(uname -m)"
  ROLLUP_PKG="@rollup/rollup-linux-x64-gnu"
  ESBUILD_PKG="@esbuild/linux-x64"
  if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    ROLLUP_PKG="@rollup/rollup-linux-arm64-gnu"
    ESBUILD_PKG="@esbuild/linux-arm64"
  fi
  if [ ! -d "node_modules/$ROLLUP_PKG" ] || [ ! -d "node_modules/$ESBUILD_PKG" ]; then
    npm install --no-save --no-audit --no-fund "$ROLLUP_PKG" "$ESBUILD_PKG"
  fi
fi
cd ..
if [ -d "dedicated-server" ]; then
  cd dedicated-server && npm install --no-audit --no-fund && cd ..
fi

# 3. Projeleri derle (TypeScript & Vite Production Build)
echo "🔨 Projeler derleniyor..."
cd server && npm run build && cd ..
cd client && npm run build && cd ..
if [ -d "dedicated-server" ]; then
  cd dedicated-server && npm run build && cd ..
fi

# 4. npm önbelleğini temizle
npm cache clean --force 2>/dev/null || true

echo "======================================================"
echo "✅ GÜNCELLEME BAŞARIYLA TAMAMLANDI!"
echo "Pelican Panel üzerinden 'Restart' butonuna basabilirsiniz."
echo "======================================================"
