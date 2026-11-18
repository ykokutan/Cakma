#!/bin/bash
# Pelican Panel Startup Wrapper for Discord & TeamSpeak Clone
export PORT=${SERVER_PORT:-4000}
ROOT_DIR="$(pwd)"

echo "=========================================================="
echo "🚀 DISCORD & TEAMSPEAK PLATFORMU BAŞLATILIYOR..."
echo "🌐 Port: $PORT | IP: 0.0.0.0"
echo "=========================================================="

# Otomatik Git Güncellemesi (Her zaman origin/main ile zorunlu senkronize eder ve disk şişmesini önler)
if [ "$AUTO_UPDATE" = "1" ] && [ -d ".git" ]; then
  echo "🔄 Otomatik Git güncellemesi devrede (sığ çekme + temizlik)..."
  git fetch --depth 1 origin main
  git reset --hard origin/main
  git reflog expire --expire=now --all 2>/dev/null || true
  git gc --prune=now 2>/dev/null || true
  if [ -d "$ROOT_DIR/server" ]; then
    cd "$ROOT_DIR/server" && npm install --no-audit --no-fund && npm run build
  fi
  if [ -d "$ROOT_DIR/client" ]; then
    cd "$ROOT_DIR/client" && npm install --no-audit --no-fund && npm run build
  fi
  npm cache clean --force 2>/dev/null || true
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

# Otomatik LiveKit SFU Kurulumu & Başlatma (Hibrit P2P <-> SFU)
if [ "${ENABLE_LIVEKIT:-1}" = "1" ]; then
  mkdir -p "$ROOT_DIR/bin" "$ROOT_DIR/data"
  LK_BIN="$ROOT_DIR/bin/livekit-server"
  LK_SECRETS="$ROOT_DIR/data/.livekit-secrets"

  if [ ! -x "$LK_BIN" ]; then
    ARCH="$(uname -m)"
    LK_ARCH="amd64"
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
      LK_ARCH="arm64"
    fi
    LK_VER=""
    if command -v curl >/dev/null 2>&1; then
      LK_VER="$(curl -fsSL "https://api.github.com/repos/livekit/livekit/releases/latest" 2>/dev/null | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -n 1)"
    fi
    LK_VER="${LK_VER:-1.13.11}"
    LK_URL="https://github.com/livekit/livekit/releases/download/v${LK_VER}/livekit_${LK_VER}_linux_${LK_ARCH}.tar.gz"
    echo "📡 LiveKit SFU indiriliyor (v${LK_VER} - ${LK_ARCH})..."
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$LK_URL" -o "/tmp/livekit.tar.gz" && tar -xzf "/tmp/livekit.tar.gz" -C "$ROOT_DIR/bin" livekit-server && chmod +x "$LK_BIN" && rm -f "/tmp/livekit.tar.gz" || echo "⚠️ LiveKit indirilemedi, P2P Mesh modu aktif kalacak."
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "/tmp/livekit.tar.gz" "$LK_URL" && tar -xzf "/tmp/livekit.tar.gz" -C "$ROOT_DIR/bin" livekit-server && chmod +x "$LK_BIN" && rm -f "/tmp/livekit.tar.gz" || echo "⚠️ LiveKit indirilemedi, P2P Mesh modu aktif kalacak."
    fi
  fi

  if [ -x "$LK_BIN" ]; then
    if [ -z "$LIVEKIT_API_KEY" ] || [ -z "$LIVEKIT_API_SECRET" ]; then
      if [ -f "$LK_SECRETS" ]; then
        . "$LK_SECRETS"
      else
        LIVEKIT_API_KEY="lk_$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        LIVEKIT_API_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        printf 'LIVEKIT_API_KEY="%s"\nLIVEKIT_API_SECRET="%s"\n' "$LIVEKIT_API_KEY" "$LIVEKIT_API_SECRET" > "$LK_SECRETS"
        chmod 600 "$LK_SECRETS" 2>/dev/null || true
      fi
    fi
    export LIVEKIT_URL="http://127.0.0.1:7880"
    export LIVEKIT_API_KEY
    export LIVEKIT_API_SECRET
    echo "🎙️ LiveKit SFU başlatılıyor (127.0.0.1:7880, Hibrit eşik: ${SFU_THRESHOLD:-6} kişi)..."
    "$LK_BIN" --keys "${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}" --port 7880 --bind 127.0.0.1 --rtc-tcp-port 7881 --rtc-port-range-start 50000 --rtc-port-range-end 50100 >"$ROOT_DIR/data/livekit.log" 2>&1 &
  fi
fi

# Ana sunucuyu çalıştır (React web arayüzünü ve Socket.IO'yu tek porttan sunar)
cd "$ROOT_DIR/server"
exec node dist/index.js
