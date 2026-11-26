import React, { useEffect, useRef, useState } from 'react';
import { Activity, Check, Download, RotateCcw, Search, Wifi } from 'lucide-react';
import type { AdminDashboardData, RequestAdminDialogFn } from './adminTypes';
import type { AdminSystemFormController, SystemConfigUpdatePayload } from './useAdminSystemForm';
import { authFetch } from '../../utils/authFetch';
import { downloadTextFile } from '../../utils/adminHelpers';
import { AdminMaintenanceCard } from './AdminMaintenanceCard';

export type SystemSectionId = 'all' | 'general' | 'security' | 'email' | 'media' | 'backup';

export interface SystemFocusRequest {
  section: SystemSectionId;
  query?: string;
  nonce: number;
}

interface LiveKitTestResult {
  ok: boolean;
  livekit?: {
    url: string;
    configured: boolean;
    reachable: boolean;
    status: number;
    latencyMs: number;
    message: string;
  };
  turn?: {
    configured: boolean;
    valid: boolean;
    message: string;
  };
  error?: string;
}

interface AdminSystemTabProps {
  adminData: AdminDashboardData | null;
  currentServerHost: string;
  form: AdminSystemFormController;
  autoRefreshSec: number;
  setAutoRefreshSec: (sec: number) => void;
  fetchAdminData: () => void;
  onSaveSystemConfig: (payload: SystemConfigUpdatePayload) => void;
  onCreateRegInvite: (maxUses?: number, expiresHours?: number) => void;
  onDeleteRegInvite: (code: string) => void;
  onBanIp: (ip: string, reason?: string, durationMinutes?: number) => void;
  onUnbanIp: (ip: string) => void;
  onExportFullBackup: () => void;
  onRestoreFullBackup: (bundle: any) => void;
  onTriggerBackupNow: () => void;
  onRestoreScheduledBackup: (filename: string) => void;
  onDeleteScheduledBackup: (filename: string) => void;
  onTestWebhook: () => void;
  onTestSmtp: (
    toEmail?: string,
    smtpConfig?: {
      smtpHost?: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser?: string;
      smtpPass?: string;
      smtpFrom?: string;
      mailRelayUrl?: string;
      mailRelaySecret?: string;
    }
  ) => Promise<{ ok: boolean; message: string }>;
  onRequestDialog: RequestAdminDialogFn;
  onNotify: (type: 'success' | 'error', message: string) => void;
  focusRequest?: SystemFocusRequest | null;
}

