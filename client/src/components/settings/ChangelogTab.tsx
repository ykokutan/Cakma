import React from 'react';

interface ChangelogTabProps {
  appVersion: string;
}

export const ChangelogTab: React.FC<ChangelogTabProps> = ({ appVersion }) => {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-white">Sürüm Geçmişi &amp; Yenilikler</div>
        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
          Güncel: v{appVersion}
        </span>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {/* v1.6.0 - Latest */}
        <div className="p-3.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-300">v1.6.0 — Son Sürüm (Mobil, Ses, Topluluk &amp; Ölçeklenebilirlik Paketi)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">Yeni</span>
          </div>
          <ul className="text-[11px] text-zinc-300 space-y-1 list-disc list-inside leading-relaxed">
            <li><span className="text-white font-semibold">Mobil Android OTA &amp; Etkileşimli Ses Bildirimi:</span> Android APK için dahili sürüm/SHA-256 güncelleme denetimi (<code className="text-emerald-200">/api/releases/latest</code>), ayarlar içinden tek dokunuşla APK indirme ve kilit ekranından çalışan <code className="text-emerald-200">Sustur / Sağırlaştır / Ayrıl</code> aksiyon butonları + dokunsal geri bildirim eklendi.</li>
            <li><span className="text-white font-semibold">Oyun İçi Overlay v2 &amp; Profiller:</span> <code className="text-emerald-200">Ses / Odalar / Sohbet</code> sekmeli etkileşimli overlay, konuşmacı başına %0–200 ses ayarı, 5 sn yüzen sohbet bildirimi ve oyun .exe kurallarına bağlı otomatik mikrofon / gürültü profili eklendi.</li>
            <li><span className="text-white font-semibold">Çoklu Yayın Grid, %200 Yayın Sesi &amp; Sanal Arka Plan:</span> Aynı odada yerel kamera + ekran paylaşımı + uzak yayınlar yan yana; yayın başına WebAudio kazanç artırımı ve 4 modlu (<code className="text-emerald-200">Yumuşak / Güçlü Bulanıklık &amp; Stüdyo Karartma</code>) sanal kamera arka planı eklendi.</li>
            <li><span className="text-white font-semibold">LFG Takım Bulucu &amp; Sunucu Boost (Vanity URL):</span> <code className="text-emerald-200">/lfg</code> ile etkileşimli takım kartları ve tek tıkla ses odasına katılım; cüzdan coini ile Kademe 1–3 sunucu takviyesi, 384 kbps ses, artırılmış emoji/sticker kotası ve özel <code className="text-emerald-200">/c/slug</code> davet bağlantısı eklendi.</li>
            <li><span className="text-white font-semibold">Medya Kalitesi, Destek Talepleri &amp; Anti-Raid Kalkanı:</span> Gönderim öncesi WebP sıkıştırma kontrolü, canlı yükleme hızı (KB/s), kırık/süresi dolmuş CDN medya koruyucusu (<code className="text-emerald-200">SafeChatImage</code>), özel destek kanallı Ticket + Markdown transkript + başvuru formları ve otomatik Anti-Raid kilit modu eklendi.</li>
            <li><span className="text-white font-semibold">Köprü Medyası, S3 Çöp Toplayıcı, Redis Küme &amp; Arama v2:</span> Telegram/Discord köprülerinde güvenli ek/görüntü aktarımı, sahipsiz S3/R2 nesnelerini temizleyen çöp toplayıcı, sıfır-bağımlılıklı Redis Pub/Sub küme veri yolu (<code className="text-emerald-200">REDIS_URL</code>) ve <code className="text-emerald-200">has:code / has:video / has:ses / ext: / lang:</code> destekli FTS5 Arama v2 eklendi.</li>
          </ul>
        </div>

        {/* v1.5.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200">v1.5.0 — Entegrasyon &amp; Altyapı Ölçekleme Paketi</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400 font-medium">Önceki</span>
          </div>
          <ul className="text-[11px] text-zinc-300 space-y-1 list-disc list-inside leading-relaxed">
            <li><span className="text-white font-semibold">S3 / Cloudflare R2 Medya &amp; CDN Aktarımı:</span> Yüklenen dosya ve eklerin otomatik S3/R2 nesne depolamaya aktarımı, 1 saatlik AWS SigV4 imzalı yönlendirme (CORS gerektiren istekler için proxy akışı), isteğe bağlı özel CDN alan adı, boyut eşiği ve yedekleme S3 kimlik bilgilerini tek tıkla paylaşma.</li>
            <li><span className="text-white font-semibold">Steam, GitHub &amp; Google OAuth2 + Doğrulanmış Bağlantılar:</span> Giriş/kayıt ekranında tek tıkla OAuth2 / Steam OpenID oturumu açma (davet kodu ve 2FA desteğiyle) ve profil kartlarında doğrulanmış hesap rozetleri, Steam profil yenileme ve görünürlük ayarları.</li>
            <li><span className="text-white font-semibold">Çift Yönlü Telegram &amp; Discord Kanal Köprüleri:</span> Sunucu ayarlarından Telegram Bot + Sohbet ID veya Discord Webhook/Bot ile şifrelenmemiş metin/duyuru kanallarında döngü korumalı çift yönlü mesaj köprüleme.</li>
          </ul>
        </div>

        {/* v1.4.1 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200">v1.4.1 — Mobil Android APK, Wiki/Kanban &amp; Bulut Operasyonları</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400 font-medium">Önceki</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">Android Uygulaması (.APK) &amp; Arka Plan Sesi:</strong> Capacitor tabanlı imzalı <code className="text-emerald-200">Cakma.apk</code>, ekran kilitliyken sesi kesmeyen <code className="text-emerald-200">VoiceForegroundService</code> ve Bluetooth kulaklık <code className="text-emerald-200">MediaSession</code> kontrolleri eklendi.</li>
            <li><strong className="text-white">Masaüstü Etkileşimli Overlay &amp; Klip Kırpıcı:</strong> Oyun içi <code className="text-emerald-200">Alt+Shift+O</code> 3 sekmeli etkileşimli overlay, özel <code className="text-emerald-200">.exe</code> oyun algılama kuralları + süre sayacı ve paylaşım öncesi <code className="text-emerald-200">ClipTrimModal</code> kırpma stüdyosu geldi.</li>
            <li><strong className="text-white">Wiki, Kanban, Klasörler &amp; Yapay Zekâ Özeti:</strong> Sürüm geçmişli Wiki &amp; sürükle-bırak Kanban kanalları (<code className="text-emerald-200">collabMode</code>), hesaba senkronize sunucu klasörleri, hibrit AI kanal/toplantı özeti (E2EE odalarda tamamen yerel) ve PDF/ZIP/CSV/JSON/ses dalga formu önizlemeleri eklendi.</li>
            <li><strong className="text-white">Kozmetik, Oyunlar &amp; Admin Bulut Yedekleme:</strong> Animasyonlu avatar çerçeveleri, isim gradyanları, otomatik başarı rozetleri, <code className="text-emerald-200">CAKMA_THEME</code> tema kartları, Canlı Trivia / Türkçe Kelime Zinciri / Oda Turnuvası, CPU % &amp; ses sparkline crosshair ipuçları ve AWS SigV4 S3/R2/MinIO bulut yedekleme eklendi.</li>
          </ul>
        </div>

        {/* v1.4.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v1.4.0 — Önceki Sürüm (TeamSpeak + Discord + AI Paketi)</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">UI/UX &amp; Yönetici Konsolu:</strong> Sabit başlıklı, kapsamlı aramalı ve mobil yatay şeritli yeni <code className="text-emerald-200">SettingsModal</code>; rol sürükle-bırak sıralama + çıkış korumalı <code className="text-emerald-200">ServerSettingsModal</code>; üye listesi için hızlı <code className="text-emerald-200">UserPopoverCard</code>; Sistem Yönetim Konsolunda <code className="text-emerald-200">Ctrl+K</code> arama, otomatik yenileme ve çıkış koruması.</li>
            <li><strong className="text-white">Whisper AI Ses Çözümleme &amp; Instant Replay:</strong> Çok dilli istemci içi Whisper AI canlı altyazı + sesli notları (<code className="text-emerald-200">VoiceNotePlayer</code>) tek tıkla yazıya dökme ve çevirme, <code className="text-emerald-200">Öncelikli Konuşmacı (Priority Speaker)</code> kontrolleri ve son 30 sn yayın/ses klibini <code className="text-emerald-200">Alt+C</code> ile indirme veya odaya gönderme.</li>
            <li><strong className="text-white">Topluluk, Performans &amp; Oyunlar:</strong> İzole telemetri store&apos;u (<code className="text-emerald-200">NetworkMetricsContext</code>), <code className="text-emerald-200">:emoji:</code> otomatik tamamlama &amp; satır içi render, <code className="text-emerald-200">GlobalInboxModal</code> içinde Kaydedilenler sekmesi, çok oyunculu <code className="text-emerald-200">Çiz &amp; Tahmin Et</code> oyunu ve Dedicated Server oda eşitliği eklendi.</li>
          </ul>
        </div>

        {/* v1.3.1 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v1.3.1 — Önceki Sürüm (UI/UX Parlatma)</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">Erişilebilir Durum İkonları &amp; Tipografi:</strong> <code className="text-emerald-200">StatusIndicator</code> bileşeni üye listesi, DM sohbetleri ve kullanıcı çubuğuna yayıldı; durum menüsü mikro metinleri okunabilir <code className="text-emerald-200">11px</code> düzeyine yükseltildi.</li>
            <li><strong className="text-white">Sadeleştirilmiş Ses Odası Kontrol Barı:</strong> Alt araç çubuğundaki ikincil araçlar (Birlikte İzle, Mini Oyunlar, Beyaz Tahta, 3D Ses, Ses Tahtası, Fısıltı Listeleri, Kamera Blur, Overlay) tek bir <strong>Aktiviteler</strong> menüsünde toplandı.</li>
            <li><strong className="text-white">Shimmer İskeletler, Açık Tema &amp; 5 Dil Çevirisi:</strong> <code className="text-emerald-200">Skeleton</code> yükleyicileri, açık temaya uyumlu <code className="text-emerald-200">ui-modal-surface</code> pencere zemini ve sunucu klasörleri/izleme sırası için tam 5 dilli (<code className="text-emerald-200">tr/en/de/ru/fr</code>) etiket desteği eklendi.</li>
          </ul>
        </div>

        {/* v1.3.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v1.3.0 — Önceki Sürüm</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">Topluluk, AFK &amp; Etkinlikler:</strong> Daraltılabilir renkli <strong>Sunucu Klasörleri</strong>, konuşurken atmayı önleyen akıllı <strong>AFK Ses Taşıma Koruması</strong>, etkinliklerden 15 dakika önce otomatik <code className="text-emerald-200">event_reminder</code> bildirimi, 2x2 <strong>Hızlı Durum Şablonları</strong> ve davet kaynak takibi (<strong>Invite Analytics</strong>) eklendi.</li>
            <li><strong className="text-white">Yayın Klibi, Birlikte İzle &amp; Ses DSP:</strong> Ekran yayınlarında <strong>Anlık 30sn Klip Tamponu &amp; İndirme</strong>, <strong>Birlikte İzle (Watch Together) Ortak Sıra &amp; Çoğunluk Geç Oyu</strong>, <code className="text-emerald-200">500ms/1.5sn</code> gecikmeli gerçek <strong>Mikrofon Yankı Testi</strong> ve 5. gelişmiş DSP profili (<code className="text-emerald-200">voice_isolation</code>) eklendi.</li>
            <li><strong className="text-white">Erişilebilirlik, 5 Dil &amp; Altyapı Modülerliği:</strong> <strong>Yüksek Kontrast</strong>, <strong>Renk Körlüğü Durum Şekilleri</strong> ve <strong>Dar Yan Monitör Kompakt Modu</strong>; tam <strong>Fransızca (FR)</strong> dâhil 5 dilli (%100 anahtar eşleşmeli) <code className="text-emerald-200">i18n</code>; kalıcı SQLite ödeme webhook tekilleştirme (<code className="text-emerald-200">/api/admin/payment-webhooks</code>), Admin Disk Kotası &amp; Webhook kartı, Dedicated Server v1.3.0 eşitlemesi ve 2FA <code className="text-emerald-200">.txt</code> yedek dışa aktarımı tamamlandı.</li>
          </ul>
        </div>

        {/* v1.2.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v1.2.0 — Önceki Sürüm</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">Sohbet, Forum &amp; Anketler:</strong> Çok dilli sözdizimi renklendirme ve diff vurgulu <code className="text-emerald-200">CodeBlock</code> (satır kaydırma dahil), gerçek ses dalga formu dekoderi, Forum konularında <strong>Çözüldü</strong> durumu/filtresi, etkinliklere <code className="text-emerald-200">.ics</code> takvim aktarımı ve <strong>Çoklu Seçim / Anonim / Otomatik Kapanışlı Anketler</strong> eklendi.</li>
            <li><strong className="text-white">Ses Odası, E2EE Medya &amp; Etkileşimli HUD:</strong> Okunmamış rozetli, dosya yüklemeli ve tepkili ses odası sohbeti; WebRTC <strong>Ses/Medya E2EE</strong> + SAS doğrulama kodu, <code className="text-emerald-200">Alt+O</code> etkileşimli HUD &amp; tek tıkla ses çıkış düğmesi, 4 profilli <strong>Spektral DSP Gürültü Engelleme</strong> (Stüdyo / Dengeli / Agresif / Klavye Koruması) ve Windows süreç/WASAPI loopback tespiti tamamlandı.</li>
            <li><strong className="text-white">Mobil, PWA v4 &amp; Mağaza/Altyapı:</strong> Kenardan kaydırarak menü ve sağa kaydırarak yanıtla hareketleri, medya önbellek sınırlı <code className="text-emerald-200">sw.js</code> v4, HMAC imzalı ödeme webhook&apos;u (<code className="text-emerald-200">/api/store/payment-webhook</code>) + yazdırılabilir <strong>Lisans Makbuzu</strong>, sunucu disk kotası (<code className="text-emerald-200">/api/storage/usage</code>) ve ilişkisel SQLite hesap/rapor tabloları eklendi.</li>
          </ul>
        </div>

        {/* v1.1.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v1.1.0 — Önceki Sürüm</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">İkili Medya Akışı &amp; Atomik SQLite:</strong> JSON/Base64 yükünü kaldıran XHR ilerlemeli ve iptal edilebilir <code className="text-emerald-200">/api/upload/stream</code> ikili dosya yükleme, yükleme öncesi <strong>Görsel Kırpma (Orijinal / 16:9 / 1:1) &amp; Açıklama</strong> penceresi ve işlemsel <code className="text-emerald-200">SqliteStore</code> toplu silme/anlık görüntü yazımı eklendi.</li>
            <li><strong className="text-white">Ses, WebRTC &amp; Masaüstü (Tauri):</strong> Üstel geri çekilme ve kibar-eş öncelikli <code className="text-emerald-200">IceRecoveryController</code> (<code className="text-emerald-200">restartIce</code>), kişi başına <strong>RMS Ses Düzeyi Dengeleyici</strong>, <strong>3 Bantlı Spektral Gürültü Bastırma</strong> Worklet telemetrisi, Windows görev çubuğu ses rozeti ve <code className="text-emerald-200">GoLiveModal</code> açık pencere/monitör seçicisi eklendi.</li>
            <li><strong className="text-white">Sohbet 2.0 &amp; Topluluk:</strong> <code className="text-emerald-200">ResizeObserver</code> ile değişken yüksekliğe uyumlu sanal mesaj listesi, <strong>Markdown 2.0</strong> (GFM tablolar, satır içi kod, başlıklar, listeler, <code className="text-emerald-200">||spoiler||</code>), sunucuya özel <strong>Takma Adlar</strong>, <strong>Rol İkonları</strong>, kenar çubuğunda <strong>Aktif Alt Konular</strong> ve moderatör <strong>Toplu Mesaj Silme</strong> eklendi.</li>
            <li><strong className="text-white">Güvenlik &amp; E2EE:</strong> Tek kullanımlık ve sunucuda sıfır kalıcı iz bırakan <strong>Cihazlar Arası QR Kod ile E2EE Anahtar Eşleştirme</strong> (<code className="text-emerald-200">/api/e2ee/pairing/*</code>), 1-e-1 DM <strong>E2EE Anahtar Değişimi (TOFU) Uyarısı</strong> ve <strong>Grup DM E2EE Şifreli Dosya/Medya Ekleri</strong> tamamlandı.</li>
            <li><strong className="text-white">Yasal Uyumluluk, KVKK &amp; 5651 Moderasyon:</strong> 37 maddelik kapsamlı 5 yasal metin, zorunlu kayıt sözleşme onayı, <strong>KVKK Madde 11 Kişisel Veri Dışa Aktarma (.json)</strong> (<code className="text-emerald-200">/api/account/export</code>), mesaj/kullanıcı <strong>Şikayet Etme ve Moderatör İnceleme Paneli</strong> (<code className="text-emerald-200">/api/reports</code>) ile <strong>Dedicated Server v1.1.0</strong> özellik eşitlemesi eklendi.</li>
          </ul>
        </div>

        {/* v1.0.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v1.0.0 — Önceki Sürüm</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">Topluluk Yönetimi &amp; İzinler:</strong> Kanal bazlı <strong>İzin Geçersiz Kılmaları &amp; Gizli Kanallar</strong>, <strong>Sunucu Denetim Günlüğü (Audit Log)</strong>, <strong>Moderasyon Sicili (Warn/Timeout/Kick/Ban)</strong>, <strong>Karşılama (Onboarding) &amp; Seçilebilir Roller</strong>, <strong>Zamanlanmış Mesajlar</strong>, akıllı arama filtreleri (<code className="text-emerald-200">has:image</code>, <code className="text-emerald-200">is:pinned</code>, <code className="text-emerald-200">from:@</code>) ve <code className="text-emerald-200">.md/.json</code> sohbet dışa aktarımı eklendi.</li>
            <li><strong className="text-white">Sahne, Çoklu Yayın &amp; Medya:</strong> Konuşmacı/dinleyici/söz isteme destekli <strong>Sahne Kanalları (Stage)</strong>, <strong>Çoklu Ekran Yayını Izgarası</strong>, canlı <strong>Ekran Üzeri Çizim</strong>, 60 sn <strong>Video Notları</strong>, ortak <strong>Sunucu Ses Tahtası &amp; Sticker Paketleri</strong> ve <strong>Canlı Ses Altyazıları</strong> eklendi.</li>
            <li><strong className="text-white">Botlar, Otomasyon, Grup E2EE &amp; Passkey:</strong> <code className="text-emerald-200">/api/bot/v1/...</code> REST API &amp; özel <code className="text-emerald-200">/komutlar</code>, görsel <strong>AutoMod Otomasyon Kuralları</strong>, <strong>Grup DM AES-256-GCM E2EE (Sender Keys + Epoch Rotasyonu)</strong> ve sıfır bağımlılıklı <strong>WebAuthn Passkey (ES256 P-256)</strong> girişi eklendi.</li>
            <li><strong className="text-white">Masaüstü (Tauri) &amp; Performans:</strong> <strong>Mouse4 / Mouse5 / Orta Tuş</strong> donanım PTT, ayarlanabilir PTT bırakma gecikmesi (<code className="text-emerald-200">0..1500 ms</code>), Linux XDG autostart, <strong>Oyun Algılandığında Otomatik DND</strong>, Dedicated Server <code className="text-emerald-200">v1.0.0</code> eşliği, güçlendirilmiş <code className="text-emerald-200">Ctrl+K</code> komut paleti ve %28 küçültülmüş ana JS paketi tamamlandı.</li>
          </ul>
        </div>

        {/* v0.9.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v0.9.0 — Önceki Sürüm</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">Topluluk &amp; İletişim:</strong> Sürükle-bırak <strong>Kanal Kategorileri</strong>, yönetici korumalı <strong>Duyuru</strong> ve etiketli <strong>Forum</strong> kanalları, <strong>Grup DM + Grup Sesli Arama</strong> eklendi.</li>
            <li><strong className="text-white">Webhook, Şablon &amp; E2EE Ekler:</strong> Forgejo/GitHub/Discord uyumlu <strong>Gelen Webhook&apos;lar</strong>, 6 sunucu şablonu &amp; JSON şablondan sunucu kurma, <strong>Mesaj İletme</strong> ve istemci tarafı <strong>AES-256-GCM E2EE şifreli dosya/resim</strong> paylaşımı eklendi.</li>
            <li><strong className="text-white">Ses DSP &amp; Masaüstü (Tauri):</strong> 80 Hz HPF ve klavye filtreli <code className="text-emerald-200">AudioWorklet</code> canlı dB/geçit telemetrisi, dinamik sistem tepsisi rozeti/tooltip&apos;i, özelleştirilebilir <strong>Global Kısayollar</strong> ve Linux/Android CI iş akışları eklendi.</li>
            <li><strong className="text-white">Operasyon &amp; Kalite:</strong> Canlı <strong>SQLite Sıcak Yedekleme (<code className="text-emerald-200">VACUUM INTO</code>)</strong>, sahipsiz <code className="text-emerald-200">/uploads</code> medya temizleyici, 120 noktalı metrik geçmişi grafiği ve Playwright tarayıcı E2E test paketi tamamlandı.</li>
          </ul>
        </div>

        {/* v0.8.2 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v0.8.2 — Önceki Sürüm</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">Üst Menü &amp; Katman Düzeltmesi:</strong> Sohbet başlığındaki <strong>Bildirim Tercihi</strong> ve <strong>Kanal Araçları</strong> açılır menülerinin sabit duyuru çubuğunun altında kalmasına yol açan CSS stacking-context çakışması giderildi (<code className="text-cyan-300">&lt;header&gt;</code> <code className="text-cyan-300">z-30</code>, DM görüşme alanı &amp; mesaj giriş alanı <code className="text-cyan-300">z-20</code>, duyuru çubuğu <code className="text-cyan-300">z-10</code>, mesaj listesi <code className="text-cyan-300">z-0</code>); mesaj satırı taşma menüleri ve gizli hover araç çubuğu etkileşimleri izole edildi.</li>
          </ul>
        </div>

        {/* v0.8.1 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v0.8.1 — Önceki Sürüm</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">Tema Tokenları &amp; Performans:</strong> Tüm temalara uyumlu aksan değişkenleri (<code className="text-cyan-300">--ui-accent</code>, <code className="text-cyan-300">.ui-accent-bg</code>, <code className="text-cyan-300">.ui-accent-bar</code>), dengelenmiş cam/bulanıklık (<code className="text-cyan-300">backdrop-filter</code>) performansı ve gerçek <code className="text-cyan-300">compact</code> mesaj yoğunluğu desteği eklendi.</li>
            <li><strong className="text-white">Sohbet Düzeni (chatLayout) &amp; Tarih Ayırıcıları:</strong> Ayarlar&apos;dan seçilebilen <strong>Otomatik / Klasik Akış / Balon</strong> görünüm modu, yerelleştirilmiş tarih ayırıcıları (<code className="text-cyan-300">Bugün</code> / <code className="text-cyan-300">Dün</code> / tarih), iskelet yükleyici (<code className="text-cyan-300">MessageSkeletonList</code>) ve 4 dilli arayüz anahtarları eklendi.</li>
            <li><strong className="text-white">Sohbet Ergonomisi &amp; Çok Satırlı Giriş:</strong> Çalışır bildirim zili menüsü, sadeleştirilmiş başlık + <strong>Kanal Araçları</strong> menüsü, alıntıya tıklayarak mesaja atlama, akıllı kaydırma/yeni mesaj rozeti, sadeleştirilmiş mesaj eylem çubuğu ve büyüyen çok satırlı mesaj kutusu (<code className="text-cyan-300">Shift+Enter</code>) eklendi.</li>
            <li><strong className="text-white">Birleşik Banner Yığını &amp; Masaüstü/Web Yerleşimi:</strong> Çakışmayan <code className="text-cyan-300">AppBannerStack</code>, masaüstü web&apos;de üst araç çubuğu (<code className="text-cyan-300">WindowTitleBar</code>), daraltılabilir kanal kenar çubuğu, <code className="text-cyan-300">xl:</code> üye listesi düzeni ve seçilebilir profil metinleri tamamlandı.</li>
          </ul>
        </div>

        {/* v0.8.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v0.8.0 — Önceki Sürüm</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li><strong className="text-white">CORS &amp; Hata İzleme Sertleştirme:</strong> Hata fırlatmayan CORS yönetimi (<code className="text-cyan-300">corsConfig</code>, <code className="text-cyan-300">CORS_ALLOWED_ORIGINS</code>, same-host desteği), merkezi Express hata yakalayıcı, hassas alan maskelemeli yapısal JSON loglayıcı ve <code className="text-cyan-300">X-Request-Id</code> izleme eklendi.</li>
            <li><strong className="text-white">Oturum, Socket &amp; Dedicated Güvenlik:</strong> Oturum/medya token iptal (<code className="text-cyan-300">minTokenIssuedAt</code>) ve ban kontrolü birleştirildi; Socket.IO çalışma zamanı şema doğrulayıcı + olay bazlı hız sınırlayıcı (<code className="text-cyan-300">socketGuard</code>) ile dedicated sunucuda asenkron <code className="text-cyan-300">scrypt</code> doğrulama eklendi.</li>
            <li><strong className="text-white">SQLite Kalıcılık, Oda Yayını &amp; Modüler Mimari:</strong> Kalıcı <code className="text-cyan-300">read_cursors</code> / <code className="text-cyan-300">audit_logs</code> tabloları, hedef mesaj çevresi bağlam yükleme (<code className="text-cyan-300">getMessagesAround</code> / <code className="text-cyan-300">request_message_context</code>), oda kapsamlı yayın (<code className="text-cyan-300">emitToRelevantUsers</code>), ortak protokol kontratları (<code className="text-cyan-300">shared/contracts.ts</code>) ve ayrıştırılmış soket modülleri devreye alındı.</li>
            <li><strong className="text-white">DM E2EE v2:</strong> IndexedDB tabanlı <code className="text-cyan-300">CryptoKey</code> depolama (eski <code className="text-cyan-300">localStorage</code> anahtar göçü), simetrik 60 haneli Güvenlik Numarası doğrulama penceresi ve PBKDF2 + AES-GCM şifreli anahtar yedekleme/geri yükleme eklendi.</li>
            <li><strong className="text-white">Çevrimdışı Kuyruk, Çoklu Kanal FTS5 Arama &amp; Arayüz:</strong> Kalıcı çevrimdışı mesaj kuyruğu ve banner, tüm kanallarda sunucu FTS5 arama + <strong>Mesaja Atla (Jump-to-Message)</strong>, granüler React bağlamları (<code className="text-cyan-300">Auth/Chat/Voice/Social</code>), tembel yüklenen <code className="text-cyan-300">AuthModal</code> ve modal erişilebilirlik (<code className="text-cyan-300">useFocusTrap</code>, <code className="text-cyan-300">role=&quot;dialog&quot;</code>, <code className="text-cyan-300">aria-modal</code>) tamamlandı.</li>
            <li><strong className="text-white">Modüler Rust &amp; Kalite Güvencesi:</strong> Tauri arka ucu <code className="text-cyan-300">window_state</code>, <code className="text-cyan-300">overlay</code>, <code className="text-cyan-300">remote_assist</code> ve <code className="text-cyan-300">platform</code> (<code className="text-cyan-300">get_platform_capabilities</code>) modüllerine ayrıldı; ESLint/Prettier, uçtan uca Socket.IO/HTTP testleri ve <code className="text-cyan-300">clippy</code>/<code className="text-cyan-300">audit</code> destekli CI hattı kuruldu.</li>
          </ul>
        </div>

        {/* v0.7.1 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v0.7.1 — Önceki Sürüm</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li>Sunucu PII filtrelemesi (<code className="text-cyan-300">toPublicUser</code>) ile diğer kullanıcılara yayınlanan gereksiz alanlar temizlendi.</li>
            <li>Yüklenen medya dosyalarına (<code className="text-cyan-300">/uploads</code>) oturum/mediaToken doğrulaması ve <code className="text-cyan-300">no-referrer</code> koruması eklendi.</li>
            <li>Şifremi Unuttum (e-posta OTP ile şifre sıfırlama), OTP doğrulamalı e-posta değişikliği, tekil oturum sonlandırma ve kalıcı hesap silme akışları eklendi.</li>
            <li>Tüm şifre belirleme/değiştirme adımları ortak şifre politikası ve canlı güç göstergesi ile birleştirildi.</li>
            <li>Kalıcı kanal okunma işaretçileri (<code className="text-cyan-300">readCursors</code>) ve SSRF korumalı OpenGraph bağlantı önizleme kartları eklendi.</li>
            <li>Dedicated sunucuya atomik kalıcılık (<code className="text-cyan-300">state.json</code>) eklendi ve sabit test hesapları kaldırıldı.</li>
            <li>PWA önbellekleme (<code className="text-cyan-300">cakma-pwa-v3</code>), bildirim tıklama derin bağlantıları ve 4 dilli (TR/EN/DE/RU) giriş &amp; ayar çevirileri tamamlandı.</li>
          </ul>
        </div>

        {/* v0.7.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">v0.7.0 — Önceki Sürüm</span>
          </div>
          <ul className="space-y-1 text-xs text-white/75 list-disc pl-4">
            <li><strong className="text-white">Kalıcı Hesap Kimliği &amp; Odaya Çekme Düzeltmesi:</strong> Sunucu sahipliği, rol yetkileri, XP/seviye kayıtları ve etkinlik silme hakları geçici <code className="text-cyan-300">socket.id</code> yerine kalıcı <code className="text-cyan-300">accountId</code> üzerine taşındı; ses odasına çekme daveti kapsam hatası giderildi ve <code className="text-cyan-300">.secrets.json</code> veri dizini hizalandı.</li>
            <li><strong className="text-white">Güvenlik &amp; İzolasyon Sertleştirme:</strong> Asimetrik <strong>Ed25519</strong> (<code className="text-cyan-300">LIC2-</code>) lisans imzalama, dedicated sunucuda kimlik doğrulamalı iptal webhook&apos;u + CORS/rate-limit/scrypt, <code className="text-cyan-300">/api/events</code> ve <code className="text-cyan-300">voice_state_update</code> üye izolasyonu, yükleme kotası ve Uzaktan Yardım <strong>Güvenli Kısayol Koruması</strong> (<code className="text-cyan-300">Alt+F4 / Win+R / Ctrl+Shift+Esc</code> filtresi + girdi hız sınırı) eklendi.</li>
            <li><strong className="text-white">SQLite Ana Mesaj Motoru &amp; Yüksek Performans:</strong> Mesajlar doğrudan <code className="text-cyan-300">node:sqlite</code> WAL + FTS5 tablosunda sayfalı/indeksli tutulur; yazıyor/bağlantı kalitesi <code className="text-cyan-300">PresenceStore</code> ile React yeniden çizimleri azaltıldı; bellek önbellekleri periyodik temizlenir.</li>
            <li><strong className="text-white">Gerçek Web Push (VAPID) &amp; CI Hattı:</strong> Çevrimdışı DM, @bahsetme ve gelen aramalar için RFC 8291 (<code className="text-cyan-300">aes128gcm</code>) Web Push desteği, Ayarlar&apos;dan tek tık test/abonelik yönetimi ve GitHub CI test hattı eklendi.</li>
          </ul>
        </div>

        {/* v0.6.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="text-xs font-bold text-cyan-300">v0.6.0 — Önceki Sürüm</div>
          <ul className="space-y-1 text-xs text-white/75 list-disc pl-4">
            <li><strong className="text-white">Sunucuları Keşfet &amp; İsteğe Bağlı Üyelik:</strong> Yeni kayıt olan kullanıcılar artık sunuculara otomatik eklenmez; kategoriler, canlı çevrimiçi/ses sayıları, davet önizlemesi ve aranabilir platform rehberi sunan yenilenmiş Keşfet merkezinden gönüllü katılır.</li>
            <li><strong className="text-white">1-e-1 Görüşme &amp; Pro Uzaktan Yardım:</strong> <code className="text-cyan-300">RTCDataChannel</code> üzerinden düşük gecikmeli kontrol, Windows <code className="text-cyan-300">SendInput</code> Unicode (Türkçe tam destek) ve çoklu monitör seçimi, <code className="text-cyan-300">Ctrl+Alt+Esc / Pause</code> acil durdurma, host ekranı üst kontrol HUD&apos;ı, canlı çizim/lazer, Zoom &amp; Pan, dosya/pano transferi ve kalıcı DM arama kayıtları eklendi.</li>
            <li><strong className="text-white">Gizlilik İzolasyonu, Kalıcı DM &amp; Disk Yükleme:</strong> DM ve kanal olayları yalnızca yetkili üyelere kapsamlandı; oturumdan bağımsız kalıcı DM kanal kimlikleri, <code className="text-cyan-300">/api/upload</code> disk tabanlı dosya/görsel barındırma ve yerel tarayıcı kutularının yerini alan uygulama içi toast/onay modalları eklendi.</li>
          </ul>
        </div>

        {/* v0.5.1 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="text-xs font-bold text-cyan-300">v0.5.1 — Önceki Sürüm</div>
          <ul className="space-y-1 text-xs text-white/75 list-disc pl-4">
            <li><strong className="text-white">Yönetim Paneli &amp; REST API Güvenliği:</strong> Tüm <code className="text-cyan-300">/api/admin/*</code>, <code className="text-cyan-300">/api/sessions/*</code>, <code className="text-cyan-300">/api/user-prefs/*</code>, etkinlik ve ses yükleme uç noktalarına oturum/admin yetki doğrulaması ve Webhook SSRF koruması eklendi.</li>
            <li><strong className="text-white">Modern Uygulama İçi Modallar &amp; Çekmece:</strong> Tarayıcı <code className="text-cyan-300">prompt/confirm/alert</code> kutuları kaldırılarak süre seçenekli yasaklama, şifre üreteci, cüzdan düzenleme, kanal temizleme ve birleşik Kullanıcı Detay Çekmecesi eklendi.</li>
            <li><strong className="text-white">Canlı Metrik Grafiği &amp; LiveKit/TURN Testi:</strong> Genel Bakış sekmesine <code className="text-cyan-300">/api/metrics</code> canlı RAM/kullanıcı SVG sparkline grafikleri ve Sistem Ayarlarına canlı LiveKit/TURN bağlantı testi eklendi.</li>
          </ul>
        </div>

        {/* v0.5.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="text-xs font-bold text-cyan-300">v0.5.0 — Önceki Sürüm</div>
          <ul className="space-y-1 text-xs text-white/75 list-disc pl-4">
            <li><strong className="text-white">Doğal Masaüstü Yetenekleri (Tauri / Rust):</strong> Tek pencere kilidi, oyun içi global <strong>Bas-Konuş (PTT)</strong>, pencere boyut/konum hatırlama, <code className="text-cyan-300">cakma://invite</code> derin bağlantı ve zengin sistem tepsisi menüsü eklendi.</li>
            <li><strong className="text-white">Sohbet UX &amp; Performans:</strong> Kanal/DM taslak kaydı, <code className="text-cyan-300">↑</code> ile son mesajı düzenleme, <code className="text-cyan-300">Alt + ↑/↓</code> kanal gezintisi, Lightbox, sanallaştırılmış liste ve modal lazy-loading eklendi.</li>
            <li><strong className="text-white">Ses, Video &amp; Bulut Ayarları:</strong> Kanal susturma tercihleri, kişi bazlı ses/EQ bulut senkronizasyonu, Spotlight + arka plan bulanıklaştırma ve ICE Restart eklendi.</li>
          </ul>
        </div>

        {/* v0.4.1 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="text-xs font-bold text-cyan-300">v0.4.1 — Önceki Sürüm</div>
          <ul className="space-y-1 text-xs text-white/75 list-disc pl-4">
            <li><strong className="text-white">Yeni Kırmızı-Beyaz Marka Logosu &amp; Başlık Çubuğu:</strong> İkon seti yenilendi, aktif ses odası &amp; SFU/P2P rozeti, ping rozeti, üye arama ve DM okunmamış sayacı eklendi.</li>
          </ul>
        </div>

        {/* v0.4.0 */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="text-xs font-bold text-cyan-300">v0.4.0 — Önceki Sürüm</div>
          <ul className="space-y-1 text-xs text-white/75 list-disc pl-4">
            <li><strong className="text-white">LiveKit SFU &amp; TURN, Spektral Gürültü Engelleme &amp; Parçalı Depolama:</strong> SFU yayın/EQ, AudioWorklet DSP, <code className="text-cyan-300">VoiceMetricsContext</code>, kanal sayfalama ve WebP sıkıştırma eklendi.</li>
          </ul>
        </div>

        {/* v0.3.x & earlier */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="text-xs font-bold text-white/80">v0.3.14 &amp; Önceki Sürümler</div>
          <ul className="space-y-1 text-xs text-white/65 list-disc pl-4">
            <li>Açık temalar, özel cam başlık çubuğu, HDR/AV1 ekran paylaşımı, Oyun Overlay, GIPHY GIF galerisi, çoklu dil desteği (TR/EN/DE/RU), bulut tercihleri ve AES-256-GCM şifreli yedekleme.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
