# Çakma — Discord & TeamSpeak Hibrit Platformu (Tauri v2 + Web + Dedicated Server)

**Çakma**; Discord'un modern kanal/sohbet mimarisini, iOS/visionOS cam (glassmorphism) arayüzünü ve TeamSpeak'in düşük gecikmeli ses, yayın, fısıltı (Whisper) ve özelleştirilebilir donanım ayarlarını tek platformda birleştiren tam kapsamlı bir **masaüstü (Rust/Tauri v2)** ve **web** iletişim uygulamasıdır.

---

## ✨ Güncel Özellikler

### 🖥️ Masaüstü Uygulaması (Rust / Tauri v2)
- **Sistem Tepsisi & Arka Plan Modu:** Pencere kapatıldığında uygulama tepsiye küçülür; tepsi menüsünden **Çakma'yı Göster**, **Mikrofonu Kapat / Aç** ve **Tamamen Kapat** seçenekleri kullanılabilir.
- **Global Kısayollar:** Oyun içinde veya uygulama arka plandayken bile çalışan sistem geneli kısayollar:
  - `Ctrl + Shift + M` → Mikrofonu Sustur / Aç
  - `Ctrl + Shift + D` → Kulaklığı Sustur / Aç
- **Otomatik Oyun Algılama (Rich Presence):** Çalışan oyun/uygulamalar (VALORANT, CS2, LoL, GTA V, FiveM, Minecraft, Fortnite, OBS, Spotify vb.) otomatik algılanıp üye listesinde aktivite olarak gösterilir.
- **Oyun İçi Konuşanlar Overlay:** Üstte sabit, çerçevesiz mini overlay penceresi ile ses odasında kimlerin konuştuğu anlık olarak takip edilebilir.
- **İmzalı Otomatik Güncelleme:** Masaüstü istemcisi açılışta yeni sürümü otomatik denetler ve imzalı güncellemeyi indirip kurar.

### 🎙️ Ses Odaları, Yayın & TeamSpeak Özellikleri
- **Düşük Gecikmeli WebRTC Ses Odaları:** Kişi bazlı ses seviyesi ayarı, yerel susturma, konuşma halosu ve şifreli odalar.
- **TeamSpeak Tarzı Go Live Ekran Yayını:** Yayın açmadan önce çözünürlük (360p – Source), FPS (5/30/60), video/ses bitrate, gizlilik (Herkese Açık / Kişiler / Özel) ve izleyici limiti ayarlanabilir.
- **Whisper Lists (Fısıltı Listeleri):** Seçili kullanıcılara özel fısıltı listeleri oluşturarak canlı ses fısıltısı gönderilebilir.
- **El Kaldırma (Raise Hand / Sahne Modu):** Kalabalık odalarda söz istemek için el kaldırma rozeti.
- **Otomatik AFK Taşıyıcı:** Sunucu ayarlarından belirlenen süre (`afkTimeoutMinutes`) boyunca ses aktivitesi olmayan kullanıcılar otomatik olarak AFK kanalına taşınır ve susturulur.
- **Gelişmiş Ayarlar (TeamSpeak Tarzı):** Ses giriş/çıkış aygıt seçimi, RNNoise/Echo Cancellation/AGC, Bas-Konuş (PTT) & VAD eşiği, Mikrofon Testi (Loopback), Video/Codec ayarları, Bildirimler ve Kısayollar.
- **3D Uzamsal Ses, Ses Tahtası (Soundboard) & Oda Kaydı:** Oda içinde eğlence ve kayıt araçları.

### 🎵 Müzik Botu & Ortak Etkinlikler
- **Müzik & YouTube Botu:** Resmi YouTube IFrame API ve canlı SomaFM radyo istasyonları ile odadaki herkes için senkronize müzik (kişiye özel ses/susturma ve klip göster/gizle desteğiyle).
- **Birlikte İzle (Watch Together):** Odadaki katılımcılarla senkronize YouTube videosu izleme, oynat/duraklat ve başa sarma.
- **Ortak Çizim Tahtası (Whiteboard) & Mini Oyunlar:** Ses odası içinde eşzamanlı çizim ve mini oyunlar.

