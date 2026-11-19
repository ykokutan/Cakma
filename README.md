# Çakma — Discord & TeamSpeak Hibrit Platformu (`v0.4.0`)

![Version](https://img.shields.io/badge/version-0.4.0-blue?style=flat-square)
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
- **Tam LiveKit SFU & Ekran Paylaşımı:** Küçük odalar düşük gecikmeli **P2P Mesh** üzerinden akarken, kalabalık odalar otomatik **LiveKit SFU**'ya geçer. SFU modunda hem mikrofon sesi hem de **Simulcast ekran paylaşımı**, kişi bazlı ses seviyesi, Bas/Tiz EQ, çıktı cihazı (`setSinkId`) ve `ActiveSpeakersChanged` konuşma halosu eksiksiz çalışır.
- **Sunucu Bazlı Mimari Seçimi & Özel TURN:** Her sunucu için **Otomatik (Hibrit) / P2P Mesh / LiveKit SFU** seçilebilir; Sistem Yönetim Paneli'nden **LiveKit SFU** ayarlarının yanında CGNAT / farklı ağ bağlantıları için **özel TURN sunucusu** da yapılandırılabilir.
- **Otomatik Linux/Pelican Kurulumu ([start.sh](file:///c:/Users/ykoku/Documents/discord%20%C3%A7akma/start.sh)):** Başlangıçta en güncel `livekit-server` sürümünü otomatik indirir, `data/.livekit-secrets` ve `data/livekit.yaml` (`use_external_ip`, `node_ip`, `udp_port` destekli) dosyalarını oluşturup başlatır ve `/livekit` proxy'si üzerinden sunar.

### 🖥️ Masaüstü Uygulaması, Cam Başlık Çubuğu & Oyun İçi Overlay
- **Windows & macOS Desteği (Rust / Tauri v2):** Windows (`x64-setup.exe` / `.msi`) ve macOS (`Universal .dmg` — Apple Silicon & Intel) için yerel masaüstü derlemesi.
- **Görev Çubuğu Rozeti & Tıklanabilir Bildirimler:** Okunmamış mesajlarda Windows görev çubuğu simgesi ve sistem tepsisi üzerinde canlı bildirim rozeti gösterilir; masaüstü bildirimlerine tıklandığında uygulama öne getirilip doğrudan ilgili kanala geçer.
- **Canlı Güncelleme İlerleme Çubuğu:** Ayarlar → Hakkında ekranında tek tıkla güncelleme denetimi, canlı `%` / `MB` indirme çubuğu ve imzalı OTA kurulum (`latest.json`).
- **Özel Cam Pencere Başlık Çubuğu:** Temaya uyumlu glassmorphism üst pencere çubuğu, aktif sunucu/kanal göstergesi, `Ctrl + K` Hızlı Geçiş ve canlı ping rozeti.
- **Gelişmiş Oyun İçi Konuşanlar Overlay'i:**
  - Çerçevesiz, gerçek cam saydamlıklı (`%20–%100`) ve anti-cheat güvenli (DLL enjeksiyonu olmadan ayrı pencere tabanlı) konuşanlar penceresi.
  - **Köşe Konumu**, **Boyut** (Kompakt / Standart / Geniş), **Yalnızca Konuşanları Göster**, **Hızlı Kontrol Çubuğu**, **Canlı Ping (ms)** ve `Ctrl + Shift + O` ile **Tıklama Geçirgenliği (Kilit)**.
- **Genişletilmiş Otomatik Oyun Algılama & Global Kısayollar:** 40+ popüler oyun otomatik algılanır; oyun içindeyken `Ctrl + Shift + M` ve `Ctrl + Shift + D` çalışır.

### 🔊 Stüdyo Ses, Spektral Gürültü Engelleme, HDR Yayın & PiP
- **48kHz AudioWorklet Gürültü Engelleme & Zero-Lag Sayaç:** Ana iş parçacığından bağımsız gerçek zamanlı spektral gürültü filtresi ([noise-suppressor-worklet.js](file:///c:/Users/ykoku/Documents/discord%20%C3%A7akma/client/public/noise-suppressor-worklet.js)) ve 60 FPS re-render darboğazını ortadan kaldıran `VoiceMetricsContext` harici deposu.
- **Stüdyo Ses DSP & Kişiye Özel EQ:** `48 kHz` örnekleme, `80 Hz` uğultu filtresi, Compressor DSP, `20 ms` düşük gecikmeli tampon, **64–384 kbps Opus**, kişi bazlı `%0–%200` ses, Bas/Tiz EQ, Ses Normalizasyonu ve Sunucu Susturma / Toplantı Modu.
- **10-bit AV1/VP9 HDR Yayın, WASAPI Pencere Sesi & Mini PiP:** Yayın açarken mümkün olduğunda **yalnızca seçili pencere/oyun sesini (WASAPI)** yakalama, izleyici tarafında özel kalite (`Oto/Kaynak/1080p/720p/480p/360p`), canlı FPS/bitrate/istatistik, lazer işaretçi, çoklu yayın geçişi ve **Mini PiP**.
- **Ses Odası İçi Yazılı Sohbet ("Oda Sohbeti"), Whisper Lists, El Kaldırma & Otomatik AFK Taşıyıcı.**

### 💬 Sohbet, Parçalı Depolama, Sayfalama & WebP Optimizasyonu
- **Parçalı Asenkron Depolama & Sayfalama:** Kanal bazlı debounced asenkron disk yazımı ([messageStore.ts](file:///c:/Users/ykoku/Documents/discord%20%C3%A7akma/server/src/messageStore.ts)), başlangıçta kanal başına son 60 mesaj yükleme ve *"Sunucudan Daha Eski Mesajları Yükle (+50)"* desteği.
- **İstemci Tarafı WebP Görsel Sıkıştırma:** Sohbete atılan büyük görseller ve ekran görüntüleri otomatik olarak hafif WebP formatına dönüştürülerek bant genişliği ve disk alanı korunur.
- **DM Okundu Bilgisi (`✓✓ Görüldü`), E2EE DM, "Yeni Mesajlar" Çizgisi, Sesli Notlar, Threads, GIPHY & Sunucu Şablonları.**

### 📞 1-e-1 Direkt Görüşme & Uzaktan Yardım
- **1-e-1 Görüşme Sahnesi:** Daraltılıp genişletilebilen çağrı sahnesi, çoklu oturum zil sesi ve ekran paylaşımı.
- **Uzaktan Masaüstü Kontrolü (TeamViewer Tarzı):** İzinli fare/klavye kontrolü, hızlı sistem kısayol çubuğu ve Türkçe Q ekran klavyesi.

### 🎨 12 Arayüz Teması + Özel Tema Oluşturucu, Profil & Çoklu Dil (i18n)
- **8 Koyu + 4 Açık Tema:** Vision Dark, Midnight Blue, Cyber Emerald, Amber Gold, Crimson Rose, Royal Violet, Nordic Frost, OLED Siyah + **İnci Beyazı**, **Gündüz Mavisi**, **Sıcak Kum**, **Nane Esintisi**.
- **Özel Tema Oluşturucu (CSS Değişkenleri):** Koyu/Açık kontrast modu, zemin rengi ve vurgu parlaması seçilerek anlık kişisel tema oluşturulabilir.
- **Ayarlar İçi Hızlı Arama, PWA Web Push & Varlık Yönetimi:** DND bildirim susturma, 10 dk otomatik Boşta (Idle) modu, özel durum süresi, Service Worker Web Push bildirimleri ve tıklanabilir rozet açıklamaları.
- **Çoklu Dil (i18n):** Anlık **Türkçe (TR)**, **English (EN)**, **Deutsch (DE)** ve **Русский (RU)** desteği.

### 🔒 Güvenlik, Moderasyon, Şifreli Yedekler, Metrikler & Ağ Teşhisi
- **Güçlendirilmiş Kimlik & Oturum Güvenliği:** `HttpOnly` cookie oturumu, sıkılaştırılmış CSP, davet kodlu kayıt, anti-bot doğrulaması, 6 haneli **E-posta OTP**, **2FA (TOTP)**, yeni IP giriş uyarısı ve aktif oturum yönetimi.
- **Şifreli Sunucu Yedekleri & Güvenlik Denetimi:** Rastgele kalıcı sunucu anahtarları, **AES-256-GCM** şifreli otomatik yedekleme ve canlı **Güvenlik Denetimi Skoru**.
- **Gözlemlenebilirlik & Testler:** `/api/health` + `/api/metrics` (JSON ve Prometheus formatı) ve sunucu (`node:test`) + istemci (`vitest`) birim test paketi.
- **Gelişmiş AutoMod, Rol İzin Matrisi, Audit Logs, Anlık Ağ Teşhisi & Dedicated Server.**

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
- **Sunucu Derleme & Test (`tsc` + `node:test`):**
  ```bash
  npm --prefix server test
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
