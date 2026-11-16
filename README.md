# Çakma — Discord & TeamSpeak Hibrit Platformu (`v0.3.11`)

![Version](https://img.shields.io/badge/version-0.3.11-blue?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%2019%20%7C%20TypeScript%20%7C%20Tauri%20v2%20%7C%20Node.js%20%7C%20WebRTC-indigo?style=flat-square)
![Languages](https://img.shields.io/badge/i18n-TR%20%7C%20EN%20%7C%20DE%20%7C%20RU-emerald?style=flat-square)

**Çakma**; Discord'un modern sunucu/kanal ve sohbet deneyimini, iOS/visionOS cam (**glassmorphism**) arayüzünü ve TeamSpeak'in düşük gecikmeli ses, yayın, fısıltı (**Whisper Lists**) ve donanım kontrolü özelliklerini tek platformda birleştiren tam kapsamlı bir **masaüstü (Rust / Tauri v2)** ve **web** iletişim uygulamasıdır.

---

## 📑 İçindekiler
- [✨ Güncel Özellikler](#-güncel-özellikler)
  - [🖥️ Masaüstü Uygulaması & Oyun İçi Overlay](#️-masaüstü-uygulaması--oyun-içi-overlay)
  - [🎙️ Ses Odaları, Yayın, PiP & TeamSpeak Özellikleri](#️-ses-odaları-yayın-pip--teamspeak-özellikleri)
  - [🎵 Müzik Botu, Audio Ducking & Ortak Etkinlikler](#-müzik-botu-audio-ducking--ortak-etkinlikler)
  - [💬 Sohbet, DM Okundu Bilgisi & Topluluk](#-sohbet-dm-okundu-bilgisi--topluluk)
  - [📞 1-e-1 Direkt Görüşme & Uzaktan Yardım](#-1-e-1-direkt-görüşme--uzaktan-yardım)
  - [🎨 Arayüz, Profil, Rozetler & Çoklu Dil (i18n)](#-arayüz-profil-rozetler--çoklu-dil-i18n)
  - [🔒 Güvenlik, Moderasyon & Ağ Teşhisi](#-güvenlik-moderasyon--ağ-teşhisi)
- [📖 Hızlı Kullanım Rehberi](#-hızlı-kullanım-rehberi)
- [🛠️ Kurulum, Test & Geliştirme](#️-kurulum-test--geliştirme)
- [📦 Masaüstü Sürümü Derleme (Release)](#-masaüstü-sürümü-derleme-release)
- [📂 Proje Dizin Yapısı](#-proje-dizin-yapısı)

---

## ✨ Güncel Özellikler

### 🖥️ Masaüstü Uygulaması & Oyun İçi Overlay
- **Windows & macOS Desteği (Rust / Tauri v2):** Windows (`x64-setup.exe` / `.msi`) ve macOS (`Universal .dmg` — Apple Silicon & Intel) için yerel masaüstü derlemesi.
- **Gelişmiş Oyun İçi Konuşanlar Overlay'i:**
  - Çerçevesiz, şeffaf ve anti-cheat güvenli (DLL enjeksiyonu olmadan ayrı pencere tabanlı) konuşanlar penceresi.
  - **Cam Saydamlığı (%20–%100)**, **Köşe Konumu** (Sol Üst / Sağ Üst / Sol Alt / Sağ Alt), **Boyut** (Kompakt / Standart / Geniş), **Yalnızca Konuşanları Göster**, **Hızlı Kontrol Çubuğu** ve **Canlı Ping (ms) Göstergesi**.
  - `Ctrl + Shift + O` (veya ayar anahtarı) ile **Tıklama Geçirgenliği (Click-Through / Kilit)** açılıp kapatılabilir.
- **Otomatik Oyun Algılama (Rich Presence):** Çalışan süreçler ve aktif pencere başlıkları taranarak oyunlar (VALORANT, CS2, LoL, GTA V, FiveM, Minecraft, Fortnite, Steam/Xbox/Epic oyunları vb.) otomatik algılanır ve profil aktivitesinde gösterilir.
- **Sistem Tepsisi & Global Kısayollar:** Pencere kapatıldığında arka planda tepsiye küçülür; oyun içindeyken bile `Ctrl + Shift + M` (Mikrofon) ve `Ctrl + Shift + D` (Kulaklık) kısayolları çalışır.
- **İmzalı Otomatik Güncelleme:** Açılışta yeni sürüm kontrolü ve tek tıkla güncelleme desteği.

### 🎙️ Ses Odaları, Yayın, PiP & TeamSpeak Özellikleri
- **Düşük Gecikmeli WebRTC Ses Odaları:** Kişi bazlı ses seviyesi ayarı (`%0–%200`), yerel susturma, konuşma halosu, şifreli odalar ve sürükle-bırak oda taşıma.
- **TeamSpeak Tarzı Go Live Ekran Yayını:** Yayın öncesi çözünürlük (`360p – Source`), FPS (`5 / 30 / 60`), video/ses bitrate, gizlilik ve izleyici limiti seçimi.
- **Çoklu Ekran Paylaşımı Geçişi & Mini PiP:**
  - Aynı ses odasında birden fazla kişi yayın açtığında üstteki yayıncı butonlarıyla yayınlar arasında anında geçiş yapılabilir.
  - Ses odasında yayın izlerken başka bir metin/DM kanalına geçtiğinizde sağ altta **Mini PiP (Picture-in-Picture)** yayın penceresi açılır (*Odaya Dön*, *Küçült*, *Kapat*).
- **Ses Odası İçi Yazılı Sohbet ("Oda Sohbeti"):** Ses odasından çıkmadan sağdan açılan yan çekmece üzerinden odaya özel yazılı mesajlar okunup gönderilebilir.
- **Whisper Lists (Fısıltı Listeleri) & El Kaldırma:** Seçili kullanıcılara özel ses fısıltısı gönderme ve kalabalık odalarda söz isteme rozeti.
- **Otomatik AFK Taşıyıcı & Gelişmiş DSP:** Belirlenen süre sonunda AFK kanalına otomatik taşıma; RNNoise/Echo Cancellation/AGC, PTT/VAD eşiği, 3D Uzamsal Ses, Soundboard ve Oda Ses Kaydedici.

### 🎵 Müzik Botu, Audio Ducking & Ortak Etkinlikler
- **Radyo & YouTube Botu:** Resmi YouTube IFrame API ve canlı SomaFM radyo istasyonlarıyla senkronize müzik dinleme.
- **Audio Ducking:** Odadaki katılımcılardan biri konuştuğunda Radyo/YouTube ses seviyesi otomatik olarak **%30** seviyesine kısılır; konuşma bitince eski haline döner (üst bardan açılıp kapatılabilir).
- **Birlikte İzle (Watch Together), Ortak Çizim (Whiteboard) & Mini Oyunlar:** Ses odası içinde senkronize video, canlı ortak tuval ve mini oyunlar.

### 💬 Sohbet, DM Okundu Bilgisi & Topluluk
- **DM Okundu Bilgisi (`✓✓ Görüldü`):** Direkt mesajlarda karşı taraf mesajınızı okuduğunda son gönderdiğiniz mesajın yanında canlı `✓✓ Görüldü` göstergesi görünür.
- **"Yeni Mesajlar" Ayırıcı Çizgisi:** Okunmamış mesajı olan bir kanala girildiğinde son okunan mesajın hemen altında *"Yeni Mesajlar"* ayırıcı çizgisi gösterilir.
- **Bağlantı Durumu & Çevrimdışı Mesaj Kuyruğu:** Bağlantı koptuğunda üstte *"Yeniden bağlanılıyor..."* uyarı bandı çıkar; bu sırada yazılan mesajlar kuyruğa alınıp bağlantı sağlandığında otomatik gönderilir.
- **Zengin Mesajlaşma:** Yanıtlama (`replyTo`), alt konular (Threads), **Sesli Notlar** (`1x / 1.5x / 2x` hız + dalga formu), kod blokları, görsel lightbox, anketler, yer imleri, hatırlatıcılar, GIF seçici ve sabitlenmiş mesajlar.
- **Sunucu Oluşturma Şablonları:** Yeni sunucu oluştururken **🎮 Oyun Topluluğu**, **☕ Arkadaş Grubu**, **💼 Çalışma / Ekip** veya **📄 Boş Sunucu** şablonlarından biri seçilerek hazır kanallarla başlanabilir.
- **Okunmamış Mesaj & `@Bahsetme` Rozetleri, Özel Sunucu Emojileri, Tam Üye Listesi.**

### 📞 1-e-1 Direkt Görüşme & Uzaktan Yardım
- **1-e-1 Görüşme Sahnesi:** Direkt Mesaj ekranında daraltılıp genişletilebilen çağrı sahnesi, çoklu oturum zil sesi ve ekran paylaşımı.
- **Uzaktan Masaüstü Kontrolü (TeamViewer Tarzı):** İzinli fare/klavye kontrolü, hızlı Windows/sistem kısayol çubuğu ve Türkçe Q ekran klavyesi.

### 🎨 Arayüz, Profil, Rozetler & Çoklu Dil (i18n)
- **Rahatsız Etmeyin (DND) Bildirim Susturma:** Kullanıcı durumu `dnd` iken masaüstü bildirimleri ve bildirim sesleri otomatik olarak susturulur.
- **Özel Durum Süresi (Custom Status Expiry):** Durum mesajı düzenlenirken *Süresiz / 30 Dakika / 1 Saat / 4 Saat / Bugün Sonu* seçilebilir; süresi dolduğunda otomatik temizlenir.
- **Tıklanabilir Rozet Açıklamaları:** Profil kartında kazanılan rozetlerin üzerine tıklandığında rozet açıklaması açılır/kapanır.
- **Çoklu Dil (i18n):** Ayarlar üzerinden anlık olarak **Türkçe (TR)**, **English (EN)**, **Deutsch (DE)** ve **Русский (RU)** dilleri arasında geçiş yapılabilir.
- **Performans & Code Splitting:** Modallar ve büyük alt görünümler `React.lazy` + `Suspense` ile ayrı chunk'lar halinde yüklenir.

### 🔒 Güvenlik, Moderasyon & Ağ Teşhisi
- **İsteğe Bağlı 2FA (TOTP) & Aktif Oturum Yönetimi:** Authenticator uygulaması ile 2FA ve tüm cihaz oturumlarını tek tıkla sonlandırma.
- **Gelişmiş AutoMod, Rol İzin Matrisi & Audit Logs:** Link/kelime filtresi, zaman aşımı (timeout), ban ve denetim kayıtları.
- **Anlık Ağ Teşhisi:** 1 saniyelik canlı RTT (Ping), Jitter, Paket Kaybı (%) ve son 30 örneğin grafiği.
- **Dedicated Server Desteği:** Lisans korumalı bağımsız sunucu paketi (`dedicated-server/`).

---

## 📖 Hızlı Kullanım Rehberi

1. **Hesap & Güvenlik:** Kaydolun veya giriş yapın; sol alttaki **⚙️ Ayarlar → Gizlilik & Güvenlik** sekmesinden 2FA'yı etkinleştirip aktif oturumlarınızı yönetebilirsiniz.
2. **Sunucu & Şablonlar:** Sol menüdeki **`+`** butonuyla şablon seçerek yeni sunucu kurabilir, davet bağlantısıyla katılabilir veya özel bir Dedicated sunucuya bağlanabilirsiniz.
3. **Ses Odası & Overlay:** Bir ses odasına bağlandıktan sonra alt bardan mikrofon/kulaklık, **Ekran Paylaş**, **Oda Sohbeti**, **Ducking** ve **Overlay** ayarlarını yönetebilirsiniz. Oyun içindeyken overlay kilidini `Ctrl + Shift + O` ile açıp kapatabilirsiniz.
4. **Ağ Teşhisi:** Sol alttaki veya ses odası üst barındaki **ms** göstergesine tıklayarak canlı bağlantı kalitenizi izleyebilirsiniz.

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
- **Üretim Modu (Tek Port):**
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
├── server/                                # Node.js + Express + Socket.io Backend
│   └── src/
│       ├── index.ts                       # Auth, 2FA, Session, AutoMod, AFK Mover, DM Read Receipts, WebRTC
│       ├── licenseGenerator.ts            # HMAC-SHA256 Lisans Üretici
│       └── types.ts                       # Sunucu veri modelleri
├── client/                                # React 19 + TypeScript + Tailwind + Tauri v2
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthModal.tsx              # Giriş, Kayıt & 2FA doğrulama
│   │   │   ├── ChannelSidebar.tsx         # Kanallar, DM listesi & sürükle-bırak oda taşıma
│   │   │   ├── ChatArea.tsx               # Sohbet, DM okundu bilgisi, Yeni Mesajlar çizgisi, sesli not
│   │   │   ├── CreateServerModal.tsx      # Şablonlu sunucu oluşturma, davet önizleme & Dedicated IP
│   │   │   ├── DirectCallModal.tsx        # 1-e-1 arama kartı & zil sesi
│   │   │   ├── MiniScreenSharePiP.tsx     # Ses odası dışı yüzen mini ekran paylaşımı (PiP)
│   │   │   ├── RemoteAssistModal.tsx      # Uzaktan yardım, kısayollar & ekran klavyesi
│   │   │   ├── VoiceRoomArea.tsx          # Ses odası, çoklu yayın geçişi, Oda Sohbeti, Ducking
│   │   │   ├── VoiceRadioWidget.tsx       # YouTube IFrame API, SomaFM Radyo Botu & Audio Ducking
│   │   │   ├── SpeakersOverlay.tsx        # Oyun içi cam saydam konuşanlar overlay penceresi
│   │   │   ├── UserProfileModal.tsx       # Profil, tıklanabilir rozetler, durum süresi & bakiye
│   │   │   ├── MemberList.tsx             # Çevrimiçi/Çevrimdışı üye listesi
│   │   │   ├── ConnectionDiagnosticsModal.tsx # Canlı 1s RTT/Jitter/Paket Kaybı teşhisi
│   │   │   ├── SettingsModal.tsx          # TeamSpeak tarzı ayarlar, Overlay, 2FA, Dil seçimi
│   │   │   ├── ServerSettingsModal.tsx    # Roller, AutoMod, AFK, Özel Emojiler
│   │   │   └── AdminDashboardModal.tsx    # Sistem Yönetimi & Lisanslar
│   │   ├── utils/
│   │   │   ├── i18n.ts                    # Çoklu dil sözlüğü (TR / EN / DE / RU)
│   │   │   ├── statusExpiry.ts            # Özel durum süresi hesaplama yardımcıları
│   │   │   └── __tests__/                 # Vitest birim testleri
│   │   └── context/SocketContext.tsx      # WebRTC Mesh, DSP, DND, Reconnect Queue & Tauri Bridge
│   └── src-tauri/                         # Rust Tauri v2 (Tray, Global Shortcut, Overlay, Game Detect)
├── dedicated-server/                      # Lisanslı bağımsız ses & sohbet sunucusu
├── scripts/release-desktop.ps1            # İmzalı masaüstü kurulum & updater paketi üretici
└── start.sh                               # Üretim başlatıcısı (git pull + build + server)
```
