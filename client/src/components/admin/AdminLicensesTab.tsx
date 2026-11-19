import React, { useState } from 'react';
import { Ban, Calendar, Check, CheckCircle, Clock, Copy, Key, Shield, ShoppingCart, UserCheck, X } from 'lucide-react';
import type { IssuedLicense } from '../../types';
import type { AdminDashboardData, RequestAdminDialogFn } from './adminTypes';

interface AdminLicensesTabProps {
  adminData: AdminDashboardData | null;
  generatedLicense: IssuedLicense | null;
  clearGeneratedLicense: () => void;
  onGenerateLicense: (data: {
    licensee: string;
    maxSlots: number;
    expireDays: number;
    tier: 'Starter' | 'Pro' | 'Enterprise';
    assignedUsername?: string;
  }) => void;
  onActivateLicense: (licenseId: string) => void;
  onRevokeLicense: (licenseId: string, reason?: string) => void;
  onExtendLicense: (licenseId: string, addDays: number) => void;
  onRequestDialog: RequestAdminDialogFn;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const AdminLicensesTab: React.FC<AdminLicensesTabProps> = ({
  adminData,
  generatedLicense,
  clearGeneratedLicense,
  onGenerateLicense,
  onActivateLicense,
  onRevokeLicense,
  onExtendLicense,
  onRequestDialog,
  onNotify,
}) => {
  const [licCustomer, setLicCustomer] = useState('');
  const [licUser, setLicUser] = useState('admin');
  const [licSlots, setLicSlots] = useState('64');
  const [licDays, setLicDays] = useState('365');
  const [licTier, setLicTier] = useState<'Starter' | 'Pro' | 'Enterprise'>('Pro');
  const [copiedKey, setCopiedKey] = useState(false);

  const [extendingLicense, setExtendingLicense] = useState<IssuedLicense | null>(null);
  const [extendDays, setExtendDays] = useState<number>(30);
  const [extendSuccessMsg, setExtendSuccessMsg] = useState<string>('');

  const handleCreateLicense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!licCustomer.trim()) return;
    onGenerateLicense({
      licensee: licCustomer.trim(),
      maxSlots: Number(licSlots),
      expireDays: Number(licDays),
      tier: licTier,
      assignedUsername: licUser || undefined,
    });
  };

  const handleCopyLicense = () => {
    if (generatedLicense?.licenseKey) {
      navigator.clipboard.writeText(generatedLicense.licenseKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <Key className="w-5 h-5 text-amber-400" />
          Özel Sunucu (Dedicated Server) Lisans Üreticisi &amp; Takip Merkezi
        </h3>
        <p className="text-xs text-white/50 mt-1">
          Kendi sunucusunu kurmak isteyen kullanıcılar için şifreli, imzalı dijital lisans anahtarları üretin,
          kayıtlı kullanıcılarla ilişkilendirin veya durumlarını yönetin.
        </p>
      </div>

      {/* License Form */}
      <form onSubmit={handleCreateLicense} className="p-6 rounded-3xl ios-glass-card border border-white/10 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
              Müşteri / Topluluk Adı
            </label>
            <input
              type="text"
              required
              value={licCustomer}
              onChange={(e) => setLicCustomer(e.target.value)}
              placeholder="Örn: Anadolu e-Spor Kulübü"
              className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-white/20"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
              İlişkilendirilecek Kullanıcı (Opsiyonel)
            </label>
            <select
              value={licUser}
              onChange={(e) => setLicUser(e.target.value)}
              className="w-full bg-[#181920] border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">İlişkilendirme Yok (Genel)</option>
              {adminData?.registeredUsers.map((u) => (
                <option key={u.id} value={u.username}>
                  👤 {u.username} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
              Maksimum Slot Kapasitesi (Kişi)
            </label>
            <select
              value={licSlots}
              onChange={(e) => setLicSlots(e.target.value)}
              className="w-full bg-[#181920] border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="16">16 Kişilik (Mini Topluluk)</option>
              <option value="32">32 Kişilik (Klan Paketi)</option>
              <option value="64">64 Kişilik (Standart Pro)</option>
              <option value="128">128 Kişilik (Büyük Sunucu)</option>
              <option value="512">512 Kişilik (Enterprise)</option>
              <option value="1024">1024 Kişilik (Sınırsız / Mega)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
              Lisans Paketi Seviyesi
            </label>
            <select
              value={licTier}
              onChange={(e) => setLicTier(e.target.value as any)}
              className="w-full bg-[#181920] border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="Starter">Starter (Başlangıç)</option>
              <option value="Pro">Pro (Yüksek Kalite Ses)</option>
              <option value="Enterprise">Enterprise (Özel SLA &amp; Maksimum Hat)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
              Geçerlilik Süresi
            </label>
            <select
              value={licDays}
              onChange={(e) => setLicDays(e.target.value)}
              className="w-full bg-[#181920] border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="30">1 Ay (30 Gün)</option>
              <option value="90">3 Ay (90 Gün)</option>
              <option value="180">6 Ay (180 Gün)</option>
              <option value="365">1 Yıl (365 Gün)</option>
              <option value="-1">Ömür Boyu (Lifetime)</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-3">
          {generatedLicense && (
            <button
              type="button"
              onClick={clearGeneratedLicense}
              className="px-4 py-2 rounded-xl text-xs text-white/50 hover:text-white transition"
            >
              Temizle
            </button>
          )}
          <button
            type="submit"
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-black font-bold text-xs rounded-xl transition shadow-lg shadow-amber-500/25 flex items-center gap-2"
          >
            <Key className="w-3.5 h-3.5" />
            Kriptografik Lisans Anahtarı Üret (HMAC-SHA256)
          </button>
        </div>
      </form>

      {/* Generated Result Box */}
      {generatedLicense && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              Lisans Başarıyla Üretildi &amp; İmzalandı!
            </span>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
              {generatedLicense.tier} TIER
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/50 uppercase mb-1">
              Müşteriye Verilecek Lisans Anahtarı:
            </label>
            <div className="p-3 bg-black/60 rounded-xl border border-white/10 font-mono text-[11px] text-emerald-400 break-all select-all flex items-center justify-between gap-3">
              <span>{generatedLicense.licenseKey}</span>
              <button
                type="button"
                onClick={handleCopyLicense}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-sans text-xs flex items-center gap-1.5 shrink-0 transition"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey ? 'Kopyalandı' : 'Kopyala'}</span>
              </button>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] text-xs text-white/70 space-y-1 border border-white/5">
            <div>
              <b>Müşteri:</b> {generatedLicense.licensee}
            </div>
            {generatedLicense.assignedUsername && (
              <div>
                <b>İlişkili Kullanıcı:</b> @{generatedLicense.assignedUsername}
              </div>
            )}
            <div>
              <b>Kapasite:</b> {generatedLicense.maxSlots} Slot ({generatedLicense.tier})
            </div>
            <div>
              <b>Bitiş Tarihi:</b>{' '}
              {generatedLicense.expiresAt.startsWith('2099')
                ? 'Ömür Boyu (Lifetime)'
                : new Date(generatedLicense.expiresAt).toLocaleDateString('tr-TR')}
            </div>
            <div className="text-[11px] text-amber-300/80 pt-1">
              ℹ️ Müşteri bu anahtarı indirdiği sunucu klasöründeki <code>server.config.json</code> dosyasındaki{' '}
              <code>licenseKey</code> alanına yapıştıracaktır.
            </div>
          </div>
        </div>
      )}

      {/* ISSUED LICENSES TRACKING TABLE */}
      <div className="space-y-3 pt-6 border-t border-white/10">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            Kayıtlı Lisanslar &amp; Kullanıcı Takip Tablosu ({adminData?.issuedLicenses?.length || 0})
          </h4>
          <span className="text-[11px] text-white/40">Sistemde üretilen veya mağazadan alınan tüm lisanslar</span>
        </div>

        {!adminData?.issuedLicenses || adminData.issuedLicenses.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-xs text-white/40">
            Henüz kayıtlı lisans bulunmuyor.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40">
            <table className="w-full text-left text-xs text-white/80">
              <thead className="bg-white/5 text-[10px] text-white/50 uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="py-2.5 px-3">Durum</th>
                  <th className="py-2.5 px-3">Topluluk / Sunucu</th>
                  <th className="py-2.5 px-3">İlişkili Kullanıcı</th>
                  <th className="py-2.5 px-3">Slot / Paket</th>
                  <th className="py-2.5 px-3">Bitiş Tarihi</th>
                  <th className="py-2.5 px-3">Kaynak</th>
                  <th className="py-2.5 px-3">Sinyal / Host</th>
                  <th className="py-2.5 px-3">Lisans Anahtarı</th>
                  <th className="py-2.5 px-3 text-right">Eylemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {adminData.issuedLicenses.map((lic) => {
                  const dedicatedList = adminData.dedicatedServers || [];
                  const isOnline = dedicatedList.some(
                    (s) => s.licenseKey === lic.licenseKey && s.status === 'online'
                  );
                  const activeServer = dedicatedList.find((s) => s.licenseKey === lic.licenseKey);

                  return (
                    <tr key={lic.id} className="hover:bg-white/[0.03] transition">
                      <td className="py-2.5 px-3">
                        {lic.status === 'revoked' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 w-fit">
                            <Ban className="w-3 h-3" />
                            İptal Edildi
                          </span>
                        ) : lic.status === 'pending_payment' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" />
                            Ödeme Bekliyor
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit">
                            <CheckCircle className="w-3 h-3" />
                            Aktif
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-white">{lic.licensee}</td>
                      <td className="py-2.5 px-3">
                        {lic.assignedUsername ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                            <UserCheck className="w-3 h-3" />
                            @{lic.assignedUsername}
                          </span>
                        ) : (
                          <span className="text-white/30 italic">Atanmamış</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-amber-300">{lic.maxSlots} Slot</span>
                        <span className="text-[10px] text-white/40 block">({lic.tier})</span>
                      </td>
                      <td className="py-2.5 px-3">
                        {lic.expiresAt === 'lifetime' || lic.expiresAt.startsWith('2099') ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-bold text-[10px] border border-amber-500/20">
                            ♾️ Ömür Boyu
                          </span>
                        ) : (
                          <span className="text-white/80 font-mono text-[11px]">
                            {new Date(lic.expiresAt).toLocaleDateString('tr-TR')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {lic.source === 'store' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300">
                            <ShoppingCart className="w-3 h-3" /> Mağaza
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                            <Shield className="w-3 h-3" /> Admin
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            {activeServer?.host || 'Çevrimiçi'}
                          </span>
                        ) : (
                          <span className="text-white/30 text-[11px]">Bağlı değil</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-white/50 max-w-[120px] truncate">
                            {lic.licenseKey}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(lic.licenseKey);
                              onNotify('success', 'Lisans anahtarı panoya kopyalandı.');
                            }}
                            className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition"
                            title="Lisans Anahtarını Kopyala"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setExtendingLicense(lic);
                              setExtendDays(30);
                              setExtendSuccessMsg('');
                            }}
                            className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 text-[10px] font-semibold transition flex items-center gap-1"
                            title="Lisans süresini uzat"
                          >
                            <Calendar className="w-3 h-3" />
                            Uzat
                          </button>
                          {lic.status === 'revoked' || lic.status === 'pending_payment' ? (
                            <button
                              type="button"
                              onClick={() => onActivateLicense(lic.id)}
                              className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 text-[10px] font-semibold transition"
                            >
                              {lic.status === 'pending_payment' ? 'Onayla & Aktifleştir' : 'Aktifleştir'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                onRequestDialog({
                                  type: 'confirm',
                                  title: 'Lisansı İptal Et',
                                  description: `"${lic.licensee}" lisansını iptal etmek istediğinize emin misiniz? Sunucu anında devre dışı kalacaktır.`,
                                  confirmLabel: 'Lisansı İptal Et',
                                  tone: 'danger',
                                  onConfirm: () => onRevokeLicense(lic.id, 'Yönetici tarafından askıya alındı'),
                                })
                              }
                              className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 text-[10px] font-semibold transition"
                            >
                              İptal Et
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADMIN LICENSE EXTENSION POPUP */}
      {extendingLicense && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md p-6 rounded-3xl ios-glass border border-blue-500/40 shadow-2xl space-y-4 animate-fade-in relative">
            <button
              type="button"
              onClick={() => setExtendingLicense(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Lisans Süresini Uzat</h3>
                <p className="text-xs text-white/50">
                  {extendingLicense.licensee} ({extendingLicense.tier})
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1.5 text-xs">
              <div className="flex justify-between text-white/60">
                <span>İlişkili Kullanıcı:</span>
                <span className="font-semibold text-white">@{extendingLicense.assignedUsername || 'Yok'}</span>
              </div>
              <div className="flex justify-between text-white/60">
                <span>Mevcut Bitiş Tarihi:</span>
                <span className="font-semibold text-amber-300">
                  {extendingLicense.expiresAt === 'lifetime' || extendingLicense.expiresAt.startsWith('2099')
                    ? 'Ömür Boyu (Lifetime)'
                    : new Date(extendingLicense.expiresAt).toLocaleDateString('tr-TR')}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-white/60 uppercase">Eklenecek Süre Seçin:</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { days: 30, label: '+30 Gün (1 Ay)' },
                  { days: 90, label: '+90 Gün (3 Ay)' },
                  { days: 180, label: '+180 Gün (6 Ay)' },
                  { days: 365, label: '+365 Gün (1 Yıl)' },
                  { days: -1, label: '♾️ Ömür Boyu' },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setExtendDays(opt.days)}
                    className={`p-2.5 rounded-xl text-xs font-semibold border transition text-left ${
                      extendDays === opt.days
                        ? 'bg-blue-500/30 border-blue-400 text-white shadow-lg shadow-blue-500/20'
                        : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {extendSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                {extendSuccessMsg}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExtendingLicense(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white/50 hover:text-white transition"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  onExtendLicense(extendingLicense.id, extendDays);
                  setExtendSuccessMsg(
                    `Süre başarıyla ${extendDays === -1 ? 'Ömür Boyu yapıldı' : extendDays + ' gün uzatıldı'}!`
                  );
                  setTimeout(() => {
                    setExtendingLicense(null);
                    setExtendSuccessMsg('');
                  }, 1200);
                }}
                className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold transition shadow-lg shadow-blue-500/30 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Süreyi Uzat &amp; Onayla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
