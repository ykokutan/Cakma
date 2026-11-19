# Çakma — Discord & TeamSpeak Hibrit Platformu (`v0.3.14`)

![Version](https://img.shields.io/badge/version-0.3.14-blue?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%2019%20%7C%20TypeScript%20%7C%20Tauri%20v2%20%7C%20Node.js%20%7C%20WebRTC%20%7C%20LiveKit%20SFU-indigo?style=flat-square)
![Languages](https://img.shields.io/badge/i18n-TR%20%7C%20EN%20%7C%20DE%20%7C%20RU-emerald?style=flat-square)

**Çakma**; Discord'un modern sunucu/kanal ve sohbet deneyimini, iOS/visionOS cam (**glassmorphism**) arayüzünü ve TeamSpeak'in düşük gecikmeli ses, yayın, fısıltı (**Whisper Lists**) ve donanım kontrolü özelliklerini tek platformda birleştiren tam kapsamlı bir **masaüstü (Rust / Tauri v2)** ve **web** iletişim uygulamasıdır.

---

## 📑 İçindekiler
- [✨ Güncel Özellikler](#-güncel-özellikler)
  - [🎙️ Hibrit Ses & Yayın Mimarisi (P2P Mesh ↔ LiveKit SFU)](#-hibrit-ses--yayın-mimarisi-p2p-mesh--livekit-sfu)
  - [🖥️ Masaüstü Uygulaması, Cam Başlık Çubuğu & Oyun İçi Overlay](#️-masaüstü-uygulaması-cam-başlık-çubuğu--oyun-içi-overlay)
  - [🔊 Stüdyo Ses, Kişiye Özel EQ, HDR Yayın & PiP](#-stüdyo-ses-kişiye-özel-eq-hdr-yayın--pip)
  - [🎵 Müzik Botu, Audio Ducking & Ortak Etkinlikler](#-müzik-botu-audio-ducking--ortak-etkinlikler)
  - [💬 Sohbet, DM Okundu Bilgisi & Topluluk](#-sohbet-dm-okundu-bilgisi--topluluk)
  - [📞 1-e-1 Direkt Görüşme & Uzaktan Yardım](#-1-e-1-direkt-görüşme--uzaktan-yardım)
  - [🎨 12 Arayüz Teması (8 Koyu + 4 Açık), Profil & Çoklu Dil (i18n)](#-12-arayüz-teması-8-koyu--4-açık-profil--çoklu-dil-i18n)
  - [🔒 Güvenlik, Moderasyon, Şifreli Yedekler & Ağ Teşhisi](#-güvenlik-moderasyon-şifreli-yedekler--ağ-teşhisi)
- [📖 Hızlı Kullanım Rehberi](#-hızlı-kullanım-rehberi)
- [🛠️ Kurulum, Test & Geliştirme](#️-kurulum-test--geliştirme)
- [📦 Masaüstü Sürümü Derleme (Release)](#-masaüstü-sürümü-derleme-release)
- [📂 Proje Dizin Yapısı](#-proje-dizin-yapısı)

---

## ✨ Güncel Özellikler

### 🎙️ Hibrit Ses & Yayın Mimarisi (P2P Mesh ↔ LiveKit SFU)
- **Akıllı Hibrit Geçiş:** Küçük odalar düşük gecikmeli **P2P Mesh** üzerinden akarken, kalabalık odalar belirlenen katılımcı eşiğine (varsayılan `6` kişi) ulaştığında otomatik olarak merkezi **LiveKit SFU** sunucusuna geçer.
- **Sunucu Bazlı Mimari Seçimi ([ServerSettingsModal](file:///c:/Users/ykoku/Documents/discord%20%C3%A7akma/client/src/components/ServerSettingsModal.tsx)):** Her sunucu için **Otomatik (Hibrit)**, **Her Zaman P2P Mesh** veya **Her Zaman LiveKit SFU** seçilebilir.
- **Sistem Yönetimi & Canlı Durum ([AdminDashboardModal](file:///c:/Users/ykoku/Documents/discord%20%C3%A7akma/client/src/components/AdminDashboardModal.tsx)):** LiveKit SFU açma/kapama, geçiş eşiği (`2–30`), opsiyonel harici URL / API Key / Secret ve canlı **`● Aktif & Erişilebilir`** durum göstergesi.
- **Otomatik Linux/Pelican Kurulumu ([start.sh](file:///c:/Users/ykoku/Documents/discord%20%C3%A7akma/start.sh)):** Başlangıçta en güncel `livekit-server` sürümünü otomatik indirir, `data/.livekit-secrets` ve `data/livekit.yaml` dosyalarını oluşturup başlatır ve `/livekit` WebSocket proxy'si üzerinden tek porttan sunar.

### 🖥️ Masaüstü Uygulaması, Cam Başlık Çubuğu & Oyun İçi Overlay
- **Windows & macOS Desteği (Rust / Tauri v2):** Windows (`x64-setup.exe` / `.msi`) ve macOS (`Universal .dmg` — Apple Silicon & Intel) için yerel masaüstü derlemesi.
- **Özel Cam Pencere Başlık Çubuğu:** Temaya uyumlu glassmorphism üst pencere çubuğu, aktif sunucu/kanal göstergesi, `Ctrl + K` Hızlı Geçiş ve canlı ping rozeti.
- **Gelişmiş Oyun İçi Konuşanlar Overlay'i:**
  - Çerçevesiz, gerçek cam saydamlıklı (`%20–%100`) ve anti-cheat güvenli (DLL enjeksiyonu olmadan ayrı pencere tabanlı) konuşanlar penceresi.
  - **Köşe Konumu** (Sol Üst / Sağ Üst / Sol Alt / Sağ Alt), **Boyut** (Kompakt / Standart / Geniş), **Yalnızca Konuşanları Göster**, **Hızlı Kontrol Çubuğu**, **Canlı Ping (ms)** ve canlı önizlemeli ayrı Overlay ayar sekmesi.
  - `Ctrl + Shift + O` ile **Tıklama Geçirgenliği (Click-Through / Kilit)** açılıp kapatılabilir.
- **Genişletilmiş Otomatik Oyun Algılama (Rich Presence):** VALORANT, CS2, LoL, GTA V, FiveM, Minecraft, Fortnite, Marvel Rivals, Path of Exile 2, WoW, CoD, Battlefield, Forza, Valheim, DayZ ve 40+ popüler oyun otomatik algılanır.
- **Sistem Tepsisi & Global Kısayollar:** Pencere kapatıldığında tepsiye küçülür; oyun içindeyken `Ctrl + Shift + M` (Mikrofon) ve `Ctrl + Shift + D` (Kulaklık) kısayolları çalışır.
- **İmzalı Otomatik Güncelleme:** Açılışta `latest.json` üzerinden yeni sürüm kontrolü ve tek tıkla güncelleme desteği.

### 🔊 Stüdyo Ses, Kişiye Özel EQ, HDR Yayın & PiP
- **Stüdyo Ses DSP Zinciri:** `48 kHz` örnekleme, `80 Hz` uğultu filtresi (high-pass), Compressor DSP, `20 ms` düşük gecikmeli tampon, **64–384 kbps Opus** kanal/sunucu bazlı bitrate ve kişi limiti.
- **Kişiye Özel EQ & Normalize:** Ses odasındaki kullanıcıların sağ tık menüsünde kişi bazlı ses seviyesi (`%0–%200`), **Bas/Tiz EQ**, **Ses Normalizasyonu** ve yerel susturma.
- **Sunucu Susturma & Toplantı Modu:** Yetkililer odadaki tüm katılımcıları tek tıkla susturup açabilir.
- **10-bit AV1/VP9 HDR Yayın & İzleyici Kontrolü:** Yayın öncesi çözünürlük (`360p – Source`), FPS (`5 / 30 / 60`), HDR modu, gizlilik ve izleyici limiti seçimi; izleyici tarafında özel kalite (`Oto/Kaynak/1080p/720p/480p/360p`), canlı FPS/bitrate/istatistik kartı ve lazer işaretçi.
- **Çoklu Yayın Geçişi & Mini PiP:** Aynı odada birden fazla yayın arasında anlık geçiş ve başka kanala geçildiğinde sağ altta yüzen **Mini PiP (Picture-in-Picture)** penceresi (*Odaya Dön*, *Küçült*, *Kapat*).
- **Ses Odası İçi Yazılı Sohbet ("Oda Sohbeti"):** Ses odasından çıkmadan sağdan açılan yan çekmece üzerinden odaya özel mesajlaşma.
- **Whisper Lists (Fısıltı Listeleri), El Kaldırma & Otomatik AFK Taşıyıcı.**

### 🎵 Müzik Botu, Audio Ducking & Ortak Etkinlikler
- **Radyo & YouTube Botu:** Resmi YouTube IFrame API ve canlı SomaFM radyo istasyonlarıyla senkronize müzik dinleme.
- **Audio Ducking (`%10–%70`):** Odadaki katılımcılardan biri konuştuğunda Radyo/YouTube ses seviyesi otomatik olarak kısılır; konuşma bitince eski haline döner.
- **Birlikte İzle (Watch Together), Ortak Çizim (Whiteboard) & Mini Oyunlar.**

### 💬 Sohbet, DM Okundu Bilgisi & Topluluk
- **DM Okundu Bilgisi (`✓✓ Görüldü`) & E2EE DM:** Direkt mesajlarda canlı okundu bilgisi ve uçtan uca şifreli DM desteği.
- **"Yeni Mesajlar" Ayırıcı Çizgisi & Çevrimdışı Kuyruk:** Okunmamış mesaj çizgisi ve bağlantı kesintisinde otomatik yeniden gönderim kuyruğu.
- **Zengin Mesajlaşma:** Yanıtlama, alt konular (Threads), **Sesli Notlar** (`1x / 1.5x / 2x` hız + dalga formu), kod blokları, görsel lightbox, anketler, yer imleri, hatırlatıcılar, **GIPHY API / yerleşik GIF galerisi** ve sabitlenmiş mesajlar.
- **Sunucu Şablonları:** **🎮 Oyun Topluluğu**, **☕ Arkadaş Grubu**, **💼 Çalışma / Ekip** veya **📄 Boş Sunucu** şablonlarıyla tek tıkla kurulum.

### 📞 1-e-1 Direkt Görüşme & Uzaktan Yardım
- **1-e-1 Görüşme Sahnesi:** Daraltılıp genişletilebilen çağrı sahnesi, çoklu oturum zil sesi ve ekran paylaşımı.
- **Uzaktan Masaüstü Kontrolü (TeamViewer Tarzı):** İzinli fare/klavye kontrolü, hızlı sistem kısayol çubuğu ve Türkçe Q ekran klavyesi.

### 🎨 12 Arayüz Teması (8 Koyu + 4 Açık), Profil & Çoklu Dil (i18n)
- **8 Koyu Tema:** Vision Dark, Midnight Blue, Cyber Emerald, Amber Gold, Crimson Rose, Royal Violet, Nordic Frost, OLED Siyah.
- **4 Açık Renkli Tema:** **İnci Beyazı**, **Gündüz Mavisi**, **Sıcak Kum**, **Nane Esintisi** — uyarlanabilir açık cam yüzeyi ve yüksek kontrastlı metin desteğiyle.
- **Ayarlar İçi Hızlı Arama & Varlık Yönetimi:** DND bildirim susturma, 10 dk otomatik Boşta (Idle) modu, özel durum süresi (*Süresiz / 30 Dakika / 1 Saat / 4 Saat / Bugün Sonu*) ve tıklanabilir rozet açıklamaları.
- **Çoklu Dil (i18n):** Anlık **Türkçe (TR)**, **English (EN)**, **Deutsch (DE)** ve **Русский (RU)** desteği.

### 🔒 Güvenlik, Moderasyon, Şifreli Yedekler & Ağ Teşhisi
- **Güçlendirilmiş Kimlik & Oturum Güvenliği:** Web için `HttpOnly` cookie oturumu, sıkılaştırılmış CSP, davet kodlu kayıt, anti-bot doğrulaması, 6 haneli **E-posta OTP**, isteğe bağlı **2FA (TOTP)**, yeni IP giriş uyarısı ve aktif oturum yönetimi.
- **Şifreli Sunucu Yedekleri & Güvenlik Denetimi:** Rastgele kalıcı sunucu anahtarları, **AES-256-GCM** şifreli otomatik yedekleme ve Yönetim Paneli içinde canlı **Güvenlik Denetimi Skoru**.
- **Gelişmiş AutoMod, Rol İzin Matrisi & Audit Logs:** Link/kelime filtresi, zaman aşımı (timeout), IP/hesap ban ve denetim kayıtları.
- **Anlık Ağ Teşhisi & Dedicated Server:** 1 saniyelik canlı RTT (Ping), Jitter, Paket Kaybı (%) grafiği ve lisans korumalı bağımsız sunucu paketi (`dedicated-server/`).

---

## 📖 Hızlı Kullanım Rehberi

1. **Hesap & Güvenlik:** Kaydolun veya giriş yapın; **⚙️ Ayarlar → Gizlilik & Güvenlik** sekmesinden 2FA'yı etkinleştirip aktif oturumlarınızı yönetebilirsiniz.
2. **Tema & Görünüm:** **⚙️ Ayarlar → Görünüm** sekmesinden 8 koyu ve 4 açık tema arasında anlık geçiş yapabilirsiniz.
3. **Sunucu & LiveKit SFU:** Sol menüdeki **`+`** butonuyla şablon seçerek sunucu kurabilir; **Sunucu Ayarları → Ses Kalitesi & WebRTC** altından **Otomatik (Hibrit) / P2P / LiveKit SFU** modunu belirleyebilirsiniz.
4. **Ses Odası & Overlay:** Ses odasına bağlandıktan sonra alt bardan mikrofon/kulaklık, **Ekran Paylaş (HDR)**, **Oda Sohbeti**, **Ducking** ve **Overlay** ayarlarını yönetebilirsiniz (`Ctrl + Shift + O` ile overlay kilidi).
5. **Ağ Teşhisi:** Üst bardaki veya ses panelindeki **ms** göstergesine tıklayarak canlı bağlantı kalitenizi izleyebilirsiniz.

---

## 🛠️ Kurulum, Test & Geliştirme

### Gereksinimler
- **Node.js 20+**
- Masaüstü derlemesi için: **Rust (`rustup` + `cargo`)** ve Windows WebView2

### Komutlar
- **Sunucu Derleme (`tsc`):**
  ```bash
  npm --prefix server run build
  ```
- **İstemci Testleri (Vitest):**
  ```bash
  npm --prefix client test
  ```
- **İstemci Derleme (`tsc && vite build`):**
  ```bash
  npm --prefix client run build
  ```
- **Geliştirme Modu (Windows):**
  - Web: `start-web.bat` (`http://localhost:5173` & `http://localhost:4000`)
  - Masaüstü (Tauri Dev): `start-desktop.bat`
  - Dedicated Sunucu: `dedicated-server\start-dedicated-server.bat`
- **Üretim Modu (Linux / Pelican — LiveKit Dahil Tek Port):**
  ```bash
  bash start.sh
  ```

---

## 📦 Masaüstü Sürümü Derleme (Release)

`client/src-tauri/tauri.conf.json` içindeki `version` numarasını yükselttikten sonra:

- **Yerel Windows Installer (`.exe` & `.msi`):**
  ```bash
  npm --prefix client run tauri build
  ```
- **İmzalı Release + Updater Artefaktı (Windows):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File "scripts/release-desktop.ps1"
  ```
  *(Not: OTA güncelleme imzası için `TAURI_SIGNING_PRIVATE_KEY` ortam değişkeninin tanımlı olması gerekir.)*
- **macOS (Universal `.dmg`):**
  ```bash
  bash scripts/release-macos.sh
  ```

---

## 📂 Proje Dizin Yapısı

```text
discord-cakma/
├── downloads/                             # Masaüstü kurulum (.exe) & updater manifest (latest.json)
├── server/                                # Node.js + Express + Socket.io Backend + LiveKit Proxy
│   └── src/
│       ├── index.ts                       # Auth, 2FA, HttpOnly Cookie, AutoMod, LiveKit SFU, WebRTC
│       ├── storage.ts                     # JSON/AES-256-GCM Kalıcı Depolama & Sistem Ayarları
│       ├── licenseGenerator.ts            # HMAC-SHA256 Lisans Üretici
│       └── types.ts                       # Sunucu veri modelleri
├── client/                                # React 19 + TypeScript + Tailwind + Tauri v2
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthModal.tsx              # Giriş, Kayıt, E-posta OTP & 2FA doğrulama
│   │   │   ├── ChannelSidebar.tsx         # Kanallar, DM listesi & sürükle-bırak oda taşıma
│   │   │   ├── ChatArea.tsx               # Sohbet, DM okundu bilgisi, Yeni Mesajlar çizgisi, sesli not
│   │   │   ├── CreateServerModal.tsx      # Şablonlu sunucu oluşturma, davet önizleme & Dedicated IP
│   │   │   ├── DirectCallModal.tsx        # 1-e-1 arama kartı & zil sesi
│   │   │   ├── MiniScreenSharePiP.tsx     # Ses odası dışı yüzen mini ekran paylaşımı (PiP)
│   │   │   ├── RemoteAssistModal.tsx      # Uzaktan yardım, kısayollar & ekran klavyesi
│   │   │   ├── VoiceRoomArea.tsx          # Ses odası, LiveKit SFU/P2P rozeti, HDR yayın, Oda Sohbeti
│   │   │   ├── VoiceRadioWidget.tsx       # YouTube IFrame API, SomaFM Radyo Botu & Audio Ducking
│   │   │   ├── SpeakersOverlay.tsx        # Oyun içi cam saydam konuşanlar overlay penceresi
│   │   │   ├── UserProfileModal.tsx       # Profil, tıklanabilir rozetler, durum süresi & bakiye
│   │   │   ├── MemberList.tsx             # Çevrimiçi/Çevrimdışı üye listesi
│   │   │   ├── ConnectionDiagnosticsModal.tsx # Canlı 1s RTT/Jitter/Paket Kaybı teşhisi
│   │   │   ├── SettingsModal.tsx          # 12 Tema, Ayarlar Arama, Overlay, 2FA, Dil seçimi
│   │   │   ├── ServerSettingsModal.tsx    # Ses Bitrate, SFU/P2P Modu, Roller, AutoMod, AFK
│   │   │   └── AdminDashboardModal.tsx    # Sistem Yönetimi, LiveKit SFU Durumu & Güvenlik Denetimi
│   │   ├── utils/
│   │   │   ├── i18n.ts                    # Çoklu dil sözlüğü (TR / EN / DE / RU)
│   │   │   ├── statusExpiry.ts            # Özel durum süresi hesaplama yardımcıları
│   │   │   └── __tests__/                 # Vitest birim testleri
│   │   ├── index.css                      # Koyu & Açık tema cam stilleri
│   │   └── context/SocketContext.tsx      # WebRTC Mesh, LiveKit SFU, DSP, DND & Tauri Bridge
│   └── src-tauri/                         # Rust Tauri v2 (Tray, Global Shortcut, Overlay, Game Detect)
├── dedicated-server/                      # Lisanslı bağımsız ses & sohbet sunucusu
├── scripts/release-desktop.ps1            # İmzalı masaüstü kurulum & updater paketi üretici
└── start.sh                               # Üretim başlatıcısı (git pull + build + LiveKit + server)
```