### 💬 Sohbet, Topluluk & Üye Listesi
- **Zengin Mesajlaşma:** Yapısal mesaj yanıtlama (`replyTo`), **Sesli Notlar** (gerçek süreli dalga formu, tıklayarak sarma, `1x/1.5x/2x` hız kontrolü), kod blokları, dosya yükleme, anketler ve sabitlenmiş mesajlar.
- **Özel Sunucu Emojileri:** Sunucu ayarlarından özel emoji yükleme/silme ve sohbet emoji seçicisinde kullanma.
- **Gelişmiş Mesaj Arama & GIF Seçici:** Kanal geçmişinde hızlı arama ve GIF paylaşımı.
- **Tam Üye Listesi:** Sağ panelde sunucudaki tüm üyeler (hem **Çevrimiçi** rollere göre, hem **Çevrimdışı** en altta, çoklu cihaz oturumları tekilleştirilmiş şekilde) listelenir.

### 🔒 Güvenlik, Moderasyon & Ağ Teşhisi
- **İsteğe Bağlı 2FA (TOTP):** Ayarlar → **Gizlilik & Güvenlik** sekmesinden Authenticator uygulamasıyla iki adımlı doğrulama etkinleştirilebilir.
- **Aktif Oturum Yönetimi:** Hesaba bağlı aktif cihazlar listelenir; tek tıkla **"Diğer Tüm Oturumları Kapat"** ile diğer oturumların token'ları geçersiz kılınır.
- **Gelişmiş AutoMod & Rol Yetkileri:** Link engelleme, yasaklı kelime filtresi, sunucu/kanal izin matrisi ve denetim kayıtları (Audit Logs).
- **Anlık Bağlantı ve Ağ Teşhisi:** Pencere açıkken **her 1 saniyede bir** canlı RTT (Ping), Jitter, gerçek Paket Kaybı (%) ve son 30 örneğin dalga grafiği gösterilir.
- **Dedicated Server Desteği:** Lisans korumalı bağımsız sunucu paketi (`dedicated-server/`).

---

## 📖 Kullanım Rehberi

### 1. Hesap Oluşturma, Giriş & 2FA
1. Uygulamayı web tarayıcısından veya masaüstü istemcisinden açın.
2. **Kayıt Ol** sekmesinden yeni bir kullanıcı adı ve güçlü bir parola oluşturun ya da mevcut hesabınızla giriş yapın.
3. İki adımlı doğrulama açmak için sol alttaki **⚙️ Ayarlar → Gizlilik & Güvenlik** sekmesinden **2FA Etkinleştir** adımlarını izleyin ve QR kodu Authenticator uygulamanıza okutun.
4. Aynı sekmeden hesabınıza bağlı aktif oturumları görebilir, gerekirse **Diğer Tüm Oturumları Kapat** diyebilirsiniz.

### 2. Sunucu & Kanal Yönetimi
- Sol kenar çubuğundaki **`+`** simgesinden yeni sunucu oluşturabilir, davet koduyla katılabilir veya özel bir Dedicated Sunucu IP'sine bağlanabilirsiniz.
- Sunucu ayarlarından (**Sunucu Ayarları**) roller, izinler, **Özel Emojiler**, **AFK Kanalı/Süresi** ve **AutoMod** (link/yasaklı kelime engelleme) kurallarını yapılandırabilirsiniz.

### 3. Ses Odaları, Yayın & Fısıltı
- Sol menüdeki bir **Ses Odası**na tıklayarak bağlanın.
- Alt kontrol çubuğundan:
  - **Mikrofon / Kulaklık** durumunu yönetin (`Ctrl+Shift+M` / `Ctrl+Shift+D`).
  - **Ekran Paylaş** ile Go Live ayar penceresinden çözünürlük, FPS ve bitrate seçerek yayını başlatın.
  - **El Kaldır** ile odada söz isteyin.
  - **Whisper Lists** ile seçili kişilere özel fısıltı açın.
  - **Overlay** (Masaüstü) butonuyla oyun içi konuşanlar penceresini açıp kapatın.
