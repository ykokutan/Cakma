import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { AvatarView } from './AvatarView';
import {
  Shield,
  X,
  Activity,
  Users,
  Server,
  FileText,
  Megaphone,
  RefreshCw,
  Trash2,
  Volume2,
  Hash,
  Send,
  Cpu,
  Clock,
  Radio,
  Key,
  Copy,
  Check,
  Globe,
  ExternalLink,
  HardDrive,
  Ban,
  CheckCircle,
  ShoppingCart,
  UserCheck,
  ShoppingBag,
  CreditCard,
  Building2,
  Coins,
  Wallet,
  Percent,
  Tag,
  Calendar,
  Search,
  Sliders,
  Download,
} from 'lucide-react';
import { IssuedLicense } from '../types';

interface AdminDashboardModalProps {
  onClose: () => void;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ onClose }) => {
  const {
    adminData,
    fetchAdminData,
    adminChangeRole,
    adminKickUser,
    adminDeleteChannel,
    adminBroadcastAnnouncement,
    adminClearPinnedBanner,
    generateDedicatedLicense,
    adminRevokeLicense,
    adminActivateLicense,
    adminExtendLicense,
    adminUpdateStoreSettings,
    adminUpdateSystemConfig,
    adminClearConnectionLogs,
    adminUpdateWallet,
    adminBanUser,
    adminUnbanUser,
    adminResetUser2fa,
    adminBanIp,
    adminUnbanIp,
    adminExportFullBackup,
    adminRestoreFullBackup,
    adminTriggerBackupNow,
    adminRestoreScheduledBackup,
    adminDeleteScheduledBackup,
    adminTestWebhook,
    adminPurgeMessages,
    adminResetUserPassword,
    adminCreateChannel,
    adminDeleteServer,
    adminClearAuditLogs,
    adminFeedback,
    storeSettings,
    generatedLicense,
    clearGeneratedLicense,
    onlineUsers,
    connectToDedicatedServer,
    currentServerHost,
    resetToMainServer,
  } = useSocket();

  const [activeTab, setActiveTab] = useState<'overview' | 'system' | 'dedicated' | 'users' | 'licenses' | 'store' | 'servers' | 'logs' | 'broadcast'>('overview');
  const [inspectedUsername, setInspectedUsername] = useState<string | null>(null);

  const exportJsonFile = (filename: string, payload: any) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('dsp_admin_auto_refresh'));
      return [0, 5, 15, 30].includes(saved) ? saved : 0;
    } catch {
      return 0;
    }
  });
  const [sysRegEnabled, setSysRegEnabled] = useState<boolean>(true);
  const [sysMaintenance, setSysMaintenance] = useState<boolean>(false);
  const [sysMaintMsg, setSysMaintMsg] = useState<string>('Sistem şu anda planlı bakım modundadır. Lütfen daha sonra tekrar deneyin.');
  const [sysStrongPass, setSysStrongPass] = useState<boolean>(false);
  const [sysMaxMsgLen, setSysMaxMsgLen] = useState<number>(2000);
  const [sysSlowmode, setSysSlowmode] = useState<number>(0);
  const [sysMaxUploadMb, setSysMaxUploadMb] = useState<number>(5);
  const [sysMaxLoginAttempts, setSysMaxLoginAttempts] = useState<number>(5);
  const [sysLockoutMins, setSysLockoutMins] = useState<number>(15);
  const [sysGlobalBlockLinks, setSysGlobalBlockLinks] = useState<boolean>(false);
  const [sysGlobalBannedWordsText, setSysGlobalBannedWordsText] = useState<string>('');
  const [sysAutoBackupEnabled, setSysAutoBackupEnabled] = useState<boolean>(false);
  const [sysAutoBackupHours, setSysAutoBackupHours] = useState<number>(24);
  const [sysMaxBackups, setSysMaxBackups] = useState<number>(7);
  const [sysWebhookUrl, setSysWebhookUrl] = useState<string>('');
  const [sysWebhookEvents, setSysWebhookEvents] = useState<{ security: boolean; bans: boolean; dedicated: boolean; backups: boolean }>({
    security: true,
    bans: true,
    dedicated: true,
    backups: false,
  });
  const [isSystemDirty, setIsSystemDirty] = useState<boolean>(false);

  const [ipBanInput, setIpBanInput] = useState<string>('');
  const [ipBanReason, setIpBanReason] = useState<string>('Şüpheli trafik / kural ihlali');
  const [ipBanDuration, setIpBanDuration] = useState<number>(0);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'admins' | 'server'>('all');
  const [broadcastServerId, setBroadcastServerId] = useState<string>('');
  const [broadcastPinBanner, setBroadcastPinBanner] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('dsp_admin_auto_refresh', String(autoRefreshSec));
    } catch {}
  }, [autoRefreshSec]);

  useEffect(() => {
    if (adminData?.systemConfig && !isSystemDirty) {
      setSysRegEnabled(adminData.systemConfig.registrationEnabled);
      setSysMaintenance(adminData.systemConfig.maintenanceMode);
      setSysMaintMsg(adminData.systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır. Lütfen daha sonra tekrar deneyin.');
      setSysStrongPass(adminData.systemConfig.requireStrongPasswords);
      setSysMaxMsgLen(adminData.systemConfig.maxMessageLength);
      setSysSlowmode(adminData.systemConfig.defaultSlowmodeSeconds);
      setSysMaxUploadMb(adminData.systemConfig.maxUploadSizeMb);
      setSysMaxLoginAttempts(adminData.systemConfig.maxLoginAttempts ?? 5);
      setSysLockoutMins(adminData.systemConfig.loginLockoutMinutes ?? 15);
      setSysGlobalBlockLinks(Boolean(adminData.systemConfig.globalBlockLinks));
      setSysGlobalBannedWordsText((adminData.systemConfig.globalBannedWords || []).join(', '));
      setSysAutoBackupEnabled(Boolean(adminData.systemConfig.autoBackupEnabled));
      setSysAutoBackupHours(adminData.systemConfig.autoBackupIntervalHours ?? 24);
      setSysMaxBackups(adminData.systemConfig.maxBackupsToKeep ?? 7);
      setSysWebhookUrl(adminData.systemConfig.webhookUrl || '');
      setSysWebhookEvents({
        security: adminData.systemConfig.webhookEvents?.security ?? true,
        bans: adminData.systemConfig.webhookEvents?.bans ?? true,
        dedicated: adminData.systemConfig.webhookEvents?.dedicated ?? true,
        backups: adminData.systemConfig.webhookEvents?.backups ?? false,
      });
    }
  }, [adminData?.systemConfig, isSystemDirty]);

  useEffect(() => {
    if (autoRefreshSec <= 0) return;
    const id = setInterval(() => fetchAdminData(), autoRefreshSec * 1000);
    return () => clearInterval(id);
  }, [autoRefreshSec, fetchAdminData]);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [announcementSent, setAnnouncementSent] = useState(false);
  const [copiedServerId, setCopiedServerId] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'online' | 'banned' | 'admin'>('all');
  const [newChannelInputs, setNewChannelInputs] = useState<Record<string, { name: string; type: 'text' | 'voice' }>>({});
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'info' | 'warn' | 'voice' | 'auth' | 'security'>('all');

  // License Generator State
  const [licCustomer, setLicCustomer] = useState('');
  const [licUser, setLicUser] = useState('admin');
  const [licSlots, setLicSlots] = useState('64');
  const [licDays, setLicDays] = useState('365');
  const [licTier, setLicTier] = useState<'Starter' | 'Pro' | 'Enterprise'>('Pro');
  const [copiedKey, setCopiedKey] = useState(false);

  // License Extension State (Admin)
  const [extendingLicense, setExtendingLicense] = useState<IssuedLicense | null>(null);
  const [extendDays, setExtendDays] = useState<number>(30);
  const [extendSuccessMsg, setExtendSuccessMsg] = useState<string>('');

  // Store Management State
  const [storeIsOpen, setStoreIsOpen] = useState<boolean>(true);
  const [storeClosedReason, setStoreClosedReason] = useState<string>('');
  const [starterPrice, setStarterPrice] = useState<number>(99);
  const [starterSlots, setStarterSlots] = useState<number>(16);
  const [starterEnabled, setStarterEnabled] = useState<boolean>(true);
  const [proPrice, setProPrice] = useState<number>(249);
  const [proSlots, setProSlots] = useState<number>(64);
  const [proEnabled, setProEnabled] = useState<boolean>(true);
  const [enterprisePrice, setEnterprisePrice] = useState<number>(799);
  const [enterpriseSlots, setEnterpriseSlots] = useState<number>(256);
  const [enterpriseEnabled, setEnterpriseEnabled] = useState<boolean>(true);
  const [customSlotUnitPrice, setCustomSlotUnitPrice] = useState<number>(4);
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [campaignBanner, setCampaignBanner] = useState<string>('');
  const [mult90, setMult90] = useState<number>(2.5);
  const [mult180, setMult180] = useState<number>(4.5);
  const [mult365, setMult365] = useState<number>(8);
  const [multLifetime, setMultLifetime] = useState<number>(12);
  const [allowLifetimePurchase, setAllowLifetimePurchase] = useState<boolean>(true);
  const [renewalDiscountPercentage, setRenewalDiscountPercentage] = useState<number>(0);
  const [payWallet, setPayWallet] = useState<boolean>(true);
  const [payWalletDesc, setPayWalletDesc] = useState<string>('Hesabınızdaki bakiye ile anında onay.');
  const [payCard, setPayCard] = useState<boolean>(true);
  const [payCardDesc, setPayCardDesc] = useState<string>('3D Secure korumalı güvenli kart ödemesi.');
  const [payBank, setPayBank] = useState<boolean>(true);
  const [payBankDesc, setPayBankDesc] = useState<string>('7/24 Anında banka transferi ile manuel onay.');
  const [payCrypto, setPayCrypto] = useState<boolean>(false);
  const [payCryptoDesc, setPayCryptoDesc] = useState<string>('TRC20 / ERC20 ağı ile anonim hızlı ödeme.');
  const [storeSavedNotice, setStoreSavedNotice] = useState<boolean>(false);
  const [isStoreDirty, setIsStoreDirty] = useState<boolean>(false);
  const storeFormInitializedRef = useRef<boolean>(false);

  const syncStoreFormFromServer = (s: NonNullable<typeof storeSettings>) => {
    setStoreIsOpen(s.isOpen);
    setStoreClosedReason(s.closedReason || '');
    setStarterPrice(s.packages?.starter?.price ?? 99);
    setStarterSlots(s.packages?.starter?.slots ?? 16);
    setStarterEnabled(s.packages?.starter?.enabled ?? true);
    setProPrice(s.packages?.pro?.price ?? 249);
    setProSlots(s.packages?.pro?.slots ?? 64);
    setProEnabled(s.packages?.pro?.enabled ?? true);
    setEnterprisePrice(s.packages?.enterprise?.price ?? 799);
    setEnterpriseSlots(s.packages?.enterprise?.slots ?? 256);
    setEnterpriseEnabled(s.packages?.enterprise?.enabled ?? true);
    setCustomSlotUnitPrice(s.customSlotUnitPrice ?? 4);
    setDiscountPercentage(s.discountPercentage ?? 0);
    setCampaignBanner(s.campaignBanner ?? '');
    setMult90(s.durationMultipliers?.days90 ?? 2.5);
    setMult180(s.durationMultipliers?.days180 ?? 4.5);
    setMult365(s.durationMultipliers?.days365 ?? 8);
    setMultLifetime(s.durationMultipliers?.lifetime ?? 12);
    setAllowLifetimePurchase(s.allowLifetimePurchase ?? true);
    setRenewalDiscountPercentage(s.renewalDiscountPercentage ?? 0);

    const mWallet = s.paymentMethods?.find(m => m.id === 'wallet');
    const mCard = s.paymentMethods?.find(m => m.id === 'credit_card');
    const mBank = s.paymentMethods?.find(m => m.id === 'bank_transfer');
    const mCrypto = s.paymentMethods?.find(m => m.id === 'crypto');
    setPayWallet(mWallet ? mWallet.enabled : true);
    setPayWalletDesc(mWallet?.description || 'Hesabınızdaki bakiye ile anında onay.');
    setPayCard(mCard ? mCard.enabled : true);
    setPayCardDesc(mCard?.description || '3D Secure korumalı güvenli kart ödemesi.');
    setPayBank(mBank ? mBank.enabled : true);
    setPayBankDesc(mBank?.description || '7/24 Anında banka transferi ile manuel onay.');
    setPayCrypto(mCrypto ? mCrypto.enabled : false);
    setPayCryptoDesc(mCrypto?.description || 'TRC20 / ERC20 ağı ile anonim hızlı ödeme.');
  };

  useEffect(() => {
    fetchAdminData();
    const interval = setInterval(() => {
      fetchAdminData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const s = adminData?.storeSettings || storeSettings;
    if (s && (!storeFormInitializedRef.current || !isStoreDirty)) {
      syncStoreFormFromServer(s);
      storeFormInitializedRef.current = true;
    }
  }, [adminData?.storeSettings, storeSettings, isStoreDirty]);

  const stats = adminData?.stats;

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '0 sn';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}s ${mins}d ${secs}sn`;
    if (mins > 0) return `${mins}d ${secs}sn`;
    return `${secs} sn`;
  };

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    adminBroadcastAnnouncement(broadcastMessage.trim(), {
      target: broadcastTarget,
      serverId: broadcastTarget === 'server' ? (broadcastServerId || adminData?.servers?.[0]?.id) : undefined,
      pinBanner: broadcastPinBanner,
    });
    setBroadcastMessage('');
    setAnnouncementSent(true);
    setTimeout(() => setAnnouncementSent(false), 3000);
  };

  const handleCreateLicense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!licCustomer.trim()) return;
    generateDedicatedLicense({
      licensee: licCustomer.trim(),
      maxSlots: Number(licSlots),
      expireDays: Number(licDays),
      tier: licTier,
      assignedUsername: licUser || undefined,
    });
  };

  const handleSaveStoreSettings = (e: React.FormEvent) => {
    e.preventDefault();
    adminUpdateStoreSettings({
      isOpen: storeIsOpen,
      closedReason: storeClosedReason,
      currencySymbol: '₺',
      customSlotUnitPrice: Number(customSlotUnitPrice),
      discountPercentage: Number(discountPercentage),
      campaignBanner: campaignBanner.trim(),
      durationMultipliers: {
        days90: Number(mult90) || 2.5,
        days180: Number(mult180) || 4.5,
        days365: Number(mult365) || 8,
        lifetime: Number(multLifetime) || 12,
      },
      allowLifetimePurchase,
      renewalDiscountPercentage: Number(renewalDiscountPercentage) || 0,
      packages: {
        starter: {
          tier: 'Starter',
          name: 'Başlangıç Topluluğu',
          slots: Number(starterSlots),
          price: Number(starterPrice),
          enabled: starterEnabled,
          description: 'Küçük arkadaş grupları ve mini ekipler için ideal.'
        },
        pro: {
          tier: 'Pro',
          name: 'Klan Pro Sunucu',
          slots: Number(proSlots),
          price: Number(proPrice),
          enabled: proEnabled,
          description: 'WebRTC Opus HD Ses & e-Spor klanları için optimize.'
        },
        enterprise: {
          tier: 'Enterprise',
          name: 'Kurumsal & Mega',
          slots: Number(enterpriseSlots),
          price: Number(enterprisePrice),
          enabled: enterpriseEnabled,
          description: 'Öncelikli bant genişliği, sınırsız yetki ve özel SLA.'
        }
      },
      paymentMethods: [
        { id: 'wallet', name: 'Cüzdan Bakiyesi', enabled: payWallet, icon: 'Wallet', description: payWalletDesc.trim() || 'Hesabınızdaki bakiye ile anında onay.' },
        { id: 'credit_card', name: 'Kredi / Banka Kartı', enabled: payCard, icon: 'CreditCard', description: payCardDesc.trim() || '3D Secure korumalı güvenli kart ödemesi.' },
        { id: 'bank_transfer', name: 'Havale / FAST / EFT', enabled: payBank, icon: 'Building2', description: payBankDesc.trim() || '7/24 Anında banka transferi ile manuel onay.' },
        { id: 'crypto', name: 'Kripto Para (USDT/BTC)', enabled: payCrypto, icon: 'Coins', description: payCryptoDesc.trim() || 'TRC20 / ERC20 ağı ile anonim hızlı ödeme.' },
      ]
    });
    setIsStoreDirty(false);
    setStoreSavedNotice(true);
    setTimeout(() => setStoreSavedNotice(false), 3000);
  };

  const handleCopyLicense = () => {
    if (generatedLicense?.licenseKey) {
      navigator.clipboard.writeText(generatedLicense.licenseKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleCopyHost = (host: string, id: string) => {
    navigator.clipboard.writeText(host);
    setCopiedServerId(id);
    setTimeout(() => setCopiedServerId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-6xl ios-glass rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-white/15 h-[92dvh] md:h-[720px] relative">
        {/* Admin Header */}
        <header className="h-16 px-5 sm:px-6 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-gradient-to-r from-amber-500/10 via-teal-500/5 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">Sistem Yönetim Konsolu</h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold border border-amber-400/30 shrink-0">
                  ROOT
                </span>
              </div>
              <p className="text-[11px] text-white/45 truncate hidden sm:block">
                Sistem yapılandırması, güvenlik, altyapı ve topluluk yönetimi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentServerHost !== 'localhost:4000' && (
              <button
                onClick={resetToMainServer}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-semibold transition"
                title="Ana Yönetim Sunucusuna Geç"
              >
                Ana Sunucuya Geç (Port 4000)
              </button>
            )}

            <button
              onClick={() => fetchAdminData()}
              className="p-2 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition"
              title="Yenile"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Live Admin Action Feedback Banner */}
        {adminFeedback && (
          <div
            className={`px-6 py-2 text-xs font-semibold flex items-center justify-between border-b shrink-0 animate-fade-in ${
              adminFeedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            <span>{adminFeedback.message}</span>
          </div>
        )}

        {/* Body: Categorized Sidebar + Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-white/[0.07] bg-black/25 p-2.5 md:p-3 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto no-scrollbar">
            {[
              {
                group: 'Genel & Ayarlar',
                items: [
                  { id: 'overview', label: 'Genel Bakış', icon: Activity },
                  { id: 'system', label: 'Sistem Ayarları', icon: Sliders },
                ],
              },
              {
                group: 'Topluluk & Güvenlik',
                items: [
                  { id: 'users', label: `Kullanıcılar (${adminData?.registeredUsers.length || 0})`, icon: Users },
                  { id: 'servers', label: 'Sunucular', icon: Server },
                  { id: 'logs', label: `Denetim (${adminData?.auditLogs.length || 0})`, icon: FileText },
                ],
              },
              {
                group: 'Altyapı & Mağaza',
                items: [
                  { id: 'dedicated', label: `Dedicated (${adminData?.dedicatedServers?.length || 0})`, icon: Cpu },
                  { id: 'licenses', label: `Lisanslar (${adminData?.issuedLicenses?.length || 0})`, icon: Key },
                  { id: 'store', label: `Mağaza ${storeIsOpen ? '●' : '○'}`, icon: ShoppingBag },
                ],
              },
              {
                group: 'İletişim',
                items: [
                  { id: 'broadcast', label: 'Sistem Duyurusu', icon: Megaphone },
                ],
              },
            ].map((sec) => (
              <div key={sec.group} className="flex md:flex-col gap-1 md:mb-2 shrink-0">
                <div className="hidden md:block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/35">
                  {sec.group}
                </div>
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  const isAct = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id as any)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 whitespace-nowrap ${
                        isAct
                          ? 'bg-gradient-to-r from-amber-500/25 via-teal-500/15 to-transparent text-white border border-amber-400/35 shadow-sm'
                          : 'text-white/60 hover:bg-white/[0.06] hover:text-white border border-transparent'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isAct ? 'text-amber-300' : 'opacity-75'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>

          {/* Admin Content Area */}
          <div className="flex-1 p-5 sm:p-6 overflow-y-auto">
            {/* NEW TAB: RUNTIME SYSTEM SETTINGS */}
            {activeTab === 'system' && (
              <div className="space-y-5 max-w-3xl">
                <div>
                  <h3 className="text-base font-bold text-white">Detaylı Sistem & Güvenlik Ayarları</h3>
                  <p className="text-xs text-white/45 mt-0.5">
                    Kayıt politikası, mesaj limitleri ve panel otomatik yenileme ayarlarını canlı olarak yönetin.
                  </p>
                </div>

                {/* Access & Security Card */}
                <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-300">Erişim & Güvenlik Politikası</div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">Yeni Üye Kayıtları</div>
                      <div className="text-xs text-white/45">Kapatıldığında yeni kullanıcı kayıtları engellenir.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSysRegEnabled(!sysRegEnabled); setIsSystemDirty(true); }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sysRegEnabled ? 'bg-emerald-500' : 'bg-white/15'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sysRegEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/5">
                    <div>
                      <div className="text-sm font-semibold text-white">Güçlü Şifre Zorunluluğu</div>
                      <div className="text-xs text-white/45">Yeni kayıtlarda minimum şifre uzunluğunu 8 karaktere çıkarır.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSysStrongPass(!sysStrongPass); setIsSystemDirty(true); }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sysStrongPass ? 'bg-emerald-500' : 'bg-white/15'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sysStrongPass ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/5">
                    <div>
                      <div className="text-sm font-semibold text-white">Bakım Modu (Aktif Erişim Duvarı)</div>
                      <div className="text-xs text-white/45">Açıkken admin olmayanların giriş ve kayıt işlemleri engellenir.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSysMaintenance(!sysMaintenance); setIsSystemDirty(true); }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sysMaintenance ? 'bg-amber-500' : 'bg-white/15'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sysMaintenance ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-white/50 mb-1.5">Bakım Modu Mesajı</label>
                    <input
                      type="text"
                      value={sysMaintMsg}
                      onChange={(e) => { setSysMaintMsg(e.target.value); setIsSystemDirty(true); }}
                      placeholder="Örn: Sistem planlı bakım çalışması nedeniyle kısa süreliğine kapalıdır."
                      className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* Brute-Force & Global Anti-Spam Card */}
                <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-300">Brute-Force & Global Anti-Spam</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 mb-1.5">Maks. Hatalı Giriş Denemesi</label>
                      <input
                        type="number"
                        min={3}
                        max={20}
                        value={sysMaxLoginAttempts}
                        onChange={(e) => { setSysMaxLoginAttempts(Number(e.target.value)); setIsSystemDirty(true); }}
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 mb-1.5">IP Kilitleme Süresi (dk)</label>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={sysLockoutMins}
                        onChange={(e) => { setSysLockoutMins(Number(e.target.value)); setIsSystemDirty(true); }}
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/5">
                    <div>
                      <div className="text-sm font-semibold text-white">Global Harici Link Engeli</div>
                      <div className="text-xs text-white/45">Tüm sunucularda standart kullanıcıların URL paylaşmasını engeller.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSysGlobalBlockLinks(!sysGlobalBlockLinks); setIsSystemDirty(true); }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sysGlobalBlockLinks ? 'bg-rose-500' : 'bg-white/15'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sysGlobalBlockLinks ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-white/50 mb-1.5">Global Yasaklı Kelimeler (virgülle ayırın)</label>
                    <input
                      type="text"
                      value={sysGlobalBannedWordsText}
                      onChange={(e) => { setSysGlobalBannedWordsText(e.target.value); setIsSystemDirty(true); }}
                      placeholder="Örn: spamkelime, yasaksite, reklam"
                      className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* Chat & Upload Limits Card */}
                <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-teal-300">Sohbet & Medya Limitleri</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 mb-1.5">Maks. Mesaj Uzunluğu</label>
                      <input
                        type="number"
                        min={200}
                        max={8000}
                        value={sysMaxMsgLen}
                        onChange={(e) => { setSysMaxMsgLen(Number(e.target.value)); setIsSystemDirty(true); }}
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 mb-1.5">Varsayılan Yavaş Mod (sn)</label>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={sysSlowmode}
                        onChange={(e) => { setSysSlowmode(Number(e.target.value)); setIsSystemDirty(true); }}
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 mb-1.5">Maks. Dosya Limiti (MB)</label>
                      <input
                        type="number"
                        min={1}
                        max={25}
                        value={sysMaxUploadMb}
                        onChange={(e) => { setSysMaxUploadMb(Number(e.target.value)); setIsSystemDirty(true); }}
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Auto Refresh + Save */}
                <div className="p-5 rounded-2xl ios-glass-card border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">Panel Otomatik Yenileme</div>
                    <div className="text-xs text-white/45">Metrikleri ve logları belirli aralıklarla otomatik yeniler.</div>
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

                {/* IP Ban Management Card */}
                <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-amber-300">IP Engelleme Listesi ({adminData?.bannedIps?.length || 0})</div>
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
                        adminBanIp(ipBanInput.trim(), ipBanReason.trim(), ipBanDuration);
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
                        <div key={b.ip} className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between gap-2 text-xs">
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
                            onClick={() => adminUnbanIp(b.ip)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold shrink-0 transition"
                          >
                            Engeli Kaldır
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Scheduled Auto-Backup Card */}
                <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-teal-300">Otomatik Yedekleme Zamanlayıcısı</div>
                      <div className="text-[11px] text-white/45">Belirlenen aralıklarla sunucu üzerinde otomatik JSON yedeği oluşturur.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSysAutoBackupEnabled(!sysAutoBackupEnabled); setIsSystemDirty(true); }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sysAutoBackupEnabled ? 'bg-emerald-500' : 'bg-white/15'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sysAutoBackupEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 mb-1">Yedekleme Aralığı (Saat)</label>
                      <select
                        value={sysAutoBackupHours}
                        onChange={(e) => { setSysAutoBackupHours(Number(e.target.value)); setIsSystemDirty(true); }}
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
                        value={sysMaxBackups}
                        onChange={(e) => { setSysMaxBackups(Number(e.target.value)); setIsSystemDirty(true); }}
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => adminTriggerBackupNow()}
                      className="px-3 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/30 text-teal-200 text-xs font-bold transition"
                    >
                      Şimdi Sunucu Yedeği Al
                    </button>
                  </div>

                  {(adminData?.scheduledBackups || []).length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {(adminData?.scheduledBackups || []).map((bk) => (
                        <div key={bk.filename} className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <span className="font-mono font-semibold text-white/85 truncate">{bk.filename}</span>
                            <span className="text-[10px] text-amber-300 ml-2">{(bk.bytes / 1024).toFixed(1)} KB</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`"${bk.filename}" yedeğini geri yüklemek istediğinize emin misiniz?`)) {
                                  adminRestoreScheduledBackup(bk.filename);
                                }
                              }}
                              className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-bold transition"
                            >
                              Geri Yükle
                            </button>
                            <button
                              type="button"
                              onClick={() => adminDeleteScheduledBackup(bk.filename)}
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

                {/* External Webhook Alerts Card */}
                <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-indigo-300">Harici Webhook Uyarıları</div>
                      <div className="text-[11px] text-white/45">Kritik olaylarda Discord / Telegram / HTTP Webhook adresine anlık bildirim gönderir.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => adminTestWebhook()}
                      className="px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 text-[11px] font-bold transition shrink-0"
                    >
                      Test Gönder
                    </button>
                  </div>
                  <input
                    type="url"
                    value={sysWebhookUrl}
                    onChange={(e) => { setSysWebhookUrl(e.target.value); setIsSystemDirty(true); }}
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
                      <label key={ev.key} className="flex items-center gap-2 p-2 rounded-xl bg-black/25 border border-white/5 cursor-pointer select-none text-[11px] text-white/80">
                        <input
                          type="checkbox"
                          checked={Boolean((sysWebhookEvents as any)[ev.key])}
                          onChange={(e) => {
                            setSysWebhookEvents((prev) => ({ ...prev, [ev.key]: e.target.checked }));
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
                        exportJsonFile(`cakma-system-backup-${new Date().toISOString().slice(0, 10)}.json`, {
                          exportedAt: new Date().toISOString(),
                          stats: adminData?.stats,
                          systemConfig: adminData?.systemConfig,
                          storeSettings: adminData?.storeSettings,
                          serversCount: adminData?.servers?.length || 0,
                          usersCount: adminData?.registeredUsers?.length || 0,
                          auditLogs: adminData?.auditLogs || [],
                        })
                      }
                      className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-semibold flex items-center gap-2 transition"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400" />
                      Özet JSON
                    </button>

                    <button
                      type="button"
                      onClick={() => adminExportFullBackup()}
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
                          if (confirm(`"${file.name}" yedeğini geri yüklemek istediğinize emin misiniz? Mevcut verilerin üzerine yazılacaktır.`)) {
                            adminRestoreFullBackup(parsed);
                          }
                        } catch {
                          alert('Geçersiz JSON yedek dosyası.');
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

                  <button
                    type="button"
                    onClick={() => {
                      const bannedWords = sysGlobalBannedWordsText
                        .split(',')
                        .map((w) => w.trim())
                        .filter(Boolean);
                      adminUpdateSystemConfig({
                        registrationEnabled: sysRegEnabled,
                        maintenanceMode: sysMaintenance,
                        maintenanceMessage: sysMaintMsg,
                        requireStrongPasswords: sysStrongPass,
                        maxMessageLength: sysMaxMsgLen,
                        defaultSlowmodeSeconds: sysSlowmode,
                        maxUploadSizeMb: sysMaxUploadMb,
                        maxLoginAttempts: sysMaxLoginAttempts,
                        loginLockoutMinutes: sysLockoutMins,
                        globalBlockLinks: sysGlobalBlockLinks,
                        globalBannedWords: bannedWords,
                        autoBackupEnabled: sysAutoBackupEnabled,
                        autoBackupIntervalHours: sysAutoBackupHours,
                        maxBackupsToKeep: sysMaxBackups,
                        webhookUrl: sysWebhookUrl,
                        webhookEvents: sysWebhookEvents,
                      });
                      setIsSystemDirty(false);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-teal-500 hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-amber-500/20 transition"
                  >
                    Sistem Ayarlarını Kaydet
                  </button>
                </div>
              </div>
            )}

            {/* TAB 1: OVERVIEW METRICS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>RAM Heap Kullanımı</span>
                    <Cpu className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {stats?.memoryMB || 0} MB
                  </div>
                  <div className="text-[11px] text-emerald-400 font-medium">Node.js V8 Motoru</div>
                </div>

                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Sunucu Çalışma Süresi</span>
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {formatUptime(stats?.uptime)}
                  </div>
                  <div className="text-[11px] text-white/40">Kesintisiz Uptime</div>
                </div>

                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Canlı Soketler / WebRTC</span>
                    <Radio className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {stats?.activeSocketsCount || 0}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-medium">
                    {stats?.activeVoiceRoomsCount || 0} Aktif Ses Odası
                  </div>
                </div>

                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Dedicated Sunucu Havuzu</span>
                    <Globe className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {adminData?.dedicatedServers?.length || 0}
                  </div>
                  <div className="text-[11px] text-purple-400 font-medium">
                    {adminData?.dedicatedServers?.filter(s => s.status === 'online').length || 0} Çevrimiçi Sunucu
                  </div>
                </div>
              </div>

              {/* Quick Live Voice Monitor */}
              <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  Canlı Ses & Ekran Yayını İzleyicisi
                </h3>
                {onlineUsers.filter((u) => u.currentVoiceChannelId).length === 0 ? (
                  <p className="text-xs text-white/40 py-2">Şu an ses odalarında aktif kimse bulunmuyor.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {onlineUsers
                      .filter((u) => u.currentVoiceChannelId)
                      .map((u) => (
                        <div key={u.id} className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden shrink-0 text-sm">
                              <AvatarView avatar={u.avatar} alt={u.username} fallback="👤" className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-white">{u.username}</div>
                              <div className="text-[10px] text-emerald-400">{u.currentVoiceChannelId}</div>
                            </div>
                          </div>
                          {u.isScreenSharing && (
                            <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold animate-pulse">
                              YAYIN
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Quick System Status & Actions */}
              <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    Sistem Durumu & Hızlı İşlemler
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('system')}
                    className="text-[11px] font-semibold text-amber-300 hover:underline"
                  >
                    Ayarları Düzenle →
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase">Üye Kaydı</div>
                    <div className={`font-bold mt-0.5 ${sysRegEnabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {sysRegEnabled ? 'Açık' : 'Kapalı'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase">Bakım Modu</div>
                    <div className={`font-bold mt-0.5 ${sysMaintenance ? 'text-amber-400' : 'text-white/70'}`}>
                      {sysMaintenance ? 'Aktif' : 'Normal'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase">Benzersiz IP</div>
                    <div className="font-bold text-teal-300 mt-0.5">
                      {new Set((adminData?.connectionLogs || []).map((c) => c.ip)).size} IP
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase">Mesaj Limiti</div>
                    <div className="font-bold text-white mt-0.5">{sysMaxMsgLen} krk</div>
                  </div>
                </div>
              </div>

              {/* Storage & Data Observability */}
              {adminData?.storageStats && (
                <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Server className="w-4 h-4 text-teal-400" />
                      Veri Depolama & Disk Analizi
                    </h3>
                    <span className="text-xs font-mono font-bold text-teal-300">
                      Toplam: {(adminData.storageStats.totalBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {adminData.storageStats.files.slice(0, 8).map((f) => (
                      <div key={f.name} className="p-2.5 rounded-xl bg-black/25 border border-white/5 flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono text-white/75 truncate">{f.name}</span>
                        <span className="font-mono text-amber-300 shrink-0">{(f.bytes / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DEDICATED SERVERS MONITOR */}
          {activeTab === 'dedicated' && (
            <div className="space-y-6">
              {/* Summary Header Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Açılmış Dedicated Sunucular</span>
                    <Globe className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {adminData?.dedicatedServers?.length || 0}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-medium">
                    {adminData?.dedicatedServers?.filter(s => s.status === 'online').length || 0} Aktif Çevrimiçi
                  </div>
                </div>

                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Toplam Dedicated Kullanıcı</span>
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {adminData?.dedicatedServers?.reduce((acc, s) => acc + (s.status === 'online' ? s.onlineCount : 0), 0) || 0}
                  </div>
                  <div className="text-[11px] text-white/40">Bağlı Canlı Katılımcı</div>
                </div>

                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Toplam Slot Lisansı</span>
                    <HardDrive className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {adminData?.dedicatedServers?.reduce((acc, s) => acc + s.maxSlots, 0) || 0} Slot
                  </div>
                  <div className="text-[11px] text-amber-400 font-medium">Kriptografik İmzalı</div>
                </div>

                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Lisans Doğrulama Motoru</span>
                    <Key className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-400">
                    HMAC-SHA256
                  </div>
                  <div className="text-[11px] text-white/40">Resmi İstemci Korumalı</div>
                </div>
              </div>

              {/* Dedicated Server List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    Canlı Sinyal Veren Dedicated Sunucu Listesi ({adminData?.dedicatedServers?.length || 0})
                  </h3>
                  <span className="text-[11px] text-white/40">
                    Sinyaller 4 saniyede bir otomatik güncellenir
                  </span>
                </div>

                {(!adminData?.dedicatedServers || adminData.dedicatedServers.length === 0) ? (
                  <div className="p-10 rounded-2xl ios-glass-card border border-white/10 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/40">
                      <Globe className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold text-white">Henüz Açılmış Dedicated Sunucu Bulunmuyor</div>
                    <p className="text-xs text-white/50 max-w-md mx-auto">
                      Kullanıcılar veya müşteriler <code className="text-amber-300 bg-white/10 px-1 py-0.5 rounded">dedicated-server\start-dedicated-server.bat</code> dosyasını kendi VPS veya bilgisayarlarında çalıştırdığında anında bu ekranda canlı olarak belirecektir.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {adminData.dedicatedServers.map((srv) => {
                      const isOnline = srv.status === 'online';
                      const isRevoked = srv.status === 'revoked';
                      const percentage = Math.min(100, Math.round((srv.onlineCount / (srv.maxSlots || 1)) * 100));

                      return (
                        <div
                          key={srv.id}
                          className={`p-4 rounded-2xl border transition-all ${
                            isRevoked
                              ? 'bg-rose-500/10 border-rose-500/30 opacity-80'
                              : isOnline
                              ? 'ios-glass-card border-emerald-500/30 bg-emerald-500/[0.03]'
                              : 'bg-white/[0.02] border-white/10 opacity-70'
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            {/* Server Info */}
                            <div className="flex items-start gap-3.5">
                              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
                                isRevoked
                                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                                  : isOnline
                                  ? 'bg-gradient-to-tr from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25'
                                  : 'bg-white/10 text-white/40'
                              }`}>
                                {isRevoked ? '⛔' : '🛡️'}
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-white">{srv.serverName}</span>
                                  {isRevoked ? (
                                    <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30 flex items-center gap-1">
                                      <Ban className="w-3 h-3" />
                                      LİSANS İPTAL / KAPATILDI
                                    </span>
                                  ) : isOnline ? (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                      ÇEVRİMİÇİ
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                      ÇEVRİMDAŞI
                                    </span>
                                  )}
                                  <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-semibold border border-purple-500/30">
                                    {srv.tier} Paket
                                  </span>
                                </div>

                                <div className="text-xs text-white/60 flex items-center gap-2 flex-wrap">
                                  <span>Lisans Sahibi: <b className="text-white/80">{srv.licensee}</b></span>
                                  <span>•</span>
                                  <span className="font-mono bg-white/5 px-2 py-0.5 rounded-md border border-white/10 text-white/90">
                                    {srv.host}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyHost(srv.host, srv.id)}
                                    className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
                                    title="IP/Port Kopyala"
                                  >
                                    {copiedServerId === srv.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>

                                <div className="text-[11px] text-white/40 flex items-center gap-3 pt-0.5">
                                  <span>Kanallar: <b>{srv.channelsCount}</b></span>
                                  <span>•</span>
                                  <span>Çalışma Süresi: <b>{formatUptime(srv.uptimeSeconds)}</b></span>
                                  <span>•</span>
                                  <span>Son Sinyal: <b>{new Date(srv.lastHeartbeat).toLocaleTimeString('tr-TR')}</b></span>
                                </div>
                              </div>
                            </div>

                            {/* Slot Capacity & Action */}
                            <div className="flex items-center gap-4 shrink-0">
                              <div className="w-36 space-y-1.5">
                                <div className="flex justify-between text-xs">
                                  <span className="text-white/50 text-[11px]">Kapasite</span>
                                  <span className="font-bold text-white text-xs">
                                    {srv.onlineCount} / {srv.maxSlots} Slot
                                  </span>
                                </div>
                                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      percentage > 85 ? 'bg-red-500' : percentage > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.max(4, percentage)}%` }}
                                  />
                                </div>
                              </div>

                              {!isRevoked && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    connectToDedicatedServer(srv.host);
                                    onClose();
                                  }}
                                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Sunucuya Bağlan
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick System Status & Actions */}
              <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    Sistem Durumu & Hızlı İşlemler
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('system')}
                    className="text-[11px] font-semibold text-amber-300 hover:underline"
                  >
                    Ayarları Düzenle →
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase">Üye Kaydı</div>
                    <div className={`font-bold mt-0.5 ${sysRegEnabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {sysRegEnabled ? 'Açık' : 'Kapalı'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase">Bakım Modu</div>
                    <div className={`font-bold mt-0.5 ${sysMaintenance ? 'text-amber-400' : 'text-white/70'}`}>
                      {sysMaintenance ? 'Aktif' : 'Normal'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase">Benzersiz IP</div>
                    <div className="font-bold text-teal-300 mt-0.5">
                      {new Set((adminData?.connectionLogs || []).map((c) => c.ip)).size} IP
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase">Mesaj Limiti</div>
                    <div className="font-bold text-white mt-0.5">{sysMaxMsgLen} krk</div>
                  </div>
                </div>
              </div>

              {/* Storage & Data Observability */}
              {adminData?.storageStats && (
                <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Server className="w-4 h-4 text-teal-400" />
                      Veri Depolama & Disk Analizi
                    </h3>
                    <span className="text-xs font-mono font-bold text-teal-300">
                      Toplam: {(adminData.storageStats.totalBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {adminData.storageStats.files.slice(0, 8).map((f) => (
                      <div key={f.name} className="p-2.5 rounded-xl bg-black/25 border border-white/5 flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono text-white/75 truncate">{f.name}</span>
                        <span className="font-mono text-amber-300 shrink-0">{(f.bytes / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: USER MANAGEMENT */}
          {activeTab === 'users' && (() => {
            const allUsers = adminData?.registeredUsers || [];
            const filteredUsers = allUsers.filter((u) => {
              const isOnline = onlineUsers.some((o) => o.username.toLowerCase() === u.username.toLowerCase());
              if (userFilter === 'online' && !isOnline) return false;
              if (userFilter === 'banned' && !u.isBanned) return false;
              if (userFilter === 'admin' && u.role !== 'admin') return false;
              if (userSearchQuery.trim()) {
                const q = userSearchQuery.toLowerCase();
                return u.username.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
              }
              return true;
            });

            return (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Kayıtlı Kullanıcı Hesapları ({filteredUsers.length} / {allUsers.length})
                  </h3>
                  <span className="text-[11px] text-white/40">Yetki, bakiye, şifre sıfırlama ve yasaklama yönetimi</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="Kullanıcı veya e-posta ara..."
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-amber-500 w-48"
                    />
                  </div>
                  <div className="flex bg-white/5 p-0.5 rounded-xl border border-white/10 text-[11px]">
                    {[
                      { id: 'all', label: 'Tümü' },
                      { id: 'online', label: 'Çevrimiçi' },
                      { id: 'admin', label: 'Admin' },
                      { id: 'banned', label: 'Yasaklı' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setUserFilter(f.id as any)}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                          userFilter === f.id ? 'bg-amber-500 text-black' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-x-auto bg-white/[0.02]">
                <table className="w-full text-left text-xs text-white/80">
                  <thead className="bg-white/5 text-[11px] font-semibold text-white/40 uppercase border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3">Kullanıcı</th>
                      <th className="px-4 py-3">E-Posta</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">Bakiye</th>
                      <th className="px-4 py-3">Durum</th>
                      <th className="px-4 py-3 text-right">Kontroller</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredUsers.map((u) => {
                      const onlineUser = onlineUsers.find((o) => o.username.toLowerCase() === u.username.toLowerCase());
                      const isOnline = !!onlineUser;

                      return (
                        <tr key={u.id} className={`hover:bg-white/[0.03] transition ${u.isBanned ? 'bg-rose-500/[0.04]' : ''}`}>
                          <td className="px-4 py-3 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                              <AvatarView avatar={u.avatar} alt={u.username} fallback="👤" className="w-full h-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                <span className="truncate">{u.username}</span>
                                {u.isBanned && (
                                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-bold shrink-0">
                                    YASAKLI
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-white/35">Kayıt: {u.createdAt || '-'}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-white/50">{u.email}</td>
                          <td className="px-4 py-3">
                            {u.role === 'admin' ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30">
                                YÖNETİCİ
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 font-medium text-[10px]">
                                KULLANICI
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-emerald-400">₺{u.walletBalance ?? 0}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setInspectedUsername((prev) =>
                                    prev?.toLowerCase() === u.username.toLowerCase() ? null : u.username
                                  )
                                }
                                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition border flex items-center gap-1 ${
                                  inspectedUsername?.toLowerCase() === u.username.toLowerCase()
                                    ? 'bg-teal-500/25 border-teal-400/50 text-teal-200'
                                    : 'bg-white/5 hover:bg-white/15 border-white/10 text-white/75'
                                }`}
                                title="Kullanıcının IP ve Bağlantı Geçmişini Gör"
                              >
                                <Globe className="w-3 h-3" />
                                IP ({(adminData?.connectionLogs || []).filter((c) => c.username.toLowerCase() === u.username.toLowerCase()).length})
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const val = prompt(`${u.username} için yeni cüzdan bakiyesi (₺):`, String(u.walletBalance ?? 0));
                                  if (val !== null && val.trim() !== '' && !isNaN(Number(val))) {
                                    adminUpdateWallet(u.username, Number(val), 'set');
                                  }
                                }}
                                className="px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold transition"
                                title="Bakiyeyi Düzenle"
                              >
                                Düzenle
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] ${isOnline ? 'text-emerald-400' : 'text-white/30'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-white/30'}`} />
                              {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {u.role === 'admin' ? (
                                <button
                                  onClick={() => adminChangeRole(u.username, 'user')}
                                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-medium transition"
                                >
                                  Standart Yap
                                </button>
                              ) : (
                                <button
                                  onClick={() => adminChangeRole(u.username, 'admin')}
                                  className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black text-[10px] font-bold transition border border-amber-500/30"
                                >
                                  Yönetici Yap
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  setInspectedUsername((prev) =>
                                    prev?.toLowerCase() === u.username.toLowerCase() ? null : u.username
                                  )
                                }
                                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition border flex items-center gap-1 ${
                                  inspectedUsername?.toLowerCase() === u.username.toLowerCase()
                                    ? 'bg-teal-500/25 border-teal-400/50 text-teal-200'
                                    : 'bg-white/5 hover:bg-white/15 border-white/10 text-white/75'
                                }`}
                                title="Kullanıcının IP ve Bağlantı Geçmişini Gör"
                              >
                                <Globe className="w-3 h-3" />
                                IP ({(adminData?.connectionLogs || []).filter((c) => c.username.toLowerCase() === u.username.toLowerCase()).length})
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const newPass = prompt(`${u.username} için yeni şifre (en az 6 karakter):`);
                                  if (newPass && newPass.length >= 6) {
                                    adminResetUserPassword(u.username, newPass);
                                  } else if (newPass !== null) {
                                    alert('Şifre en az 6 karakter olmalıdır.');
                                  }
                                }}
                                className="px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-semibold transition border border-indigo-500/20"
                                title="Şifre Sıfırla"
                              >
                                Şifre
                              </button>

                              {u.twoFactorEnabled && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`${u.username} kullanıcısının 2FA korumasını sıfırlamak istediğinize emin misiniz?`)) {
                                      adminResetUser2fa(u.username);
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold transition border border-amber-500/20"
                                  title="2FA Sıfırla"
                                >
                                  2FA Sıfırla
                                </button>
                              )}

                              {u.isBanned ? (
                                <button
                                  type="button"
                                  onClick={() => adminUnbanUser(u.username)}
                                  className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold transition border border-emerald-500/30"
                                >
                                  Yasağı Kaldır
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const reason = prompt(`${u.username} hesabını yasaklama sebebi:`, 'Kural ihlali');
                                    if (reason === null) return;
                                    const minsRaw = prompt('Yasaklama süresi (dakika, 0 = Kalıcı, 60 = 1 saat, 1440 = 1 gün):', '0');
                                    if (minsRaw === null) return;
                                    const mins = Math.max(0, Number(minsRaw) || 0);
                                    adminBanUser(u.username, reason || 'Kural ihlali', mins);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white text-[10px] font-bold transition border border-rose-500/30"
                                >
                                  Yasakla
                                </button>
                              )}

                              {isOnline && onlineUser && (
                                <button
                                  onClick={() => {
                                    const reason = prompt(`${u.username} kullanıcısını sunucudan atma sebebi:`, 'Kural ihlali');
                                    if (reason) adminKickUser(onlineUser.id, reason);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-[10px] font-medium transition"
                                  title="Anlık Bağlantıyı Kes"
                                >
                                  At
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

              {/* Per-User Connection & IP History Inspector */}
              {inspectedUsername && (() => {
                const userLogs = (adminData?.connectionLogs || []).filter(
                  (c) => c.username.toLowerCase() === inspectedUsername.toLowerCase()
                );
                return (
                  <div className="p-4 rounded-2xl ios-glass-card border border-teal-400/30 space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-teal-400" />
                          <span>{inspectedUsername} — IP & Bağlantı Geçmişi ({userLogs.length})</span>
                        </h4>
                        <p className="text-[11px] text-white/45">
                          Son bağlantılar, cihaz bilgisi ve IP adresleri
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {userLogs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Tüm bağlantı ve IP geçmişini temizlemek istediğinize emin misiniz?')) {
                                adminClearConnectionLogs();
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30 text-[10px] font-semibold transition"
                          >
                            Tüm Logları Temizle
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setInspectedUsername(null)}
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {userLogs.length === 0 ? (
                      <div className="text-xs text-white/40 py-2">
                        Bu kullanıcıya ait kayıtlı bağlantı geçmişi bulunamadı.
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                        {userLogs.slice(0, 25).map((log) => (
                          <div
                            key={log.id}
                            className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  log.status === 'online' ? 'bg-emerald-400' : 'bg-white/25'
                                }`}
                              />
                              <span className="font-mono font-bold text-amber-300 shrink-0">{log.ip}</span>
                              <span className="text-white/50 truncate" title={log.userAgent}>
                                {log.userAgent || 'Bilinmeyen Cihaz'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-white/45 shrink-0 font-mono">
                              <span>Giriş: {log.connectedAt}</span>
                              {log.disconnectedAt && <span>Çıkış: {log.disconnectedAt}</span>}
                              <button
                                type="button"
                                onClick={() => {
                                  const reason = prompt(`${log.ip} IP adresini engelleme sebebi:`, `${inspectedUsername} üzerinden engellendi`);
                                  if (reason !== null) adminBanIp(log.ip, reason || 'Yönetici engeli', 0);
                                }}
                                className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white font-sans font-semibold transition"
                              >
                                IP Engelle
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Live Active Sessions Explorer */}
              <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                      Canlı Oturum Gezgini ({adminData?.activeSessions?.length || 0})
                    </h4>
                    <p className="text-[11px] text-white/45">Şu anda sunucuya bağlı tüm aktif soket oturumları</p>
                  </div>
                </div>
                {(adminData?.activeSessions || []).length === 0 ? (
                  <div className="text-xs text-white/40 py-2">Aktif oturum bulunmuyor.</div>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {(adminData?.activeSessions || []).map((sess) => (
                      <div key={sess.socketId} className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          <span className="font-bold text-white shrink-0">{sess.username}</span>
                          <span className="font-mono text-amber-300 shrink-0">{sess.ip}</span>
                          <span className="text-white/45 truncate" title={sess.userAgent}>{sess.userAgent}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-white/40">
                            {new Date(sess.connectedAt).toLocaleTimeString('tr-TR')}
                          </span>
                          <button
                            type="button"
                            onClick={() => adminKickUser(sess.socketId, 'Yönetici tarafından oturum sonlandırıldı.')}
                            className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white text-[10px] font-semibold transition"
                          >
                            Oturumu Kapat
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {/* TAB 4: DEDICATED SERVER LICENSE GENERATOR & TRACKER */}
          {activeTab === 'licenses' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-400" />
                  Özel Sunucu (Dedicated Server) Lisans Üreticisi & Takip Merkezi
                </h3>
                <p className="text-xs text-white/50 mt-1">
                  Kendi sunucusunu kurmak isteyen kullanıcılar için şifreli, imzalı dijital lisans anahtarları üretin, kayıtlı kullanıcılarla ilişkilendirin veya durumlarını yönetin.
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
                      <option value="Enterprise">Enterprise (Özel SLA & Maksimum Hat)</option>
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
                      Lisans Başarıyla Üretildi & İmzalandı!
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
                        onClick={handleCopyLicense}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-sans text-xs flex items-center gap-1.5 shrink-0 transition"
                      >
                        {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey ? 'Kopyalandı' : 'Kopyala'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] text-xs text-white/70 space-y-1 border border-white/5">
                    <div><b>Müşteri:</b> {generatedLicense.licensee}</div>
                    {generatedLicense.assignedUsername && (
                      <div><b>İlişkili Kullanıcı:</b> @{generatedLicense.assignedUsername}</div>
                    )}
                    <div><b>Kapasite:</b> {generatedLicense.maxSlots} Slot ({generatedLicense.tier})</div>
                    <div><b>Bitiş Tarihi:</b> {generatedLicense.expiresAt.startsWith('2099') ? 'Ömür Boyu (Lifetime)' : new Date(generatedLicense.expiresAt).toLocaleDateString('tr-TR')}</div>
                    <div className="text-[11px] text-amber-300/80 pt-1">
                      ℹ️ Müşteri bu anahtarı indirdiği sunucu klasöründeki <code>server.config.json</code> dosyasındaki <code>licenseKey</code> alanına yapıştıracaktır.
                    </div>
                  </div>
                </div>
              )}

              {/* ISSUED LICENSES TRACKING TABLE */}
              <div className="space-y-3 pt-6 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-400" />
                      Kayıtlı Lisanslar & Kullanıcı Takip Tablosu ({adminData?.issuedLicenses?.length || 0})
                    </h4>
                  </div>
                  <span className="text-[11px] text-white/40">
                    Sistemde üretilen veya mağazadan alınan tüm lisanslar
                  </span>
                </div>

                {(!adminData?.issuedLicenses || adminData.issuedLicenses.length === 0) ? (
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
                          const activeServer = dedicatedList.find(
                            (s) => s.licenseKey === lic.licenseKey
                          );

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
                              <td className="py-2.5 px-3 font-semibold text-white">
                                {lic.licensee}
                              </td>
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
                                    onClick={() => {
                                      navigator.clipboard.writeText(lic.licenseKey);
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
                                      onClick={() => adminActivateLicense(lic.id)}
                                      className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 text-[10px] font-semibold transition"
                                    >
                                      {lic.status === 'pending_payment' ? 'Onayla & Aktifleştir' : 'Aktifleştir'}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        if (confirm(`"${lic.licensee}" lisansını iptal etmek istediğinize emin misiniz? Sunucu anında devre dışı kalacaktır.`)) {
                                          adminRevokeLicense(lic.id, 'Yönetici tarafından askıya alındı');
                                        }
                                      }}
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
                        <p className="text-xs text-white/50">{extendingLicense.licensee} ({extendingLicense.tier})</p>
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
                          { days: -1, label: '♾️ Ömür Boyu' }
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
                          adminExtendLicense(extendingLicense.id, extendDays);
                          setExtendSuccessMsg(`Süre başarıyla ${extendDays === -1 ? 'Ömür Boyu yapıldı' : extendDays + ' gün uzatıldı'}!`);
                          setTimeout(() => {
                            setExtendingLicense(null);
                            setExtendSuccessMsg('');
                          }, 1200);
                        }}
                        className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold transition shadow-lg shadow-blue-500/30 flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Süreyi Uzat & Onayla
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: STORE MANAGEMENT (MAĞAZA YÖNETİMİ) */}
          {activeTab === 'store' && (
            <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-amber-400" />
                    Lisans Mağazası & Fiyatlandırma Yönetimi
                  </h3>
                  <p className="text-xs text-white/50 mt-1">
                    Mağazayı satışa açıp kapatabilir, paket fiyatlarını, slot limitlerini, indirim oranlarını ve ödeme yöntemlerini yönetebilirsiniz.
                  </p>
                </div>

                {storeSavedNotice ? (
                  <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20">
                    <Check className="w-4 h-4 text-emerald-400" />
                    Ayarlar Başarıyla Kaydedildi!
                  </div>
                ) : isStoreDirty ? (
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-bold">
                      Kaydedilmemiş Değişiklikler
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const s = adminData?.storeSettings || storeSettings;
                        if (s) syncStoreFormFromServer(s);
                        setIsStoreDirty(false);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-[11px] font-semibold transition"
                    >
                      Sıfırla
                    </button>
                  </div>
                ) : null}
              </div>

              <form onSubmit={handleSaveStoreSettings} onChange={() => setIsStoreDirty(true)} className="space-y-6">
                {/* 1. STORE OPEN/CLOSED MASTER SWITCH */}
                <div className={`p-5 rounded-3xl border transition ${
                  storeIsOpen
                    ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10'
                    : 'bg-rose-500/10 border-rose-500/30 shadow-lg shadow-rose-500/10'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        storeIsOpen ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white'
                      }`}>
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                          <span>Mağaza Satış Durumu:</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                            storeIsOpen ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {storeIsOpen ? '🟢 SATIŞLAR AÇIK (AKTİF)' : '🔴 SATIŞA KAPALI (BAKIM MODU)'}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/50 mt-0.5">
                          {storeIsOpen
                            ? 'Kullanıcılar mağazadan dedicated server lisansı satın alabilir.'
                            : 'Satışlar durdurulur, kullanıcılar yeni lisans alamaz ancak mevcut lisanslarını görüntüleyebilir.'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setStoreIsOpen(!storeIsOpen);
                        setIsStoreDirty(true);
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm shrink-0 ${
                        storeIsOpen
                          ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40'
                          : 'bg-emerald-500 text-black hover:bg-emerald-400'
                      }`}
                    >
                      {storeIsOpen ? 'Satışları Durdur (Kapat)' : 'Satışa Aç (Aktifleştir)'}
                    </button>
                  </div>

                  {!storeIsOpen && (
                    <div className="mt-4 pt-4 border-t border-rose-500/20">
                      <label className="block text-[11px] font-semibold text-rose-300 uppercase mb-1">
                        Kullanıcılara Gösterilecek Bakım / Kapalı Mesajı
                      </label>
                      <input
                        type="text"
                        value={storeClosedReason}
                        onChange={(e) => setStoreClosedReason(e.target.value)}
                        placeholder="Örn: Mağazamız planlı bakım çalışması nedeniyle geçici olarak hizmete kapalıdır."
                        className="w-full bg-black/40 border border-rose-500/30 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/30"
                      />
                    </div>
                  )}
                </div>

                {/* 2. PACKAGES & PRICING */}
                <div className="p-6 rounded-3xl ios-glass-card border border-white/10 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Tag className="w-4 h-4 text-amber-400" />
                      Paket Fiyatlandırması ve Slot Ayarları
                    </h4>
                    <span className="text-[11px] text-white/40">Para Birimi: ₺ Türk Lirası</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Starter Tier */}
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">Starter (Başlangıç)</span>
                        <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={starterEnabled}
                            onChange={(e) => setStarterEnabled(e.target.checked)}
                            className="rounded bg-white/10 border-white/20 text-amber-500 focus:ring-0"
                          />
                          Satışta
                        </label>
                      </div>

                      <div>
                        <label className="block text-[10px] text-white/40 uppercase mb-1">Aylık Fiyat (₺)</label>
                        <input
                          type="number"
                          min="1"
                          value={starterPrice}
                          onChange={(e) => setStarterPrice(Number(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-white/40 uppercase mb-1">Varsayılan Slot</label>
                        <input
                          type="number"
                          min="4"
                          value={starterSlots}
                          onChange={(e) => setStarterSlots(Number(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    {/* Pro Tier */}
                    <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-300">Klan Pro (Önerilen)</span>
                        <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={proEnabled}
                            onChange={(e) => setProEnabled(e.target.checked)}
                            className="rounded bg-white/10 border-white/20 text-amber-500 focus:ring-0"
                          />
                          Satışta
                        </label>
                      </div>

                      <div>
                        <label className="block text-[10px] text-white/40 uppercase mb-1">Aylık Fiyat (₺)</label>
                        <input
                          type="number"
                          min="1"
                          value={proPrice}
                          onChange={(e) => setProPrice(Number(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-white/40 uppercase mb-1">Varsayılan Slot</label>
                        <input
                          type="number"
                          min="4"
                          value={proSlots}
                          onChange={(e) => setProSlots(Number(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    {/* Enterprise Tier */}
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-300">Enterprise (Büyük)</span>
                        <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enterpriseEnabled}
                            onChange={(e) => setEnterpriseEnabled(e.target.checked)}
                            className="rounded bg-white/10 border-white/20 text-amber-500 focus:ring-0"
                          />
                          Satışta
                        </label>
                      </div>

                      <div>
                        <label className="block text-[10px] text-white/40 uppercase mb-1">Aylık Fiyat (₺)</label>
                        <input
                          type="number"
                          min="1"
                          value={enterprisePrice}
                          onChange={(e) => setEnterprisePrice(Number(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-white/40 uppercase mb-1">Varsayılan Slot</label>
                        <input
                          type="number"
                          min="4"
                          value={enterpriseSlots}
                          onChange={(e) => setEnterpriseSlots(Number(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Custom Slot Unit Price */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
                    <div>
                      <div className="text-xs font-semibold text-white">Özel Konfigüratör Slot Başına Taban Fiyat</div>
                      <div className="text-[10px] text-white/40">Kullanıcı kendi slot sayısını belirlerken 1 slot için hesaplanacak birim ücret</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-300 font-mono">₺</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={customSlotUnitPrice}
                        onChange={(e) => setCustomSlotUnitPrice(Number(e.target.value))}
                        className="w-20 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-white text-xs font-mono font-bold text-center outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="text-[11px] text-white/40">/ slot</span>
                    </div>
                  </div>

                  {/* Annual & Duration Multipliers + Store Policies */}
                  <div className="pt-3 border-t border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-white">Süre & Yıllık Fiyatlandırma Çarpanları</div>
                        <div className="text-[10px] text-white/45">
                          Aylık paket fiyatı × çarpan = dönem toplam fiyatı (örn. Yıllık 8x = 4 ay ücretsiz!)
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-black/25 border border-white/5">
                        <label className="block text-[10px] text-white/50 mb-1">3 Aylık (90 Gün)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="20"
                          value={mult90}
                          onChange={(e) => setMult90(Number(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                      <div className="p-3 rounded-xl bg-black/25 border border-white/5">
                        <label className="block text-[10px] text-white/50 mb-1">6 Aylık (180 Gün)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="30"
                          value={mult180}
                          onChange={(e) => setMult180(Number(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
                        <label className="block text-[10px] text-amber-300 font-bold mb-1">1 Yıllık (365 Gün)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="50"
                          value={mult365}
                          onChange={(e) => setMult365(Number(e.target.value))}
                          className="w-full bg-black/30 border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-amber-200 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <div className="text-[9px] text-amber-300/70 mt-1">
                          Pro Yıllık: ₺{Math.round(proPrice * (mult365 || 8))}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-black/25 border border-white/5">
                        <label className="block text-[10px] text-white/50 mb-1">Ömür Boyu (Lifetime)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          max="100"
                          value={multLifetime}
                          onChange={(e) => setMultLifetime(Number(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <label className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5 cursor-pointer">
                        <div>
                          <div className="text-xs font-semibold text-white">Ömür Boyu (Lifetime) Satışı</div>
                          <div className="text-[10px] text-white/40">Kapatıldığında mağazada yalnızca süreli planlar görünür</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={allowLifetimePurchase}
                          onChange={(e) => setAllowLifetimePurchase(e.target.checked)}
                          className="rounded border-white/20 bg-black/40 text-amber-500"
                        />
                      </label>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                        <div>
                          <div className="text-xs font-semibold text-white">Lisans Uzatma İndirimi (%)</div>
                          <div className="text-[10px] text-white/40">Mevcut lisansını yenileyenlere ek indirim</div>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max="75"
                          value={renewalDiscountPercentage}
                          onChange={(e) => setRenewalDiscountPercentage(Number(e.target.value))}
                          className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs font-mono font-bold text-center outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. CAMPAIGN & DISCOUNT MODULE */}
                <div className="p-6 rounded-3xl ios-glass-card border border-white/10 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Percent className="w-4 h-4 text-emerald-400" />
                      Kampanya, İndirim & Duyuru Bannerı
                    </h4>
                    {discountPercentage > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                        %{discountPercentage} AKTİF İNDİRİM
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    <div>
                      <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                        Genel İndirim Oranı (% 0 - 90)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="90"
                          value={discountPercentage}
                          onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                          className="w-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="text-xs text-white/50">% İndirim</span>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                        Mağazada Gözükecek Kampanya Banner Metni
                      </label>
                      <input
                        type="text"
                        value={campaignBanner}
                        onChange={(e) => setCampaignBanner(e.target.value)}
                        placeholder="Örn: 🔥 Lansmana Özel Tüm Dedicated Lisanslarda %15 İndirim!"
                        className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-white/20"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. PAYMENT METHODS CONFIGURATION */}
                <div className="p-6 rounded-3xl ios-glass-card border border-white/10 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-cyan-400" />
                      Aktif Ödeme Yöntemleri
                    </h4>
                    <span className="text-[11px] text-white/40">Kullanıcıların ödeme yapabileceği kanallar</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: 'wallet',
                        title: 'Cüzdan Bakiyesi',
                        enabled: payWallet,
                        setEnabled: setPayWallet,
                        desc: payWalletDesc,
                        setDesc: setPayWalletDesc,
                        icon: <Wallet className="w-4 h-4" />,
                        iconBg: 'bg-blue-500/20 text-blue-400',
                      },
                      {
                        id: 'credit_card',
                        title: 'Kredi / Banka Kartı',
                        enabled: payCard,
                        setEnabled: setPayCard,
                        desc: payCardDesc,
                        setDesc: setPayCardDesc,
                        icon: <CreditCard className="w-4 h-4" />,
                        iconBg: 'bg-emerald-500/20 text-emerald-400',
                      },
                      {
                        id: 'bank_transfer',
                        title: 'Havale / FAST / EFT',
                        enabled: payBank,
                        setEnabled: setPayBank,
                        desc: payBankDesc,
                        setDesc: setPayBankDesc,
                        icon: <Building2 className="w-4 h-4" />,
                        iconBg: 'bg-purple-500/20 text-purple-400',
                      },
                      {
                        id: 'crypto',
                        title: 'Kripto Para (USDT/BTC)',
                        enabled: payCrypto,
                        setEnabled: setPayCrypto,
                        desc: payCryptoDesc,
                        setDesc: setPayCryptoDesc,
                        icon: <Coins className="w-4 h-4" />,
                        iconBg: 'bg-amber-500/20 text-amber-400',
                      },
                    ].map((pm) => (
                      <div
                        key={pm.id}
                        className={`p-3.5 rounded-2xl border transition space-y-2.5 ${
                          pm.enabled
                            ? 'bg-white/[0.04] border-emerald-500/30'
                            : 'bg-black/25 border-white/5 opacity-75'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${pm.iconBg}`}>
                              {pm.icon}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white">{pm.title}</div>
                              <div className={`text-[10px] font-semibold ${pm.enabled ? 'text-emerald-400' : 'text-white/40'}`}>
                                {pm.enabled ? 'Aktif (Kullanıcılar seçebilir)' : 'Devre Dışı'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={pm.enabled}
                            onClick={() => {
                              pm.setEnabled(!pm.enabled);
                              setIsStoreDirty(true);
                            }}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                              pm.enabled ? 'bg-emerald-500' : 'bg-white/15'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                                pm.enabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={pm.desc}
                          onChange={(e) => {
                            pm.setDesc(e.target.value);
                            setIsStoreDirty(true);
                          }}
                          placeholder="Kullanıcıya gösterilecek açıklama / IBAN / cüzdan..."
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* SAVE BUTTON */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-black font-bold text-xs rounded-2xl transition shadow-xl shadow-amber-500/25 flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Mağaza Ayarlarını Kaydet & Canlıya Al
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 6: SERVERS & CHANNELS */}
          {activeTab === 'servers' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Aktif Sunucu ve Kanal Mimarisi ({adminData?.servers.length || 0} Sunucu)
                </h3>
                <span className="text-[11px] text-white/40">Doğrudan kanal ekleyin, silin veya sunucuları yönetin</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {adminData?.servers.map((s) => {
                  const chForm = newChannelInputs[s.id] || { name: '', type: 'text' as const };
                  return (
                  <div key={s.id} className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{s.icon || '💬'}</span>
                        <div>
                          <div className="font-bold text-white text-sm">{s.name}</div>
                          <div className="text-[10px] text-white/40 font-mono">
                            ID: {s.id} · {s.members?.length || 0} Üye
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-white/5 px-2 py-0.5 rounded text-white/60">
                          {s.channels.length} Kanal
                        </span>
                        {s.id !== 'default-server' && s.id !== 'direct-messages' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`"${s.name}" sunucusunu kalıcı olarak silmek istediğinize emin misiniz?`)) {
                                adminDeleteServer(s.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white transition"
                            title="Sunucuyu Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1 max-h-48 overflow-y-auto pr-1">
                      {s.channels.map((c) => (
                        <div key={c.id} className="p-2 rounded-xl bg-white/5 hover:bg-white/[0.08] flex items-center justify-between text-xs transition">
                          <div className="flex items-center gap-2">
                            {c.type === 'voice' ? (
                              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Hash className="w-3.5 h-3.5 text-blue-400" />
                            )}
                            <span className="text-white/80 font-medium">{c.name}</span>
                            {c.slowmodeSeconds && c.slowmodeSeconds > 0 ? (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                                {c.slowmodeSeconds}s
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1">
                            {c.type === 'text' && (
                              <button
                                type="button"
                                onClick={() => {
                                  const raw = prompt(`#${c.name} kanalında kaç son mesaj silinsin? (Tümünü silmek için 0 yazın):`, '50');
                                  if (raw === null) return;
                                  const num = Number(raw);
                                  if (num === 0) {
                                    if (confirm(`#${c.name} kanalındaki TÜM mesajları silmek istediğinize emin misiniz?`)) {
                                      adminPurgeMessages(c.id, 'all');
                                    }
                                  } else if (num > 0) {
                                    adminPurgeMessages(c.id, 'last_n', num);
                                  }
                                }}
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/15 transition"
                                title="Kanal Mesajlarını Temizle"
                              >
                                Temizle
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm(`"${c.name}" kanalını silmek istediğinize emin misiniz?`)) {
                                  adminDeleteChannel(s.id, c.id);
                                }
                              }}
                              className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition"
                              title="Kanalı Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Quick Add Channel */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!chForm.name.trim()) return;
                        adminCreateChannel(s.id, chForm.name.trim(), chForm.type);
                        setNewChannelInputs((prev) => ({ ...prev, [s.id]: { name: '', type: chForm.type } }));
                      }}
                      className="pt-2 border-t border-white/10 flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={chForm.name}
                        onChange={(e) =>
                          setNewChannelInputs((prev) => ({
                            ...prev,
                            [s.id]: { ...chForm, name: e.target.value },
                          }))
                        }
                        placeholder="Yeni kanal adı..."
                        className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <select
                        value={chForm.type}
                        onChange={(e) =>
                          setNewChannelInputs((prev) => ({
                            ...prev,
                            [s.id]: { ...chForm, type: e.target.value as 'text' | 'voice' },
                          }))
                        }
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                      >
                        <option value="text">Metin</option>
                        <option value="voice">Ses</option>
                      </select>
                      <button
                        type="submit"
                        disabled={!chForm.name.trim()}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition disabled:opacity-40"
                      >
                        Ekle
                      </button>
                    </form>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 7: AUDIT LOGS */}
          {activeTab === 'logs' && (() => {
            const allLogs = adminData?.auditLogs || [];
            const filteredLogs = allLogs.filter((log) => {
              if (logTypeFilter === 'security') {
                const act = (log.action || '').toUpperCase();
                const isSec = act.includes('GUVENLIK') || act.includes('YASAK') || act.includes('IP_') || act.includes('2FA') || log.type === 'auth';
                if (!isSec) return false;
              } else if (logTypeFilter !== 'all' && log.type !== logTypeFilter) {
                return false;
              }
              if (logSearchQuery.trim()) {
                const q = logSearchQuery.toLowerCase();
                return log.action.toLowerCase().includes(q) || log.details.toLowerCase().includes(q);
              }
              return true;
            });

            return (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Sistem & Güvenlik Denetim Günlüğü ({filteredLogs.length} / {allLogs.length})
                  </h3>
                  <span className="text-[11px] text-white/40">Anlık olarak Socket üzerinden yayınlanır</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={logSearchQuery}
                      onChange={(e) => setLogSearchQuery(e.target.value)}
                      placeholder="Loglarda ara..."
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-amber-500 w-44"
                    />
                  </div>
                  <div className="flex bg-white/5 p-0.5 rounded-xl border border-white/10 text-[11px]">
                    {[
                      { id: 'all', label: 'Tümü' },
                      { id: 'security', label: 'Güvenlik' },
                      { id: 'info', label: 'Bilgi' },
                      { id: 'warn', label: 'Uyarı' },
                      { id: 'auth', label: 'Yetki' },
                      { id: 'voice', label: 'Ses' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setLogTypeFilter(t.id as any)}
                        className={`px-2 py-1 rounded-lg font-semibold transition ${
                          logTypeFilter === t.id ? 'bg-amber-500 text-black' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      exportJsonFile(`cakma-audit-logs-${new Date().toISOString().slice(0, 10)}.json`, filteredLogs)
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-[11px] font-bold transition flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-400" />
                    JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Tüm denetim günlüklerini temizlemek istediğinize emin misiniz?')) {
                        adminClearAuditLogs();
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30 text-[11px] font-bold transition flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Temizle
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-hidden bg-black/40 p-3 space-y-2 font-mono text-xs max-h-[430px] overflow-y-auto">
                {filteredLogs.map((log) => {
                  let badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
                  if (log.type === 'warn') badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                  if (log.type === 'voice') badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                  if (log.type === 'auth') badgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/30';

                  return (
                    <div key={log.id} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-start gap-3">
                      <span className="text-white/30 shrink-0 text-[11px]">{log.timestamp}</span>
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${badgeColor}`}>
                        {log.action}
                      </span>
                      <span className="text-white/80 break-words">{log.details}</span>
                    </div>
                  );
                })}
                {filteredLogs.length === 0 && (
                  <div className="py-8 text-center text-white/30 text-xs">Eşleşen denetim kaydı bulunamadı.</div>
                )}
              </div>
            </div>
            );
          })()}

          {/* TAB 8: BROADCAST ANNOUNCEMENT */}
          {activeTab === 'broadcast' && (
            <div className="max-w-xl mx-auto space-y-5 pt-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-amber-500/30">
                  <Megaphone className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Genel Sistem Duyurusu</h3>
                <p className="text-xs text-white/50">
                  Bu mesaj bağlı olan tüm kullanıcıların ekranının üst kısmında parlayan bildirim olarak görünecektir.
                </p>
              </div>

              {announcementSent && (
                <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs text-center font-medium">
                  ✓ Duyuru tüm aktif kullanıcılara başarıyla iletildi!
                </div>
              )}

              {adminData?.pinnedBanner && (
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-between gap-3">
                  <div className="text-xs text-amber-100">
                    <span className="font-bold text-amber-300">📌 Aktif Sabit Banner: </span>
                    {adminData.pinnedBanner.message}
                  </div>
                  <button
                    type="button"
                    onClick={() => adminClearPinnedBanner()}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-200 hover:text-white text-[10px] font-bold shrink-0 transition"
                  >
                    Bannerı Kaldır
                  </button>
                </div>
              )}

              <form onSubmit={handleSendBroadcast} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-white/50 mb-1">Hedef Kitle</label>
                    <select
                      value={broadcastTarget}
                      onChange={(e) => setBroadcastTarget(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                    >
                      <option value="all">Tüm Bağlı Kullanıcılar</option>
                      <option value="admins">Yalnızca Sistem Yöneticileri</option>
                      <option value="server">Belirli Bir Sunucu Üyeleri</option>
                    </select>
                  </div>
                  {broadcastTarget === 'server' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 mb-1">Hedef Sunucu</label>
                      <select
                        value={broadcastServerId || adminData?.servers?.[0]?.id || ''}
                        onChange={(e) => setBroadcastServerId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
                      >
                        {(adminData?.servers || []).map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={broadcastPinBanner}
                    onChange={(e) => setBroadcastPinBanner(e.target.checked)}
                    className="rounded border-white/20 bg-black/40 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Kalıcı Üst Banner olarak sabitle (yeni bağlananlar da görür)</span>
                </label>

                <textarea
                  required
                  rows={4}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Örn: Sunucu bakımı 10 dakika içinde başlayacaktır. Lütfen ses odalarından ayrılınız..."
                  className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-2xl p-4 outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-white/20 resize-none"
                />

                <button
                  type="submit"
                  disabled={!broadcastMessage.trim()}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-black font-bold text-xs rounded-2xl transition shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                  Duyuruyu Canlı Yayınla
                </button>
              </form>
            </div>
          )}

          </div>
        </div>
      </div>
    </div>
  );
};