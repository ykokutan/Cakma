export type LegalDocumentId = 'terms' | 'privacy' | 'kvkk' | 'community' | 'cookies';

export const LEGAL_DOCUMENTS_VERSION = '1.1.0';
export const LEGAL_LAST_UPDATED = '25 Kasım 2026';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  shortTitle: string;
  subtitle: string;
  sections: LegalSection[];
}

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    id: 'terms',
    title: 'Kullanıcı Sözleşmesi ve Kullanım Koşulları',
    shortTitle: 'Kullanıcı Sözleşmesi',
    subtitle: 'Çakma sesli, görüntülü iletişim, ekran paylaşımı ve topluluk platformu kullanım şartları.',
    sections: [
      {
        heading: '1. Taraflar, Kapsam ve Tanımlar',
        paragraphs: [
          'Bu Kullanıcı Sözleşmesi ("Sözleşme"), Çakma web istemcisi ve Tauri tabanlı masaüstü uygulaması ("Platform") ile Platform üzerinden hesap oluşturan veya bağlantılı sunuculara erişen gerçek kişi ("Kullanıcı") arasındaki hak ve yükümlülükleri düzenler.',
          'Kayıt formunda onay kutusunu işaretleyerek hesap oluşturmanız anında işbu Sözleşme, Gizlilik Politikası, KVKK Aydınlatma Metni, Topluluk Kuralları ve Çerez Politikası elektronik ortamda yürürlüğe girer ve bağlayıcı nitelik kazanır.',
        ],
        bullets: [
          'Platform: Çakma istemci yazılımı, merkezi kimlik/mesajlaşma sunucusu ve isteğe bağlı ayrılmış ses/sohbet sunucu yazılımını ifade eder.',
          'Topluluk Sunucusu: Kullanıcılar tarafından oluşturulan çoklu kanal, rol, bot, webhook ve ses odası barındıran sanal çalışma alanlarıdır.',
        ],
      },
      {
        heading: '2. Yaş Sınırı, Ehliyet ve Hesap Güvenliği',
        paragraphs: [
          'Platformu kullanabilmek için en az 13 yaşında olmanız; reşit değilseniz yasal veli veya vasinizin açık onayıyla kayıt olmanız gerekir. Gerçeğe aykırı e-posta adresi bildirilmesi veya güvenlik doğrulamasını aşmaya yönelik otomasyon kullanımı hesap kapatma sebebidir.',
        ],
        bullets: [
          'Kullanıcı, parolasını, TOTP iki adımlı doğrulama kurtarma kodlarını ve Passkey kimlik bilgisini korumakla bizzat yükümlüdür.',
          'Tek hesap tek kişiye aittir; hesap satışı, kiralanması veya yetkisiz kişilere kullandırılması yasaktır.',
          'Yetkisiz oturum tespit edildiğinde Kullanıcı, Ayarlar → Aktif Oturumlar üzerinden tüm cihaz oturumlarını anında iptal etmelidir.',
        ],
      },
      {
        heading: '3. Hizmet Kapsamı ve İletişim Araçları',
        paragraphs: [
          'Çakma; gerçek zamanlı metin sohbetleri, alt konular (Threads), duyuru ve forum kanalları, WebRTC P2P ve LiveKit SFU destekli sesli/görüntülü iletişim, ekran paylaşımı, ses tahtası ve dosya paylaşımı imkanları sunar.',
        ],
        bullets: [
          'Platform kesintisiz %100 erişilebilirlik veya sıfır gecikme taahhüdü vermez; planlı bakım modunda geçici erişim kısıtlaması uygulanabilir.',
          'Ek dosya yüklemelerinde güvenlik politikası gereği çalıştırılabilir uzantılar engellenir ve boyut limitleri sunucu yapılandırmasına göre uygulanır.',
        ],
      },
      {
        heading: '4. Uzaktan Yardım (Remote Assist) ve Masaüstü Yetkileri',
        paragraphs: [
          'Uzaktan Yardım özelliği yalnızca paylaşım başlatan kullanıcının açık, adım adım onayı ve belirlediği izin kapsamı (Kontrol, Pano, Ekran Çizimi) dahilinde çalışır.',
        ],
        bullets: [
          'Bağlantıyı paylaşan kullanıcı dilediği an duraklatma (Pause) veya acil durdurma (Killswitch) kısayolunu kullanarak uzaktan girişi kesebilir.',
          'Platform, uzaktan kontrol sırasında kullanıcılar arasında gerçekleşen dosya, komut veya ekran işlemlerinden doğan veri kaybından veya üçüncü kişi zararlarından sorumlu tutulamaz.',
        ],
      },
      {
        heading: '5. Fikri Mülkiyet ve 5846 Sayılı FSEK Uyumluluğu',
        paragraphs: [
          'Çakma arayüzü, kaynak kodu, marka unsurları ve görsel tasarımları telif hakları kapsamında korunmaktadır. Kullanıcıların Platforma yüklediği mesaj, görsel, ses kaydı ve dosya içeriklerinin mülkiyeti yükleyen Kullanıcıya aittir.',
        ],
        bullets: [
          'Kullanıcı, paylaştığı içeriklerin kanal üyelerine veya sohbet muhatabına iletilebilmesi, önizleme oluşturulabilmesi ve sunucu yedekleme/önbellekleme süreçlerinde işlenebilmesi için münhasır olmayan, ücretsiz teknik kullanım lisansı vermiş olur.',
          'Üçüncü kişilere ait telif hakkı, marka veya ticari sırrı ihlal eden içeriklerin paylaşımından doğan tüm hukuki ve cezai sorumluluk paylaşan Kullanıcıya aittir.',
        ],
      },
      {
        heading: '6. Bağımsız (Dedicated) ve Topluluk Sunucularının Sorumluluğu',
        paragraphs: [
          'Platform altyapısında kullanıcılar tarafından kurulan topluluk sunucuları veya bağımsız barındırılan Dedicated Server örnekleri kendi yöneticileri tarafından idare edilir.',
        ],
        bullets: [
          'Sunucu sahipleri ve moderatörleri; kanal izinleri, AutoMod kuralları, bot ve gelen webhook entegrasyonlarının yasalara uygun kullanımından sorumludur.',
          'Bağımsız barındırılan özel sunuculara bağlanıldığında veriler ilgili sunucu sahibinin belirlediği depolama ortamına iletilir.',
        ],
      },
      {
        heading: '7. Yasaklı Kullanımlar, Moderasyon ve Hesap Feshi',
        paragraphs: [
          'Topluluk Kuralları\'nı veya yürürlükteki mevzuatı ihlal eden davranışlar tespit edildiğinde uyarı, geçici susturma (Timeout), sunucudan çıkarma (Kick), kalıcı yasaklama (Ban) veya sistem geneli hesap askıya alma uygulanabilir.',
        ],
        bullets: [
          'Kullanıcı, Ayarlar → Hesap Güvenliği → Hesabımı Sil adımıyla hesabını dilediği zaman kendi iradesiyle kalıcı olarak kapatabilir.',
        ],
      },
      {
        heading: '8. Sorumluluk Sınırı ve Mücbir Sebepler',
        paragraphs: [
          'Platform "olduğu gibi" (as-is) sunulmaktadır. Doğal afet, siber saldırı, internet omurga kesintileri, elektrik arızaları ve yasal düzenleyici kararları gibi mücbir sebep hallerinden kaynaklanan kesintilerden dolayı Platform sorumlu tutulamaz.',
        ],
      },
      {
        heading: '9. Sözleşme Değişiklikleri, 5651 Uyumluluğu ve Uygulanacak Hukuk',
        paragraphs: [
          'Bu Sözleşme\'den doğabilecek tüm uyuşmazlıklarda Türkiye Cumhuriyeti kanunları (5651 sayılı Kanun, 6698 sayılı KVKK ve 6098 sayılı TBK dahil) uygulanır. Güncel sözleşme sürümü uygulama içi Hakkında ve Sürüm Geçmişi ekranlarından takip edilebilir.',
        ],
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Gizlilik Politikası',
    shortTitle: 'Gizlilik Politikası',
    subtitle: 'Verilerinizin toplanması, şifrelenmesi, saklanması ve korunmasına ilişkin kapsamlı esaslar.',
    sections: [
      {
        heading: '1. Kapsam ve Gizlilik Yaklaşımı',
        paragraphs: [
          'Çakma, minimum veri toplama (data minimization) ve istemci tarafı uçtan uca şifreleme prensipleriyle tasarlanmıştır. Verileriniz hiçbir şekilde üçüncü taraf reklam ağlarına satılmaz veya profilleme amacıyla paylaşılmaz.',
        ],
      },
      {
        heading: '2. İşlenen Veri Kategorileri',
        paragraphs: [
          'Hizmetin çalışabilmesi ve hesap güvenliğinin sağlanması için yalnızca aşağıdaki teknik ve profil verileri işlenir:',
        ],
        bullets: [
          'Kimlik ve Hesap Bilgileri: Kullanıcı adı, e-posta adresi, scrypt tuzlanmış parola özeti, avatar, banner ve biyografi bilgileri.',
          'İletişim ve Topluluk Verileri: Sunucu üyelikleri, rol/izin atamaları, şifrelenmemiş genel kanal mesajları, tepkiler, anket oyları ve yüklenen ek dosyalar.',
          'Güvenlik ve Denetim Kayıtları: Yeni cihaz IP bildirimleri, aktif oturum User-Agent bilgisi, 2FA/Passkey doğrulama kayıtları ve sunucu denetim günlüğü olayları.',
        ],
      },
      {
        heading: '3. Uçtan Uca Şifreleme (E2EE) ve Sıfır Sunucu Bilgisi',
        paragraphs: [
          '1\'e 1 Direkt Mesajlarda (`[E2EE:v1]`) ve Grup DM\'lerde (`[GE2EE:v1]`) E2EE açıkken metinler ve dosya ekleri cihazınızdan ayrılmadan önce WebCrypto P-256 ECDH ve AES-256-GCM algoritmalarıyla şifrelenir.',
        ],
        bullets: [
          'Özel anahtarlar yalnızca tarayıcı veya masaüstü uygulamasının yerel IndexedDB (`cakma_e2ee_v2`) alanında saklanır; sunucu tarafında düz metin veya özel anahtar bulunmaz.',
          'Cihazlar arası QR Kod Eşleştirme (`/api/e2ee/pairing/*`) sırasında istemci PIN kodu sunucuya gönderilmez; yalnızca istemci tarafında PBKDF2 + AES-GCM ile şifrelenmiş yedek en fazla 120 saniye RAM\'de tutulur ve ilk okumada kalıcı olarak silinir.',
        ],
      },
      {
        heading: '4. Sesli/Görüntülü Görüşme ve Ekran Paylaşımı Trafiği',
        paragraphs: [
          'Gerçek zamanlı ses, kamera ve ekran yayını paketleri WebRTC DTLS/SRTP şifrelemesi ile doğrudan eşler arası (P2P) veya sunucu tabanlı LiveKit SFU medya aktarıcısı üzerinden geçirilir.',
        ],
        bullets: [
          'Kullanıcının kendi cihazında yerel ses kaydı başlatması haricinde sunucular sesli veya görüntülü görüşmeleri otomatik olarak kaydetmez.',
          'TURN/STUN aktarımında yalnızca ICE bağlantı aday IP bilgileri oturum süresince işlenir.',
        ],
      },
      {
        heading: '5. Veri Saklama Süreleri ve Otomatik Temizlik',
        paragraphs: [
          'Veriler yasal zorunluluklar ve hizmet gereksinimleriyle orantılı süreler boyunca saklanır:',
        ],
        bullets: [
          'Mesaj ve ek dosyalar, kanal sahibi veya moderatör tarafından silinene ya da kullanıcı hesabını kapatana kadar saklanır; sahipsiz yüklemeler arka plan temizleyicisiyle periyodik olarak temizlenir.',
          'QR E2EE eşleştirme verileri en fazla 120 saniye, OTP doğrulama kodları kısa ömürlü TTL süresi dolduğunda otomatik imha edilir.',
        ],
      },
      {
        heading: '6. Üçüncü Taraf Hizmetler ve Alt İşleyenler',
        paragraphs: [
          'Platform temel olarak kendi barındırılan altyapı üzerinde çalışır. E-posta OTP doğrulamaları yapılandırılmış SMTP/Mail Relay üzerinden iletilir; harici bağlantı önizlemeleri SSRF korumalı sunucu vekili aracılığıyla yalnızca URL başlık bilgisi çeker.',
        ],
      },
      {
        heading: '7. Çocukların Gizliliği',
        paragraphs: [
          '13 yaş altındaki çocuklardan bilerek kişisel veri toplanmaz. Ebeveyn veya yasal vasinin bildirimi üzerine ilgili yaş sınırının altındaki hesaplar inceleme sonrası derhal sonlandırılır.',
        ],
      },
      {
        heading: '8. Veri Sahibi Hakları ve Hesap Silme',
        paragraphs: [
          'Kullanıcılar istedikleri anda sohbet geçmişlerini `.md`/`.json` olarak dışa aktarabilir, Şifreli E2EE Anahtar Yedeği indirebilir ve Ayarlar → Hesap Güvenliği üzerinden hesaplarını kalıcı olarak silebilir.',
        ],
      },
    ],
  },
  {
    id: 'kvkk',
    title: 'KVKK Aydınlatma Metni (6698 Sayılı Kanun)',
    shortTitle: 'KVKK Aydınlatma',
    subtitle: '6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") m.10 uyarınca aydınlatma beyanı.',
    sections: [
      {
        heading: '1. Veri Sorumlusunun Kimliği',
        paragraphs: [
          '6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca kişisel verileriniz, Çakma Platformu sunucu işletmecisi/veri sorumlusu tarafından aşağıda açıklanan kapsam ve hukuki sebeplerle sınırlı olarak işlenmektedir.',
        ],
      },
      {
        heading: '2. İşlenen Kişisel Veri Kategorileri',
        paragraphs: [
          'Platformun kullanımı sırasında kimlik doğrulama ve iletişim amacıyla şu veri kategorileri işlenir:',
        ],
        bullets: [
          'Kimlik ve İletişim Verisi: Kullanıcı adı, sunucu içi takma ad, e-posta adresi.',
          'İşlem Güvenliği Verisi: Parola kriptografik özeti (scrypt), oturum token tanımlayıcıları, giriş IP adresi, tarayıcı/cihaz bilgisi, 2FA/Passkey doğrulama kayıtları ve denetim logları.',
          'Görsel ve İşitsel İletişim Verisi: Kullanıcı tarafından paylaşılan profil/sunucu görselleri, yüklenen medya ekleri ve isteğe bağlı anlık WebRTC medya akışları.',
        ],
      },
      {
        heading: '3. Kişisel Verilerin İşlenme Amaçları',
        paragraphs: [
          'Toplanan kişisel veriler aşağıdaki belirli, açık ve meşru amaçlar doğrultusunda işlenir:',
        ],
        bullets: [
          'Üyelik kaydı oluşturma, giriş güvenliğini sağlama ve şifre sıfırlama/OTP süreçlerini yürütme,',
          'Sunucu kanalları, direkt mesajlaşma, arkadaşlık sistemi ve sesli odaların teknik işleyişini sağlama,',
          'Spam, bot saldırıları, yetkisiz erişim (yeni IP tespiti) ve kural ihlallerini önleme,',
          'Mevzuattan doğan bilgi saklama ve yetkili mercilere bildirim yükümlülüklerini yerine getirme.',
        ],
      },
      {
        heading: '4. Toplama Yöntemi ve Hukuki Sebepler (KVKK m.5)',
        paragraphs: [
          'Verileriniz kayıt ekranı, WebSocket/HTTP oturum istekleri ve kullanıcı ayar formları aracılığıyla tamamen veya kısmen otomatik yollarla toplanmaktadır.',
        ],
        bullets: [
          'KVKK m. 5/2-c: Sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması,',
          'KVKK m. 5/2-ç: Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi için zorunlu olması,',
          'KVKK m. 5/2-f: İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla, hesap güvenliği ve kötüye kullanımı önleme yönündeki meşru menfaatler.',
        ],
      },
      {
        heading: '5. Kişisel Verilerin Aktarılması',
        paragraphs: [
          'Kişisel verileriniz pazarlama veya veri ticareti amacıyla üçüncü kişilere aktarılmaz. Yalnızca kendi seçtiğiniz iletişim muhataplarıyla paylaşılan içerikler ilgili sunucu/sohbet katılımcılarına iletilir ve e-posta OTP gönderimleri için yetkili mail aktarım sunucusuna sınırlı aktarım yapılır.',
        ],
      },
      {
        heading: '6. Saklama, İmha ve Alınan Teknik Tedbirler',
        paragraphs: [
          'Veri güvenliği için tuzlanmış scrypt parola karma algoritması, HTTPS/WSS şifreli aktarım, HttpOnly oturum çerezleri, SQLite WAL atomik depolama, hız sınırlamaları (rate limit) ve istemci tarafı P-256 + AES-256-GCM E2EE mekanizmaları uygulanmaktadır.',
        ],
      },
      {
        heading: '7. İlgili Kişinin KVKK Madde 11 Kapsamındaki Hakları',
        paragraphs: [
          'KVKK\'nın 11. maddesi uyarınca veri sorumlusu sunucu yöneticisine başvurarak şu haklarınızı kullanabilirsiniz:',
        ],
        bullets: [
          'Kişisel verinizin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme,',
          'İşlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme,',
          'Eksik veya yanlış işlenmiş verilerin düzeltilmesini ve aktarıldığı taraflara bildirilmesini isteme,',
          'KVKK m. 7 çerçevesinde silinmesini veya yok edilmesini isteme (uygulama içi Ayarlar → Hesap Güvenliği → Hesabımı Sil üzerinden anında işlem yapılabilir),',
          'Kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme.',
        ],
      },
    ],
  },
  {
    id: 'community',
    title: 'Topluluk Kuralları ve İçerik Politikası',
    shortTitle: 'Topluluk Kuralları',
    subtitle: 'Tüm sunucular, sesli odalar, sahne kanalları ve özel mesajlarda uyulması zorunlu davranış ilkeleri.',
    sections: [
      {
        heading: '1. Temel Saygı ve Topluluk Güvenliği İlkesi',
        paragraphs: [
          'Çakma topluluklarının güvenli ve kapsayıcı kalması için tüm katılımcıların diğer kullanıcılara saygılı davranması esastır. Farklı görüşler hakaret veya yıldırma gerekçesi yapılamaz.',
        ],
      },
      {
        heading: '2. Taciz, Nefret Söylemi ve İfşa (Doxxing) Yasağı',
        paragraphs: [
          'Aşağıdaki davranışlar hiçbir koşulda tolere edilmez:',
        ],
        bullets: [
          'Kullanıcılara yönelik tehdit, şantaj, ısrarlı takip (stalking) ve organize linç girişimleri,',
          'Irk, din, cinsiyet, cinsel yönelim, engellilik veya etnik kökene dayalı nefret söylemi,',
          'Başka kişilere ait adres, telefon numarası, kimlik veya özel görsellerin izinsiz paylaşılması (doxxing).',
        ],
      },
      {
        heading: '3. Yasa Dışı İçerik Konusunda Sıfır Tolerans',
        paragraphs: [
          'Çocuk istismarı, terör propagandası, uyuşturucu ticareti, yasa dışı bahis yönlendirmeleri ve şiddeti teşvik eden tüm içerikler kesinlikle yasaktır; tespit halinde hesaplar kalıcı olarak kapatılır ve yasal bildirim yükümlülükleri uygulanır.',
        ],
      },
      {
        heading: '4. Zararlı Yazılım, Oltalama (Phishing) ve Spam',
        paragraphs: [
          'Güvenliği riske atan teknik ihlaller derhal yaptırıma tabidir:',
        ],
        bullets: [
          'Zararlı yazılım barındıran dosyalar, sahte giriş/oturum çalma (phishing) bağlantıları veya token avcılığı paylaşılamaz.',
          'Otomatik mesaj yağmuru (flood), toplu @everyone suistimali veya hız sınırlarını (rate limit) aşmaya yönelik betik kullanımı yasaktır.',
        ],
      },
      {
        heading: '5. Sesli Odalar, Sahne ve Ekran Paylaşımı Etiği',
        paragraphs: [
          'Ses odalarında ve Stage (Sahne) yayınlarında diğer katılımcıların rızası olmadan rahatsız edici derecede yüksek ses/parazit basmak, habersiz gizli ses kaydı alıp kötüye kullanmak veya uygunsuz ekran içeriği yansıtmak yasaktır.',
        ],
      },
      {
        heading: '6. Botlar, Webhooklar ve Otomasyon Sorumluluğu',
        paragraphs: [
          '`/api/bot/v1/...` tokenları, özel slash komutları ve gelen webhooklar yalnızca ilgili sunucu sahibinin yetkilendirdiği kapsamda kullanılmalıdır. İstenmeyen toplu bildirim üreten bot ve webhooklar sunucu yöneticisi veya sistem tarafından iptal edilebilir.',
        ],
      },
      {
        heading: '7. Moderasyon Kademeleri ve Denetim Şeffaflığı',
        paragraphs: [
          'Kuralları ihlal eden kullanıcılara sunucu moderatörleri tarafından sırasıyla veya ihlalin ağırlığına göre Uyarı (Warn), Geçici Susturma (Timeout), Atma (Kick), Yasaklama (Ban) ve Toplu Mesaj Silme uygulanabilir; işlemler sunucu Denetim Günlüğü\'ne işlenir.',
        ],
      },
    ],
  },
  {
    id: 'cookies',
    title: 'Çerez ve Yerel Depolama Politikası',
    shortTitle: 'Çerez Politikası',
    subtitle: 'Zorunlu oturum çerezleri, localStorage tercihleri ve cihaz içi IndexedDB anahtar deposunun kullanımı.',
    sections: [
      {
        heading: '1. Çerez ve Yerel Depolama Nedir?',
        paragraphs: [
          'Çerezler (cookies) ve tarayıcı yerel depolama alanları (`localStorage`, `IndexedDB`), uygulamanın oturumunuzu açık tutması, ses/görüntü ayarlarınızı hatırlaması ve şifreleme anahtarlarını cihazınızda güvenle saklaması için kullanılan teknik bileşenlerdir.',
        ],
      },
      {
        heading: '2. Kesinlikle Zorunlu Oturum Çerezleri',
        paragraphs: [
          'Çakma yalnızca kimlik doğrulama ve yetkili dosya/medya indirme erişimi için sunucu tarafından atanan teknik oturum çerezi kullanır.',
        ],
        bullets: [
          '`HttpOnly` ve `SameSite` güvenlik bayrakları sayesinde oturum çerezine istemci betikleri doğrudan erişemez.',
          'Bu çerezler olmadan güvenli dosya indirme (`/uploads/...`) ve oturum yenileme çalışamayacağı için teknik olarak zorunludur.',
        ],
      },
      {
        heading: '3. `localStorage` Tercih ve Önbellek Verileri',
        paragraphs: [
          'Konforunuz için seçtiğiniz kullanıcı arayüzü ayarları cihazınızın yerel depolamasında saklanır:',
        ],
        bullets: [
          'Seçilen arayüz teması (`uiTheme`), yazı tipi/yoğunluk ayarı, dil (`TR`/`EN`) ve sohbet düzeni,',
          'Mikrofon/hoparlör cihaz kimlikleri, Ses Geçidi (Voice Gate dB), Stüdyo DSP / Loudness Normalizer, PTT tuşu ve gecikme tercihleri,',
          'Kanal bazlı bildirim tercihleri ve henüz gönderilmemiş kanal mesaj taslakları.',
        ],
      },
      {
        heading: '4. `IndexedDB` Uçtan Uca Şifreleme Anahtar Deposu (`cakma_e2ee_v2`)',
        paragraphs: [
          'Uçtan uca şifreli mesajlaşmada kullanılan P-256 ECDH `CryptoKey` nesneleri doğrudan tarayıcı veya masaüstü WebView içindeki `IndexedDB` veritabanında saklanır. Sunucuya yalnızca genel (public) anahtarınız iletilir.',
        ],
      },
      {
        heading: '5. Reklam ve Üçüncü Taraf Takip Çerezlerinin Bulunmaması',
        paragraphs: [
          'Çakma bünyesinde Google Analytics, reklam pikseli, davranışsal takip çerezi veya üçüncü taraf veri toplayıcı SDK\'lar bulunmamaktadır.',
        ],
      },
      {
        heading: '6. Depolamayı Temizleme ve E2EE Anahtar Yedeği Uyarısı',
        paragraphs: [
          'Tarayıcı geçmişini/site verilerini tamamen temizlediğinizde `cakma_e2ee_v2` içindeki yerel E2EE anahtarlarınız da silinir. Bu işlemden önce Ayarlar → Hesap Güvenliği üzerinden **Şifreli E2EE Anahtar Yedeği** almanız veya ikinci bir cihazla **QR Kod Eşleştirme** yapmanız şiddetle önerilir.',
        ],
      },
    ],
  },
];

export function resolveLegalDocFromLocation(pathname: string, search: string): LegalDocumentId | null {
  try {
    const params = new URLSearchParams(search || '');
    const paramDoc = (params.get('legal') || params.get('doc') || '').trim().toLowerCase();
    if (paramDoc) {
      if (paramDoc === 'terms' || paramDoc === 'privacy' || paramDoc === 'kvkk' || paramDoc === 'community' || paramDoc === 'cookies') {
        return paramDoc;
      }
      return 'terms';
    }
  } catch {
    // Ignore malformed query strings
  }

  const cleanPath = (pathname || '').replace(/\/+$/, '').toLowerCase();
  if (cleanPath === '/terms' || cleanPath === '/kullanim-kosullari' || cleanPath === '/sozlesme') return 'terms';
  if (cleanPath === '/privacy' || cleanPath === '/gizlilik') return 'privacy';
  if (cleanPath === '/kvkk') return 'kvkk';
  if (cleanPath === '/community' || cleanPath === '/topluluk-kurallari') return 'community';
  if (cleanPath === '/cookies' || cleanPath === '/cerezler') return 'cookies';
  if (cleanPath === '/legal' || cleanPath === '/yasal') return 'terms';
  return null;
}