- Üst bardaki **Radyo / Müzik Botu** butonundan YouTube linki/listesi veya canlı radyo açabilir, alt kısımdaki ses çubuğundan kendi ses seviyenizi ayarlayabilirsiniz.

### 4. Ağ Teşhisi
- Sol alt ses bağlantı çubuğundaki ping göstergesine veya ses odası üst barındaki **ms / Ağ Teşhisi** butonuna tıklayarak **1 saniyelik canlı** Ping, Jitter, Paket Kaybı ve mikrofon giriş seviyesini izleyebilirsiniz.

---

## 🛠️ Kurulum & Geliştirme

### Gereksinimler
- **Node.js 20+**
- Masaüstü derlemesi için: **Rust (rustup + cargo)** ve Windows WebView2

### Geliştirme / Çalıştırma
- **Backend + Web (Tek Port / Üretim Modu):**
  ```bash
  cd server && npm install && npm run build
  cd ../client && npm install && npm run build
  cd .. && bash start.sh
  ```
- **Geliştirme Modu (Windows):**
  - Web: `start-web.bat` (`http://localhost:5173` & `http://localhost:4000`)
  - Masaüstü (Tauri Dev): `start-desktop.bat`
  - Dedicated Sunucu: `dedicated-server\start-dedicated-server.bat`

### İmzalı Masaüstü Sürümü Derleme (Release)
`client/src-tauri/tauri.conf.json` içindeki `version` numarasını yükselttikten sonra:
```powershell
powershell -ExecutionPolicy Bypass -File "scripts/release-desktop.ps1"
```
Bu script `Çakma_<version>_x64-setup.exe` kurulum dosyasını derler, Tauri updater anahtarıyla imzalar ve `client/public/downloads/` altına (`Cakma-Setup.exe` + `latest.json`) yerleştirir.

---

## 📂 Proje Dizin Yapısı

```text
discord-cakma/
├── server/                         # Node.js + Express + Socket.io Backend
│   └── src/
│       ├── index.ts                # Auth, 2FA, Session, AutoMod, AFK Mover, WebRTC Sinyal
│       ├── licenseGenerator.ts     # HMAC-SHA256 Lisans Üretici
│       └── types.ts                # Sunucu veri modelleri
├── client/                         # React 19 + TypeScript + Tailwind + Tauri v2
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthModal.tsx               # Giriş, Kayıt & 2FA doğrulama
│   │   │   ├── ChatArea.tsx                # Sohbet, yanıt, özel emoji, sesli not
│   │   │   ├── VoiceRoomArea.tsx           # Ses odası, Go Live, El Kaldır, Overlay
│   │   │   ├── VoiceRadioWidget.tsx        # YouTube IFrame API & SomaFM Radyo Botu
│   │   │   ├── VoiceNotePlayer.tsx         # Sesli not oynatıcı & dalga formu
│   │   │   ├── WhisperListsModal.tsx       # TeamSpeak Whisper Lists
│   │   │   ├── SpeakersOverlay.tsx         # Oyun içi konuşanlar overlay penceresi
│   │   │   ├── MemberList.tsx              # Çevrimiçi/Çevrimdışı üye listesi
│   │   │   ├── ConnectionDiagnosticsModal.tsx # Canlı 1s RTT/Jitter/Paket Kaybı teşhisi
│   │   │   ├── SettingsModal.tsx           # TeamSpeak tarzı ayarlar, 2FA, Aktif Oturumlar
│   │   │   ├── ServerSettingsModal.tsx     # Roller, AutoMod, AFK, Özel Emojiler
│   │   │   └── AdminDashboardModal.tsx     # Sistem Yönetimi & Lisanslar
│   │   └── context/SocketContext.tsx       # WebRTC Mesh, DSP, Telemetry & Tauri Bridge
│   └── src-tauri/                          # Rust Tauri v2 (Tray, Global Shortcut, Overlay, Game Detect)
├── dedicated-server/               # Lisanslı bağımsız ses & sohbet sunucusu
├── scripts/release-desktop.ps1     # İmzalı masaüstü kurulum & updater paketi üretici
└── start.sh                        # Üretim başlatıcısı (git pull + build + server)
```