export const AdminSystemTab: React.FC<AdminSystemTabProps> = ({
  adminData,
  currentServerHost,
  form,
  autoRefreshSec,
  setAutoRefreshSec,
  fetchAdminData,
  onSaveSystemConfig,
  onCreateRegInvite,
  onDeleteRegInvite,
  onBanIp,
  onUnbanIp,
  onExportFullBackup,
  onRestoreFullBackup,
  onTriggerBackupNow,
  onRestoreScheduledBackup,
  onDeleteScheduledBackup,
  onTestWebhook,
  onTestSmtp,
  onRequestDialog,
  onNotify,
  focusRequest,
}) => {
  const [section, setSection] = useState<SystemSectionId>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!focusRequest) return;
    setSection(focusRequest.section);
    setSearchQuery(focusRequest.query || '');
  }, [focusRequest]);
  const [newInviteMaxUses, setNewInviteMaxUses] = useState<number>(5);
  const [newInviteHours, setNewInviteHours] = useState<number>(24);
  const [showGiphyKey, setShowGiphyKey] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [smtpTestTo, setSmtpTestTo] = useState('');
  const [smtpTestBusy, setSmtpTestBusy] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [livekitTestBusy, setLivekitTestBusy] = useState(false);
  const [livekitTestResult, setLivekitTestResult] = useState<LiveKitTestResult | null>(null);
  const [ipBanInput, setIpBanInput] = useState('');
  const [ipBanReason, setIpBanReason] = useState('Şüpheli trafik / kural ihlali');
  const [ipBanDuration, setIpBanDuration] = useState(0);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const { fields, isSystemDirty, setIsSystemDirty, discardChanges, buildPayload } = form;
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const isCardVisible = (cardSection: Exclude<SystemSectionId, 'all'>, keywords: string) => {
    if (normalizedSearch) {
      return keywords.toLowerCase().includes(normalizedSearch);
    }
    return section === 'all' || section === cardSection;
  };

  const handleSave = () => {
    onSaveSystemConfig(buildPayload());
    setIsSystemDirty(false);
  };

  const handleLiveKitTest = async () => {
    setLivekitTestBusy(true);
    setLivekitTestResult(null);
    try {
      const res = await authFetch(currentServerHost, '/api/admin/livekit-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          livekitUrl: fields.sysLivekitUrl,
          livekitApiKey: fields.sysLivekitApiKey,
          livekitApiSecret: fields.sysLivekitApiSecret,
          turnUrl: fields.sysTurnUrl,
          turnUsername: fields.sysTurnUsername,
          turnCredential: fields.sysTurnCredential,
        }),
      });
      const data = await res.json();
      setLivekitTestResult(data);
    } catch {
      setLivekitTestResult({ ok: false, error: 'LiveKit test isteği sunucuya ulaşamadı.' });
    } finally {
      setLivekitTestBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl pb-16 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white">Detaylı Sistem &amp; Güvenlik Ayarları</h3>
          <p className="text-xs text-white/45 mt-0.5">
            Kayıt politikası, 2FA/AutoMod, E-posta/SMTP, LiveKit SFU/TURN ve yedekleme ayarlarını canlı yönetin.
          </p>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ayarlarda ara (örn. turn, smtp, ip)..."
            className="pl-8 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-amber-500 w-56"
          />
        </div>
      </div>

      {/* Section Sub-Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-white/[0.03] p-1.5 rounded-2xl border border-white/10">
        {[
          { id: 'all', label: 'Tümü' },
          { id: 'general', label: 'Genel & Kayıt' },
          { id: 'security', label: 'Güvenlik & 2FA' },
          { id: 'email', label: 'E-posta / SMTP' },
          { id: 'media', label: 'LiveKit SFU & TURN' },
          { id: 'backup', label: 'Yedekleme & Webhook' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSection(t.id as SystemSectionId);
              setSearchQuery('');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              !normalizedSearch && section === t.id
                ? 'bg-amber-500 text-black shadow-sm'
                : 'text-white/65 hover:text-white hover:bg-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. Security Audit Card */}
      {adminData?.securityAudit &&
        isCardVisible(
          'security',
          'güvenlik denetim skoru master api key 2fa session secret brute force denetim'
        ) && (
          <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Güvenlik Denetimi &amp; Skoru
                </div>
                <div className="text-[11px] text-white/45 mt-0.5">
                  Sunucu yapılandırması ve yönetici hesapları canlı olarak taranır.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                    adminData.securityAudit.score >= 80
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : adminData.securityAudit.score >= 55
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  }`}
                >
                  Skor: {adminData.securityAudit.score} / 100
                </span>
                <button
                  type="button"
                  onClick={() => fetchAdminData()}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 transition"
                >
                  Yeniden Tara
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {adminData.securityAudit.checks.map((chk) => (
                <div
                  key={chk.id}
                  className="p-2.5 rounded-xl bg-black/25 border border-white/5 flex items-start gap-2.5"
                >
                  <span
                    className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                      chk.status === 'pass'
                        ? 'bg-emerald-400'
                        : chk.status === 'warn'
                        ? 'bg-amber-400'
                        : 'bg-rose-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{chk.label}</div>
                    <div className="text-[11px] text-white/50 leading-snug">{chk.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* 2. Access & Security Policy */}
      {isCardVisible(
        'general',
        'erişim güvenlik politikası üye kayıt şifre admin 2fa davet kodu e-posta bakiye cüzdan ip bakım modu maintenance'
      ) && (
        <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
            Erişim &amp; Kayıt Politikası
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Yeni Üye Kayıtları</div>
              <div className="text-xs text-white/45">Kapatıldığında yeni kullanıcı kayıtları engellenir.</div>
            </div>
            <button
              type="button"
              onClick={() => {
                fields.setSysRegEnabled(!fields.sysRegEnabled);
                setIsSystemDirty(true);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                fields.sysRegEnabled ? 'bg-emerald-500' : 'bg-white/15'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  fields.sysRegEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/5">
            <div>
              <div className="text-sm font-semibold text-white">Güçlü Şifre Zorunluluğu</div>
              <div className="text-xs text-white/45">
                Yeni kayıtlarda minimum şifre uzunluğunu 8 karaktere çıkarır.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                fields.setSysStrongPass(!fields.sysStrongPass);
                setIsSystemDirty(true);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                fields.sysStrongPass ? 'bg-emerald-500' : 'bg-white/15'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  fields.sysStrongPass ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/5">
            <div>
              <div className="text-sm font-semibold text-white">Yönetici 2FA Politikası</div>
              <div className="text-xs text-white/45">
                Güvenlik denetiminde 2FA kapalı admin hesaplarını kritik uyarı olarak işaretler.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                fields.setSysRequireAdmin2FA(!fields.sysRequireAdmin2FA);
                setIsSystemDirty(true);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                fields.sysRequireAdmin2FA ? 'bg-emerald-500' : 'bg-white/15'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  fields.sysRequireAdmin2FA ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/5">
            <div>
              <div className="text-sm font-semibold text-white">Yalnızca Davet Kodu ile Kayıt</div>
              <div className="text-xs text-white/45">
                Açıkken yeni kayıtlar için geçerli bir kayıt davet kodu zorunlu olur.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                fields.setSysInviteOnly(!fields.sysInviteOnly);
                setIsSystemDirty(true);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                fields.sysInviteOnly ? 'bg-emerald-500' : 'bg-white/15'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  fields.sysInviteOnly ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/5">
            <div>
              <div className="text-sm font-semibold text-white">Tekil E-Posta Zorunluluğu</div>
              <div className="text-xs text-white/45">
                Aynı e-posta adresi ile birden fazla hesap açılmasını engeller.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                fields.setSysRequireUniqueEmail(!fields.sysRequireUniqueEmail);
                setIsSystemDirty(true);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                fields.sysRequireUniqueEmail ? 'bg-emerald-500' : 'bg-white/15'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  fields.sysRequireUniqueEmail ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-white/5">
            <div>
              <label className="block text-[11px] font-semibold text-white/50 uppercase mb-1">
                Günlük IP Başına Max Kayıt
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={fields.sysMaxAccountsPerIp}
                onChange={(e) => {
                  fields.setSysMaxAccountsPerIp(Number(e.target.value));
                  setIsSystemDirty(true);
                }}
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/50 uppercase mb-1">
                Yeni Üye Başlangıç Bakiyesi (₺)
              </label>
              <input
                type="number"
                min={0}
                max={10000}
                value={fields.sysDefaultWallet}
                onChange={(e) => {
                  fields.setSysDefaultWallet(Number(e.target.value));
                  setIsSystemDirty(true);
                }}
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Registration Invite Codes */}
          <div className="pt-3 border-t border-white/5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-white">Kayıt Davet Kodları</div>
                <div className="text-[11px] text-white/45">
                  Davetli kayıt modu açıkken kullanılacak kodları oluşturun.
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={newInviteMaxUses}
                  onChange={(e) => setNewInviteMaxUses(Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-xs text-white text-center"
                  title="Max Kullanım"
                />
                <select
                  value={newInviteHours}
                  onChange={(e) => setNewInviteHours(Number(e.target.value))}
                  className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-xs text-white"
                >
                  <option value={1}>1 Saat</option>
                  <option value={24}>24 Saat</option>
                  <option value={168}>7 Gün</option>
                  <option value={0}>Süresiz</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    onCreateRegInvite(newInviteMaxUses, newInviteHours);
                    setTimeout(() => fetchAdminData(), 300);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-xs font-bold transition"
                >
                  + Kod Üret
                </button>
              </div>
            </div>
            {(adminData?.systemConfig?.registrationInvites || []).length > 0 && (
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {(adminData?.systemConfig?.registrationInvites || []).map((inv) => (
                  <div
                    key={inv.code}
                    className="px-3 py-1.5 rounded-xl bg-black/25 border border-white/5 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-amber-300">{inv.code}</span>
                      <span className="text-[11px] text-white/50">
                        Kullanım: {inv.uses}/{inv.maxUses}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteRegInvite(inv.code);
                        setTimeout(() => fetchAdminData(), 300);
                      }}
                      className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                    >
                      Sil
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/5">
            <div>
              <div className="text-sm font-semibold text-white">Bakım Modu (Aktif Erişim Duvarı)</div>
              <div className="text-xs text-white/45">
                Açıkken admin olmayanların giriş ve kayıt işlemleri engellenir.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                fields.setSysMaintenance(!fields.sysMaintenance);
                setIsSystemDirty(true);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                fields.sysMaintenance ? 'bg-amber-500' : 'bg-white/15'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  fields.sysMaintenance ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1.5">Bakım Modu Mesajı</label>
            <input
              type="text"
              value={fields.sysMaintMsg}
              onChange={(e) => {
                fields.setSysMaintMsg(e.target.value);
                setIsSystemDirty(true);
              }}
              placeholder="Örn: Sistem planlı bakım çalışması nedeniyle kısa süreliğine kapalıdır."
              className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
            />
          </div>
        </div>
      )}

      {/* 3. Brute-Force & Global Anti-Spam */}
      {isCardVisible(
        'security',
        'brute force anti spam giriş denemesi kilit global harici link yasaklı kelimeler automod'
      ) && (
        <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-rose-300">
            Brute-Force &amp; Global Anti-Spam
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-white/50 mb-1.5">
                Maks. Hatalı Giriş Denemesi
              </label>
              <input
                type="number"
                min={3}
                max={20}
                value={fields.sysMaxLoginAttempts}
                onChange={(e) => {
                  fields.setSysMaxLoginAttempts(Number(e.target.value));
                  setIsSystemDirty(true);
                }}
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/50 mb-1.5">IP Kilitleme Süresi (dk)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={fields.sysLockoutMins}
                onChange={(e) => {
                  fields.setSysLockoutMins(Number(e.target.value));
                  setIsSystemDirty(true);
                }}
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/5">
            <div>
              <div className="text-sm font-semibold text-white">Global Harici Link Engeli</div>
              <div className="text-xs text-white/45">
                Tüm sunucularda standart kullanıcıların URL paylaşmasını engeller.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                fields.setSysGlobalBlockLinks(!fields.sysGlobalBlockLinks);
                setIsSystemDirty(true);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                fields.sysGlobalBlockLinks ? 'bg-rose-500' : 'bg-white/15'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  fields.sysGlobalBlockLinks ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1.5">
              Global Yasaklı Kelimeler (virgülle ayırın)
            </label>
            <input
              type="text"
              value={fields.sysGlobalBannedWordsText}
              onChange={(e) => {
                fields.setSysGlobalBannedWordsText(e.target.value);
                setIsSystemDirty(true);
              }}
              placeholder="Örn: spamkelime, yasaksite, reklam"
              className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
            />
          </div>
        </div>
      )}

      {/* 4. Chat & Upload Limits + Panel Auto Refresh */}
      {isCardVisible(
        'general',
        'sohbet medya limit mesaj uzunluğu yavaş mod slowmode dosya limiti otomatik yenileme giphy gif'
      ) && (
        <>
          <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-teal-300">
              Sohbet &amp; Medya Limitleri
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-white/50 mb-1.5">Maks. Mesaj Uzunluğu</label>
                <input
                  type="number"
                  min={200}
                  max={8000}
                  value={fields.sysMaxMsgLen}
                  onChange={(e) => {
                    fields.setSysMaxMsgLen(Number(e.target.value));
                    setIsSystemDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/50 mb-1.5">
                  Varsayılan Yavaş Mod (sn)
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={fields.sysSlowmode}
                  onChange={(e) => {
                    fields.setSysSlowmode(Number(e.target.value));
                    setIsSystemDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/50 mb-1.5">Maks. Dosya Limiti (MB)</label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={fields.sysMaxUploadMb}
                  onChange={(e) => {
                    fields.setSysMaxUploadMb(Number(e.target.value));
                    setIsSystemDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl ios-glass-card border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Panel Otomatik Yenileme</div>
              <div className="text-xs text-white/45">
                Metrikleri ve logları belirli aralıklarla otomatik yeniler.
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[0, 5, 15, 30].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setAutoRefreshSec(sec)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    autoRefreshSec === sec
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  {sec === 0 ? 'Kapalı' : `${sec}sn`}
                </button>
              ))}
            </div>
          </div>

          {/* GIPHY API Key */}
          <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white">GIPHY API Anahtarı (GIF Galerisi)</div>
                <div className="text-[11px] text-white/50">
                  developers.giphy.com üzerinden alınan API anahtarını girin. Boş bırakılırsa yerleşik GIF galerisi kullanılır.
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                  fields.sysGiphyApiKey.trim()
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-white/50'
                }`}
              >
                {fields.sysGiphyApiKey.trim() ? 'Aktif' : 'Varsayılan Galeri'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type={showGiphyKey ? 'text' : 'password'}
                value={fields.sysGiphyApiKey}
                onChange={(e) => {
                  fields.setSysGiphyApiKey(e.target.value);
                  setIsSystemDirty(true);
                }}
                placeholder="GIPHY API Key yapıştırın..."
                className="flex-1 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-pink-400"
              />
              <button
                type="button"
                onClick={() => setShowGiphyKey((v) => !v)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/75 font-semibold transition shrink-0"
              >
                {showGiphyKey ? 'Gizle' : 'Göster'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 5. IP Ban Management */}
      {isCardVisible('security', 'ip engelleme ban listesi yasaklı ip adresi engeli kaldır') && (
        <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                IP Engelleme Listesi ({adminData?.bannedIps?.length || 0})
              </div>
              <div className="text-[11px] text-white/45">Engellenen IP adresleri yeni soket bağlantısı kuramaz.</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              value={ipBanInput}
              onChange={(e) => setIpBanInput(e.target.value)}
              placeholder="IP adresi (örn. 192.168.1.50)"
              className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-amber-400"
            />
            <input
              type="text"
              value={ipBanReason}
              onChange={(e) => setIpBanReason(e.target.value)}
              placeholder="Sebep"
              className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
            />
            <select
              value={ipBanDuration}
              onChange={(e) => setIpBanDuration(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
            >
              <option value={0}>Kalıcı</option>
              <option value={60}>1 Saat</option>
              <option value={1440}>24 Saat</option>
              <option value={10080}>7 Gün</option>
            </select>
            <button
              type="button"
              onClick={() => {
                if (!ipBanInput.trim()) return;
                onBanIp(ipBanInput.trim(), ipBanReason.trim(), ipBanDuration);
                setIpBanInput('');
              }}
              className="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-200 hover:text-white border border-rose-500/30 text-xs font-bold transition"
            >
              IP Engelle
            </button>
          </div>
          {(adminData?.bannedIps || []).length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {(adminData?.bannedIps || []).map((b) => (
                <div
                  key={b.ip}
                  className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-rose-300">{b.ip}</span>
                    <span className="text-white/50 ml-2 truncate">{b.reason}</span>
                    {b.expiresAt && (
                      <span className="text-[10px] text-amber-300 ml-2">
                        (Bitiş: {new Date(b.expiresAt).toLocaleString('tr-TR')})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onUnbanIp(b.ip)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold shrink-0 transition"
                  >
                    Engeli Kaldır
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. LiveKit SFU & TURN Settings + Live Connection Test */}
      {isCardVisible(
        'media',
        'livekit sfu turn medya sunucusu hibrit eşik api key secret test ice cgnat'
      ) && (
        <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-white">LiveKit SFU (Hibrit Medya Sunucusu)</span>
                {adminData?.livekitStatus && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      adminData.livekitStatus.reachable
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    }`}
                    title={adminData.livekitStatus.url}
                  >
                    {adminData.livekitStatus.reachable
                      ? '● Aktif & Erişilebilir'
                      : `● ${adminData.livekitStatus.reason}`}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-white/50">
                Kalabalık odaları P2P Mesh yerine otomatik olarak LiveKit SFU&apos;ya geçirir. URL/Key boşsa
                `start.sh` içindeki yerel LiveKit kullanılır.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={livekitTestBusy}
                onClick={handleLiveKitTest}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-50 border border-cyan-500/30 text-cyan-200 text-[11px] font-bold flex items-center gap-1.5 transition"
              >
                <Wifi className="w-3.5 h-3.5" />
                {livekitTestBusy ? 'Test Ediliyor...' : 'LiveKit & TURN Test Et'}
              </button>
              <button
                type="button"
                onClick={() => {
                  fields.setSysSfuEnabled((v) => !v);
                  setIsSystemDirty(true);
                }}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                  fields.sysSfuEnabled ? 'bg-emerald-500' : 'bg-white/15'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                    fields.sysSfuEnabled ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {fields.sysSfuEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
              <div>
                <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                  Hibrit Geçiş Eşiği (Kişi Sayısı)
                </label>
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={fields.sysSfuThreshold}
                  onChange={(e) => {
                    fields.setSysSfuThreshold(Math.min(30, Math.max(2, Number(e.target.value) || 6)));
                    setIsSystemDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                  LiveKit URL (İsteğe bağlı)
                </label>
                <input
                  type="text"
                  value={fields.sysLivekitUrl}
                  onChange={(e) => {
                    fields.setSysLivekitUrl(e.target.value);
                    setIsSystemDirty(true);
                  }}
                  placeholder="http://127.0.0.1:7880"
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                  LiveKit API Key (İsteğe bağlı)
                </label>
                <input
                  type="text"
                  value={fields.sysLivekitApiKey}
                  onChange={(e) => {
                    fields.setSysLivekitApiKey(e.target.value);
                    setIsSystemDirty(true);
                  }}
                  placeholder="Otomatik (.livekit-secrets)"
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                  LiveKit API Secret (İsteğe bağlı)
                </label>
                <input
                  type="password"
                  value={fields.sysLivekitApiSecret}
                  onChange={(e) => {
                    fields.setSysLivekitApiSecret(e.target.value);
                    setIsSystemDirty(true);
                  }}
                  placeholder="Otomatik (.livekit-secrets)"
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-emerald-400"
                />
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-white/10">
                <div className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider mb-2">
                  Özel TURN Sunucusu (CGNAT / Dış Ağ Geçişi — İsteğe Bağlı)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={fields.sysTurnUrl}
                    onChange={(e) => {
                      fields.setSysTurnUrl(e.target.value);
                      setIsSystemDirty(true);
                    }}
                    placeholder="turn:turn.alanadiniz.com:3478"
                    className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-cyan-400"
                  />
                  <input
                    type="text"
                    value={fields.sysTurnUsername}
                    onChange={(e) => {
                      fields.setSysTurnUsername(e.target.value);
                      setIsSystemDirty(true);
                    }}
                    placeholder="TURN Kullanıcı Adı"
                    className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-cyan-400"
                  />
                  <input
                    type="password"
                    value={fields.sysTurnCredential}
                    onChange={(e) => {
                      fields.setSysTurnCredential(e.target.value);
                      setIsSystemDirty(true);
                    }}
                    placeholder="TURN Şifre / Secret"
                    className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            </div>
          )}

          {livekitTestResult && (
            <div
              className={`p-3 rounded-xl text-xs border space-y-1 ${
                livekitTestResult.ok
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-200'
              }`}
            >
              {livekitTestResult.error && <div>❌ {livekitTestResult.error}</div>}
              {livekitTestResult.livekit && (
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    <b>LiveKit ({livekitTestResult.livekit.url}):</b> {livekitTestResult.livekit.message}
                  </span>
                </div>
              )}
              {livekitTestResult.turn && (
                <div className="text-[11px] opacity-90 pl-5">
                  <b>TURN:</b> {livekitTestResult.turn.message}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 7. Email OTP & SMTP Settings */}
      {isCardVisible('email', 'eposta e-posta doğrulama otp smtp port ssl mail relay test') && (
        <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-white">E-Posta Doğrulama (6 Haneli OTP) &amp; SMTP</div>
              <div className="text-[11px] text-white/50">
                Açıldığında yeni kayıtlarda e-postaya 6 haneli doğrulama kodu gönderilir.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                fields.setSysRequireEmailVerif(!fields.sysRequireEmailVerif);
                setIsSystemDirty(true);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                fields.sysRequireEmailVerif ? 'bg-emerald-500' : 'bg-white/15'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  fields.sysRequireEmailVerif ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {fields.sysRequireEmailVerif && !fields.sysMailRelayUrl.trim() && !fields.sysSmtpHost.trim() && (
            <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-200 text-xs">
              ⚠️ E-posta doğrulaması açık ancak ne <b>SMTP Host</b> ne de <b>HTTPS Mail Relay URL</b> girilmiş. Kayıt sırasında OTP gönderilebilmesi için ikisinden birini doldurup kaydedin.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              value={fields.sysSmtpHost}
              onChange={(e) => {
                fields.setSysSmtpHost(e.target.value);
                setIsSystemDirty(true);
              }}
              placeholder="SMTP Host (örn: smtp.gmail.com)"
              className="sm:col-span-2 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-cyan-400"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={fields.sysSmtpPort}
                onChange={(e) => {
                  fields.setSysSmtpPort(Number(e.target.value));
                  setIsSystemDirty(true);
                }}
                placeholder="587"
                className="w-20 px-2.5 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-cyan-400"
              />
              <label className="flex items-center gap-1.5 text-[11px] text-white/75 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fields.sysSmtpSecure}
                  onChange={(e) => {
                    fields.setSysSmtpSecure(e.target.checked);
                    setIsSystemDirty(true);
                  }}
                  className="rounded border-white/20 bg-black/40"
                />
                SSL (465)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={fields.sysSmtpUser}
              onChange={(e) => {
                fields.setSysSmtpUser(e.target.value);
                setIsSystemDirty(true);
              }}
              placeholder="SMTP Kullanıcı / E-Posta"
              className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-cyan-400"
            />
            <div className="flex items-center gap-1.5">
              <input
                type={showSmtpPass ? 'text' : 'password'}
                value={fields.sysSmtpPass}
                onChange={(e) => {
                  fields.setSysSmtpPass(e.target.value);
                  setIsSystemDirty(true);
                }}
                placeholder="SMTP Şifre / Uygulama Şifresi"
                className="flex-1 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => setShowSmtpPass((v) => !v)}
                className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-white/75"
              >
                {showSmtpPass ? 'Gizle' : 'Göster'}
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider">
              HTTPS Mail Relay (Opsiyonel — SMTP Port Engeli Varsa)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="url"
                value={fields.sysMailRelayUrl}
                onChange={(e) => {
                  fields.setSysMailRelayUrl(e.target.value);
                  setIsSystemDirty(true);
                }}
                placeholder="https://yahyakemalokutan.com/mail-relay.php"
                className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-cyan-400"
              />
              <input
                type="password"
                value={fields.sysMailRelaySecret}
                onChange={(e) => {
                  fields.setSysMailRelaySecret(e.target.value);
                  setIsSystemDirty(true);
                }}
                placeholder="Relay Gizli Anahtarı (X-Relay-Secret)"
                className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={fields.sysSmtpFrom}
              onChange={(e) => {
                fields.setSysSmtpFrom(e.target.value);
                setIsSystemDirty(true);
              }}
              placeholder="Gönderen E-Posta (örn: noreply@yahyakemalokutan.com)"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-cyan-400"
            />
            <input
              type="email"
              value={smtpTestTo}
              onChange={(e) => setSmtpTestTo(e.target.value)}
              placeholder="Test alıcı e-posta..."
              className="w-48 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              disabled={smtpTestBusy}
              onClick={async () => {
                setSmtpTestBusy(true);
                setSmtpTestResult(null);
                const res = await onTestSmtp(smtpTestTo || fields.sysSmtpUser, {
                  smtpHost: fields.sysSmtpHost,
                  smtpPort: fields.sysSmtpPort,
                  smtpSecure: fields.sysSmtpSecure,
                  smtpUser: fields.sysSmtpUser,
                  smtpPass: fields.sysSmtpPass,
                  smtpFrom: fields.sysSmtpFrom,
                  mailRelayUrl: fields.sysMailRelayUrl,
                  mailRelaySecret: fields.sysMailRelaySecret,
                });
                setSmtpTestBusy(false);
                setSmtpTestResult(res);
              }}
              className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition shrink-0 disabled:opacity-50"
            >
              {smtpTestBusy ? 'Gönderiliyor...' : 'Test Maili Gönder'}
            </button>
          </div>
          {smtpTestResult && (
            <div
              className={`px-3 py-2 rounded-xl text-xs border ${
                smtpTestResult.ok
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}
            >
              {smtpTestResult.message}
            </div>
          )}
        </div>
      )}

      {/* 8. Scheduled Auto-Backup + Webhook + Manual Import/Export */}
      {isCardVisible(
        'backup',
        'otomatik yedekleme zamanlayıcı backup json geri yükle dışa aktar harici webhook uyarı bildirim'
      ) && (
        <>
          <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-teal-300">
                  Otomatik Yedekleme Zamanlayıcısı
                </div>
                <div className="text-[11px] text-white/45">
                  Belirlenen aralıklarla sunucu üzerinde otomatik JSON yedeği oluşturur.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  fields.setSysAutoBackupEnabled(!fields.sysAutoBackupEnabled);
                  setIsSystemDirty(true);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  fields.sysAutoBackupEnabled ? 'bg-emerald-500' : 'bg-white/15'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    fields.sysAutoBackupEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-white/50 mb-1">Yedekleme Aralığı (Saat)</label>
                <select
                  value={fields.sysAutoBackupHours}
                  onChange={(e) => {
                    fields.setSysAutoBackupHours(Number(e.target.value));
                    setIsSystemDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                >
                  <option value={6}>6 Saatte Bir</option>
                  <option value={12}>12 Saatte Bir</option>
                  <option value={24}>24 Saatte Bir (Günlük)</option>
                  <option value={48}>48 Saatte Bir</option>
                  <option value={168}>Haftalık</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/50 mb-1">Saklanacak Maks. Yedek</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={fields.sysMaxBackups}
                  onChange={(e) => {
                    fields.setSysMaxBackups(Number(e.target.value));
                    setIsSystemDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>
              <button
                type="button"
                onClick={() => onTriggerBackupNow()}
                className="px-3 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/30 text-teal-200 text-xs font-bold transition"
              >
                Şimdi Sunucu Yedeği Al
              </button>
            </div>

            {(adminData?.scheduledBackups || []).length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {(adminData?.scheduledBackups || []).map((bk) => (
                  <div
                    key={bk.filename}
                    className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-white/85 truncate">{bk.filename}</span>
                      <span className="text-[10px] text-amber-300 ml-2">{(bk.bytes / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onRequestDialog({
                            type: 'confirm',
                            title: 'Zamanlanmış Yedeği Geri Yükle',
                            description: `"${bk.filename}" yedeğini geri yüklemek istediğinize emin misiniz?`,
                            confirmLabel: 'Geri Yükle',
                            tone: 'amber',
                            onConfirm: () => onRestoreScheduledBackup(bk.filename),
                          })
                        }
                        className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-bold transition"
                      >
                        Geri Yükle
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onRequestDialog({
                            type: 'confirm',
                            title: 'Yedeği Sil',
                            description: `"${bk.filename}" yedek dosyasını silmek istediğinize emin misiniz?`,
                            confirmLabel: 'Sil',
                            tone: 'danger',
                            onConfirm: () => onDeleteScheduledBackup(bk.filename),
                          })
                        }
                        className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold transition"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Harici Webhook Uyarıları
                </div>
                <div className="text-[11px] text-white/45">
                  Kritik olaylarda Discord / Telegram / HTTP Webhook adresine anlık bildirim gönderir.
                </div>
              </div>
              <button
                type="button"
                onClick={() => onTestWebhook()}
                className="px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 text-[11px] font-bold transition shrink-0"
              >
                Test Gönder
              </button>
            </div>
            <input
              type="url"
              value={fields.sysWebhookUrl}
              onChange={(e) => {
                fields.setSysWebhookUrl(e.target.value);
                setIsSystemDirty(true);
              }}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-mono outline-none focus:border-amber-400"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                { key: 'security', label: 'Güvenlik / Brute-Force' },
                { key: 'bans', label: 'Kullanıcı & IP Ban' },
                { key: 'dedicated', label: 'Dedicated Olayları' },
                { key: 'backups', label: 'Yedekleme İşlemleri' },
              ].map((ev) => (
                <label
                  key={ev.key}
                  className="flex items-center gap-2 p-2 rounded-xl bg-black/25 border border-white/5 cursor-pointer select-none text-[11px] text-white/80"
                >
                  <input
                    type="checkbox"
                    checked={Boolean((fields.sysWebhookEvents as any)[ev.key])}
                    onChange={(e) => {
                      fields.setSysWebhookEvents((prev) => ({ ...prev, [ev.key]: e.target.checked }));
                      setIsSystemDirty(true);
                    }}
                    className="rounded border-white/20 bg-black/40 text-indigo-500"
                  />
                  <span>{ev.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `cakma-system-backup-${new Date().toISOString().slice(0, 10)}.json`,
                    JSON.stringify(
                      {
                        exportedAt: new Date().toISOString(),
                        stats: adminData?.stats,
                        systemConfig: adminData?.systemConfig,
                        storeSettings: adminData?.storeSettings,
                        serversCount: adminData?.servers?.length || 0,
                        usersCount: adminData?.registeredUsers?.length || 0,
                        auditLogs: adminData?.auditLogs || [],
                      },
                      null,
                      2
                    ),
                    'application/json'
                  )
                }
                className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-semibold flex items-center gap-2 transition"
              >
                <Download className="w-3.5 h-3.5 text-teal-400" />
                Özet JSON
              </button>

              <button
                type="button"
                onClick={() => onExportFullBackup()}
                className="px-3.5 py-2.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-200 text-xs font-semibold flex items-center gap-2 transition"
              >
                <Download className="w-3.5 h-3.5 text-teal-300" />
                Tam Veri Yedeği İndir
              </button>

              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const parsed = JSON.parse(text);
                    onRequestDialog({
                      type: 'confirm',
                      title: 'Tam Yedekten Geri Yükle',
                      description: `"${file.name}" yedeğini geri yüklemek istediğinize emin misiniz? Mevcut verilerin üzerine yazılacaktır.`,
                      confirmLabel: 'Üzerine Yaz ve Yükle',
                      tone: 'danger',
                      onConfirm: () => onRestoreFullBackup(parsed),
                    });
                  } catch {
                    onNotify('error', 'Geçersiz JSON yedek dosyası.');
                  }
                }}
              />
              <button
                type="button"
                onClick={() => restoreInputRef.current?.click()}
                className="px-3.5 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 text-xs font-semibold transition"
              >
                Yedekten Geri Yükle
              </button>
            </div>
          </div>

          <AdminMaintenanceCard
            currentServerHost={currentServerHost}
            onRequestDialog={onRequestDialog}
            onNotify={onNotify}
          />
        </>
      )}

      {/* Regular bottom save action when visible */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-teal-500 hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-amber-500/20 transition flex items-center gap-2"
        >
          <Check className="w-4 h-4" />
          Sistem Ayarlarını Kaydet
        </button>
      </div>

      {/* Sticky Unsaved Changes Bar */}
      {isSystemDirty && (
        <div className="sticky bottom-0 z-20 p-3.5 rounded-2xl bg-[#151822]/95 backdrop-blur-xl border border-amber-400/40 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-amber-200">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span>Kaydedilmemiş sistem değişiklikleri var</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={discardChanges}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/80 flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-teal-500 hover:brightness-110 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-500/25 transition"
            >
              <Check className="w-3.5 h-3.5" />
              Kaydet
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
