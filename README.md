# Discord & TeamSpeak Hibrit Uygulaması (Rust Tauri + Full-Stack Web + Dedicated Server)

Bu proje; **Discord'un modern arayüzünü ve kanal mimarisini**, **iOS / visionOS'un saydam cam (glassmorphism) tasarımını**, **TeamSpeak'in ultra düşük bellek kullanımı (Rust/Tauri), düşük gecikmeli WebRTC ses odaları, bas-konuş (push-to-talk)** ve **kendi sunucunu barındırma (self-hosted dedicated server)** özellikleriyle birleştiren tam teşekküllü bir masaüstü ve web uygulamasıdır.

---

## ✨ Öne Çıkan Özellikler

1. **🔐 Zorunlu Kimlik Doğrulama (Auth Wall):**
   - Sisteme kayıt olmadan veya giriş yapmadan kanallara ve ses odalarına erişim engellenmiştir.
   - Hazır test hesapları:
     - **Yönetici (Admin):** `admin` / `admin123`
     - **Kullanıcı:** `ahmet` / `123456`

2. **🛡️ Özel Sistem Yönetimi (Admin Dashboard):**
   - Yalnızca `admin` rolüne sahip kullanıcılar sol menüdeki **"🛡️ Sistem Yönetimi"** butonunu görür ve açabilir.
   - **Genel Bakış:** Çevrimiçi kullanıcılar, sunucular, kanallar, mesajlar, bellek ve CPU kullanımı.
   - **Dedicated Sunucular Monitörü:** Açılan ve çalışan tüm lisanslı dedicated sunucuları (IP, port, aktif kullanıcı sayısı, slot doluluk yüzdesi, uptime, son sinyal) canlı olarak listeleme ve tek tıkla doğrudan o sunucuya bağlanma.
   - **Kullanıcı Yönetimi:** Rol değiştirme (Admin/Moderatör/Üye/VIP), kullanıcı atma (Kick).
   - **Kriptografik Lisans Üretici:** Dedicated sunucu kiracıları için HMAC-SHA256 imzalı lisans anahtarı üretme.
   - **Canlı Sistem Duyurusu:** Tüm kullanıcılara anlık banner uyarısı geçme.
   - **Güvenlik Denetim Günlükleri (Audit Logs):** Tüm yönetici ve sistem hareketlerinin kaydı.

3. **💎 iOS / visionOS Cam Görünümü & Konuşma Halosu:**
   - Ultra modern saydam cam (frosted glass) tasarımı ve pürüzsüz animasyonlar.
   - Konuşulduğu anda avatar etrafında parıldayan ve nabız gibi atan yeşil **iOS Halo** efekti.

4. **📺 Canlı Ekran Yayını (Screen Share):**
   - Ses odasındayken tek tıkla ekran, pencere veya sekme paylaşımı (WebRTC Video Mesh).
   - Tam ekran modu ve ses odası katılımcı ızgarası.

5. **🎙️ Gelişmiş Donanım & Ses Ayarları (Settings):**
   - **Mikrofon & Kulaklık Seçimi:** Sistemdeki tüm ses giriş/çıkış aygıtlarını listeleme ve seçme (`enumerateDevices` & `setSinkId`).
   - **DSP Ses İşleme:** Gürültü Engelleme (Noise Suppression), Yankı Önleme (Echo Cancellation), Otomatik Kazanç Kontrolü (Auto-Gain Control).
   - **Sesimi Dinle (Mic Test Loopback):** Kendi sesini canlı dinleme ve gerçek zamanlı ses seviyesi göstergesi.
   - **Ses Algılama (VAD) & Bas-Konuş (PTT):** Ayarlanabilir tuş ataması ve eşik hassasiyeti.

6. **🏢 Lisans Karşılığı Dedicated Sunucu (`dedicated-server/`):**
   - TeamSpeak mantığında kullanıcıların kendi VPS / VDS sunucularında çalıştırabileceği bağımsız sunucu paketi.
   - **Lisans Koruması:** HMAC-SHA256 ile imzalanmış lisans anahtarı olmadan veya süresi bitmişse sunucu asla başlamaz.
   - **İstemci İmzası Denetimi:** Sadece sizin resmi web sitenizden ve masaüstü uygulamanızdan gelen bağlantıları kabul eder; yabancı/korsan istemcileri anında engeller.
   - **Doğrudan Bağlantı (Direct Connect):** Sol paneldeki `+` butonundan *"Özel IP ile Bağlan"* seçilerek `localhost:4001` veya sunucu IP adresiyle bağlanılabilir.

---

## ⚡ Tek Tıkla Nasıl Çalıştırılır?

Proje ana dizininde hazır Windows `.bat` dosyaları bulunmaktadır:

- **Web Modunu Başlatmak İçin:**
  `start-web.bat` dosyasına çift tıklayın.
  - Web Arayüzü: `http://localhost:5173`
  - Ana Backend: `http://localhost:4000`

- **Rust / Tauri Masaüstü Uygulamasını Başlatmak İçin:**
  `start-desktop.bat` dosyasına çift tıklayın.

- **Lisanslı Dedicated Sunucuyu Başlatmak İçin:**
  `dedicated-server\start-dedicated-server.bat` dosyasına çift tıklayın.
  - Dedicated Sunucu: `http://localhost:4001`

---

## 📂 Proje Dizin Yapısı

```
discord-cakma/
├── server/                    # Ana Node.js + Socket.io Backend & Admin API
│   ├── src/
│   │   ├── index.ts           # Auth, Admin, WebRTC Sinyalleşmesi & Kanallar
│   │   ├── licenseGenerator.ts# HMAC-SHA256 Kriptografik Lisans Motoru
│   │   └── types.ts           # Ortak veri modelleri
├── client/                    # React 19 + TypeScript + Tauri Masaüstü İstemcisi
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthModal.tsx          # Zorunlu Kayıt & Giriş Duvarı
│   │   │   ├── AdminDashboardModal.tsx# Özel Sistem Yönetici Konsolu
│   │   │   ├── SettingsModal.tsx      # Gelişmiş Ses, Donanım & DSP Ayarları
│   │   │   ├── VoiceRoomArea.tsx      # Halo efektli ses odası & Ekran yayını
│   │   │   ├── CreateServerModal.tsx  # Sunucu oluşturma & Dedicated IP ile bağlanma
│   │   │   ├── ChannelSidebar.tsx     # Kanallar & Admin butonu
│   │   │   └── ChatArea.tsx           # iOS Messages tarzı sohbet
│   │   └── context/
│   │       └── SocketContext.tsx      # WebRTC, Mesh, Audio DSP & Auth motoru
│   └── src-tauri/                     # Rust Tauri v2 Masaüstü Motoru
├── dedicated-server/          # Müşterilere teslim edilecek Lisanslı Sunucu Paketi
│   ├── src/
│   │   ├── index.ts           # Korumalı Dedicated Ses & Sohbet Sunucusu
│   │   └── licenseValidator.ts# Kriptografik Lisans ve Resmi İstemci Doğrulayıcı
│   ├── server.config.json     # Lisans anahtarı ve port konfigürasyonu
│   └── start-dedicated-server.bat
├── start-web.bat              # Web modunu başlatan tek tık launcher
└── start-desktop.bat          # Rust masaüstü uygulamasını başlatan launcher
```
