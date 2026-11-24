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
    subtitle: 'Çakma ses, görüntülü iletişim ve topluluk platformunun kullanım şartları.',
    sections: [
      {
        heading: '1. Taraflar ve Kapsam',
        paragraphs: [
          'Bu Kullanıcı Sözleşmesi ("Sözleşme"), Çakma web ve masaüstü uygulamasını ("Platform") kullanan her bireysel kullanıcı ("Kullanıcı") için geçerlidir. Platformda hesap oluşturduğunuzda veya sunucu bağlantısı üzerinden oturum açtığınızda bu Sözleşme\'yi, Gizlilik Politikası\'nı ve Topluluk Kuralları\'nı kabul etmiş sayılırsınız.',
        ],
      },
      {
        heading: '2. Yaş Sınırı ve Hesap Güvenliği',
        paragraphs: [
          'Platformu kullanabilmek için en az 13 yaşında (veya ikamet ettiğiniz ülkedeki geçerli dijital rıza yaşında) olmanız gerekir. Doğru ve güncel e-posta bilgisi sağlamak, şifrenizi ve varsa iki adımlı doğrulama (2FA / Passkey) kurtarma kodlarınızı gizli tutmak sizin sorumluluğunuzdadır.',
        ],
        bullets: [
          'Bir hesap başka kişilere devredilemez veya kiralanamaz.',
          'Hesabınızdan gerçekleştirilen yetkisiz erişim şüphesinde Ayarlar → Aktif Oturumlar bölümünden tüm oturumları sonlandırabilirsiniz.',
        ],
      },
      {
        heading: '3. İletişim, Ekran Paylaşımı ve Uzaktan Yardım',
        paragraphs: [
          'Çakma; metin sohbetleri, P2P / LiveKit SFU sesli ve görüntülü görüşmeler, yüksek çözünürlüklü ekran paylaşımı ve açık kullanıcı onayına bağlı Uzaktan Yardım (Remote Assist) özellikleri sunar.',
        ],
        bullets: [
          'Uzaktan Yardım yalnızca paylaşım yapan kullanıcının açık onayıyla başlar ve klavye acil durdurma (Killswitch) kısayolu ile anında sonlandırılabilir.',
          'Ekran paylaşımı ve ses kayıtlarında üçüncü kişilerin kişisel verilerini ve telif haklarını ihlal etmemek kullanıcının yükümlülüğündedir.',
        ],
      },
      {
        heading: '4. Fikri Mülkiyet ve Kullanıcı İçeriği',
        paragraphs: [
          'Sunuculara ve mesaj kanallarına yüklediğiniz içeriklerin mülkiyeti size aittir; ancak mesajların ilgili kanal veya özel sohbet katılımcılarına iletilmesi için gereken teknik işleme ve önbellekleme hakkını Platform\'a tanımış olursunuz.',
        ],
      },
      {
        heading: '5. Sorumluluk Reddi ve Hesap Feshi',
        paragraphs: [
          'Platform "olduğu gibi" sunulur. Kullanıcı sözleşmesini veya Topluluk Kuralları\'nı ağır şekilde ihlal eden hesaplar yönetici kararıyla geçici olarak susturulabilir, uzaklaştırılabilir veya kapatılabilir. Dilediğiniz zaman Ayarlar → Hesap Güvenliği bölümünden hesabınızı ve kişisel kayıtlarınızı kalıcı olarak silebilirsiniz.',
        ],
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Gizlilik Politikası',
    shortTitle: 'Gizlilik Politikası',
    subtitle: 'Verilerinizin nasıl işlendiği, şifrelendiği ve korunduğuna dair esaslar.',
    sections: [
      {
        heading: '1. Toplanan Hesap ve İletişim Verileri',
        paragraphs: [
          'Hesap oluşturma ve kimlik doğrulama süreçlerinde yalnızca hizmetin çalışması için gerekli veriler işlenir:',
        ],
        bullets: [
          'Kullanıcı adı, e-posta adresi, şifre özeti (scrypt / güvenli tuzlanmış hash) ve profil tercihleri (avatar, bio, durum mesajı).',
          'Üye olunan sunucular, kanal mesajları, tepkiler, yüklenen dosya ekleri ve denetim/güvenlik oturumu kayıtları (IP / User-Agent oturum güvenliği için).',
        ],
      },
      {
        heading: '2. Uçtan Uca Şifreleme (E2EE) ve Sıfır Sunucu Bilgisi',
        paragraphs: [
          '1\'e 1 Direkt Mesajlarda ve Grup DM\'lerde Uçtan Uca Şifreleme (E2EE) etkinleştirildiğinde mesaj içerikleri ve şifreli dosya ekleri cihazınızdan çıkmadan önce WebCrypto P-256 ECDH ve AES-256-GCM ile şifrelenir.',
        ],
        bullets: [
          'Özel şifreleme anahtarlarınız yalnızca kendi cihazınızda (IndexedDB) tutulur; sunucu tarafından okunamaz.',
          'QR Kod ile Cihaz Eşleştirme (/api/e2ee/pairing) akışında yalnızca şifrelenmiş yedek paketi 120 saniyeliğine bellekte tutulur, teslim sonrası tek kullanımlık olarak derhal silinir ve PIN sunucuya hiç gönderilmez.',
        ],
      },
      {
        heading: '3. Sesli, Görüntülü ve Ekran Yayını Trafiği',
        paragraphs: [
          'Sesli görüşme ve ekran paylaşımı akışları DTLS/SRTP ile şifreli WebRTC bağlantısı veya LiveKit SFU medya aktarıcısı üzerinden iletilir. Siz yerel kayıt özelliğiyle bilerek kayıt başlatmadıkça sunucular ses veya video akışını arşivlemez.',
        ],
      },
      {
        heading: '4. Veri Saklama ve Hesap Silme',
        paragraphs: [
          'Hesap sildiğinizde hesap kimlik bilgileriniz, oturum belirteçleriniz, arkadaşlık istekleriniz ve profil verileriniz sistemden kaldırılır. Üçüncü taraf reklam veya takip aracıyla veri paylaşımı yapılmaz.',
        ],
      },
    ],
  },
  {
    id: 'kvkk',
    title: 'KVKK Aydınlatma Metni (6698 Sayılı Kanun)',
    shortTitle: 'KVKK Aydınlatma',
    subtitle: '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sahibi hakları.',
    sections: [
      {
        heading: '1. Veri Sorumlusu ve İşleme Amacı',
        paragraphs: [
          '6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca kişisel verileriniz; üyelik işlemlerinin yürütülmesi, kimlik ve hesap güvenliğinin (OTP, 2FA, Passkey, yeni IP uyarısı) sağlanması, gerçek zamanlı ses/sohbet iletişiminin iletilmesi ve kötüye kullanımın önlenmesi amaçlarıyla sınırlı olarak işlenmektedir.',
        ],
      },
      {
        heading: '2. Kişisel Verilerin Toplanma Yöntemi ve Hukuki Sebepleri',
        paragraphs: [
          'Verileriniz Platform arayüzleri ve oturum istekleri üzerinden elektronik ortamda toplanır ve KVKK m. 5/2-c (bir sözleşmenin kurulması veya ifası), m. 5/2-ç (hukuki yükümlülük) ve m. 5/2-f (temel hak ve özgürlüklere zarar vermemek kaydıyla meşru menfaat) hukuki sebeplerine dayanılarak işlenir.',
        ],
      },
      {
        heading: '3. KVKK Madde 11 Kapsamındaki Haklarınız',
        paragraphs: [
          'Kişisel veri sahibi olarak aşağıdaki haklara sahipsiniz:',
        ],
        bullets: [
          'Kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse buna ilişkin bilgi talep etme,',
          'Verilerin işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,',
          'Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme,',
          'KVKK m. 7 şartları çerçevesinde kişisel verilerin silinmesini veya yok edilmesini isteme (uygulama içi Ayarlar → Hesap Güvenliği → Hesabımı Sil üzerinden doğrudan kullanılabilir).',
        ],
      },
    ],
  },
  {
    id: 'community',
    title: 'Topluluk Kuralları ve İçerik Politikası',
    shortTitle: 'Topluluk Kuralları',
    subtitle: 'Tüm sunucularda, ses odalarında ve sohbetlerde uyulması gereken davranış ilkeleri.',
    sections: [
      {
        heading: '1. Saygılı İletişim ve Taciz Yasağı',
        paragraphs: [
          'Kullanıcılara yönelik tehdit, hakaret, nefret söylemi, ısrarlı taciz (stalking), özel hayatın gizliliğini ihlal eden ifşaat (doxxing) ve kimliğe bürünme kesinlikle yasaktır.',
        ],
      },
      {
        heading: '2. Zararlı Dosya, Spam ve Kötüye Kullanım',
        paragraphs: [
          'Platforma zararlı yazılım (çalıştırılabilir zararlı dosyalar), kimlik avı (phishing) bağlantıları, otomatik spam mesajları veya diğer kullanıcıların bağlantısını bozmaya yönelik yük üretmek yasaktır. Sunucularda AutoMod kuralları, yavaş mod ve hız sınırları bu nedenle aktif olabilir.',
        ],
      },
      {
        heading: '3. Yaptırımlar ve Sunucu Moderasyonu',
        paragraphs: [
          'Sunucu sahipleri ve yetkili moderatörler uyarma (Warn), geçici susturma (Timeout), sunucudan atma (Kick) ve kalıcı yasaklama (Ban) yetkilerini Denetim Günlüğü kaydıyla uygulayabilir. Ağır sistem ihlallerinde Platform yöneticileri hesabı sonlandırabilir.',
        ],
      },
    ],
  },
  {
    id: 'cookies',
    title: 'Çerez ve Yerel Depolama Politikası',
    shortTitle: 'Çerez Politikası',
    subtitle: 'Oturum çerezleri, localStorage ve cihaz içi IndexedDB kullanımı hakkında bilgi.',
    sections: [
      {
        heading: '1. Zorunlu Oturum Çerezleri',
        paragraphs: [
          'Çakma yalnızca kimlik doğrulama oturumunuzu güvenli biçimde sürdürebilmek ve yüklenen medya eklerine yetkili erişim sağlamak için HttpOnly / SameSite korumalı teknik oturum çerezi kullanır. Reklam, pazarlama veya üçüncü taraf izleme (tracking) çerezi kullanılmaz.',
        ],
      },
      {
        heading: '2. Tarayıcı ve Masaüstü Yerel Depolama (localStorage & IndexedDB)',
        paragraphs: [
          'Deneyiminizi hızlandırmak ve gizliliğinizi korumak için cihazınızda yalnızca teknik ve tercih verileri tutulur:',
        ],
        bullets: [
          'localStorage: Seçili arayüz teması, dil (TR/EN), mikrofon/hoparlör DSP ayarları, bas-konuş (PTT) kısayolu ve taslak mesajlar.',
          'IndexedDB (cakma_e2ee_v2): Uçtan uca şifreleme (E2EE) için üretilen P-256 özel/genel kriptografik anahtarlarınız.',
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
