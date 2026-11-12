# 🛡️ Dedicated Voice & Chat Server (TeamSpeak Stili Lisanslı Sunucu)

Bu paket, müşterilerinizin veya topluluklarınızın **kendi Windows veya Linux VPS/VDS sunucularında** bağımsız ses ve metin sunucusu açmalarını sağlayan resmi sunucu dağıtımıdır.

---

## 🔒 Güvenlik & Lisans Mimarisi

1. **Kriptografik Lisans Zorunluluğu:**
   - Sunucu, `server.config.json` dosyasındaki `licenseKey` alanında geçerli bir dijital imza bulunmadan **asla çalışmaz**.
   - Lisans anahtarları, platform sahibi tarafından HMAC-SHA256 ile imzalanır. Slot sayısı ve son kullanma tarihi şifreli olarak anahtarın içindedir; değiştirilirse imza bozulur ve sunucu kendini kapatır.
2. **Tescilli İstemci Kilidi:**
   - Bu sunucuya **yalnızca platform sahibinin resmi web sitesi ve masaüstü uygulaması** bağlanabilir.
   - Dışarıdan yetkisiz web siteleri, korsan uygulamalar veya yabancı botlar sunucuya bağlanamaz (`CORS & Client Signature Verification`).

---

## 🚀 Sunucu Nasıl Kurulur ve Çalıştırılır?

### 1. Ayarları Yapılandırma (`server.config.json`)
Sunucu klasöründeki `server.config.json` dosyasını açın:

```json
{
  "serverName": "Benim Toplulugum Ses Sunucusu",
  "port": 4001,
  "licenseKey": "LISANS_ANAHTARINIZ_BURAYA_GELECEK",
  "defaultChannels": [
    { "name": "lobi-sohbet", "type": "text" },
    { "name": "Lobi Ses", "type": "voice" },
    { "name": "Oyun Odasi 1", "type": "voice" }
  ]
}
```

### 2. Başlatma (Windows)
`start-dedicated-server.bat` dosyasına çift tıklayın veya terminalde:
```powershell
npm start
```

### 3. Başlatma (Linux / VPS)
```bash
npm install
npm start
```

---

## 🌐 Kullanıcılar Bu Sunucuya Nasıl Bağlanır?

Resmi Discord / TeamSpeak uygulamanızı açın:
1. Sol sunucu listesindeki **`+` (Sunucu Ekle)** butonuna tıklayın.
2. **"Özel IP ile Bağlan"** sekmesini seçin.
3. Sunucunuzun IP ve Port adresini yazın (Örn: `185.12.34.56:4001` veya `localhost:4001`).
4. **"Doğrudan Bağlan"** butonuna basarak anında kendi sunucunuza bağlanın!
