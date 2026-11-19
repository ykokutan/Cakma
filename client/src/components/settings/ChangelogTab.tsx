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
        {/* v0.7.1 - Latest */}
        <div className="p-3.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-300">v0.7.1 — Son Sürüm</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">Yeni</span>
          </div>
          <ul className="text-[11px] text-white/75 space-y-1 list-disc list-inside leading-relaxed">
            <li>Sunucu PII filtrelemesi (<code className="text-emerald-200">toPublicUser</code>) ile diğer kullanıcılara yayınlanan gereksiz alanlar temizlendi.</li>
            <li>Yüklenen medya dosyalarına (<code className="text-emerald-200">/uploads</code>) oturum/mediaToken doğrulaması ve <code className="text-emerald-200">no-referrer</code> koruması eklendi.</li>
            <li>Şifremi Unuttum (e-posta OTP ile şifre sıfırlama), OTP doğrulamalı e-posta değişikliği, tekil oturum sonlandırma ve kalıcı hesap silme akışları eklendi.</li>
            <li>Tüm şifre belirleme/değiştirme adımları ortak şifre politikası ve canlı güç göstergesi ile birleştirildi.</li>
            <li>Kalıcı kanal okunma işaretçileri (<code className="text-emerald-200">readCursors</code>) ve SSRF korumalı OpenGraph bağlantı önizleme kartları eklendi.</li>
            <li>Dedicated sunucuya atomik kalıcılık (<code className="text-emerald-200">state.json</code>) eklendi ve sabit test hesapları kaldırıldı.</li>
            <li>PWA önbellekleme (<code className="text-emerald-200">cakma-pwa-v3</code>), bildirim tıklama derin bağlantıları ve 4 dilli (TR/EN/DE/RU) giriş &amp; ayar çevirileri tamamlandı.</li>
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
