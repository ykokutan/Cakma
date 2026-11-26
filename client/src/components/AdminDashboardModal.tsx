import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Cpu,
  FileText,
  Flag,
  HardDrive,
  Key,
  Megaphone,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShoppingBag,
  Sliders,
  Users,
  X,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { AdminActionDialogs } from './admin/AdminActionDialogs';
import { AdminBroadcastTab } from './admin/AdminBroadcastTab';
import { AdminDedicatedTab } from './admin/AdminDedicatedTab';
import { AdminLicensesTab } from './admin/AdminLicensesTab';
import { AdminLogsTab } from './admin/AdminLogsTab';
import { AdminOverviewTab } from './admin/AdminOverviewTab';
import { AdminReportsTab } from './admin/AdminReportsTab';
import { AdminServersTab } from './admin/AdminServersTab';
import { AdminStoreTab } from './admin/AdminStoreTab';
import {
  AdminSystemTab,
  type SystemFocusRequest,
  type SystemSectionId,
} from './admin/AdminSystemTab';
import { AdminToolsPanel } from './admin/AdminToolsPanel';
import { AdminUsersTab } from './admin/AdminUsersTab';
import type { AdminDashboardData, AdminDialogState } from './admin/adminTypes';
import { useAdminStoreForm } from './admin/useAdminStoreForm';
import { useAdminSystemForm } from './admin/useAdminSystemForm';

interface AdminDashboardModalProps {
  onClose: () => void;
}

type AdminTabId =
  | 'overview'
  | 'system'
  | 'dedicated'
  | 'users'
  | 'licenses'
  | 'store'
  | 'servers'
  | 'logs'
  | 'reports'
  | 'broadcast'
  | 'tools';

interface ConsoleQuickSearchEntry {
  id: string;
  label: string;
  category: string;
  tab: AdminTabId;
  systemSection?: SystemSectionId;
  systemQuery?: string;
  keywords: string;
}

const CONSOLE_QUICK_SEARCH_ITEMS: ConsoleQuickSearchEntry[] = [
  {
    id: 'tab-overview',
    label: 'Genel Bakış',
    category: 'Genel',
    tab: 'overview',
    keywords: 'genel bakış istatistik aktif kullanıcı sunucu canlı özet',
  },
  {
    id: 'tab-system-all',
    label: 'Sistem Ayarları (Tümü)',
    category: 'Sistem',
    tab: 'system',
    systemSection: 'all',
    keywords: 'sistem ayarları tümü yapılandırma bakım modu',
  },
  {
    id: 'sys-general',
    label: 'Genel & Kayıt Politikası',
    category: 'Sistem Ayarları',
    tab: 'system',
    systemSection: 'general',
    keywords: 'kayıt davet kodu cüzdan bakiye yükleme boyutu yavaş mod slowmode giphy',
  },
  {
    id: 'sys-security',
    label: 'Güvenlik, 2FA & IP Ban',
    category: 'Sistem Ayarları',
    tab: 'system',
    systemSection: 'security',
    keywords: 'güvenlik denetim skoru 2fa brute force ip ban engelle automod parola şifre',
  },
  {
    id: 'sys-email',
    label: 'E-posta / SMTP & Doğrulama',
    category: 'Sistem Ayarları',
    tab: 'system',
    systemSection: 'email',
    keywords: 'smtp email e-posta mail relay doğrulama test gönder',
  },
  {
    id: 'sys-media',
    label: 'LiveKit SFU & TURN',
    category: 'Sistem Ayarları',
    tab: 'system',
    systemSection: 'media',
    keywords: 'livekit sfu turn stun webrtc ses medya eşik bağlantı test',
  },
  {
    id: 'sys-backup',
    label: 'Yedekleme & Webhook',
    category: 'Sistem Ayarları',
    tab: 'system',
    systemSection: 'backup',
    keywords: 'yedek backup geri yükle webhook discord bakım sqlite temizlik',
  },
  {
    id: 'tab-users',
    label: 'Kullanıcılar & Yetkiler',
    category: 'Topluluk',
    tab: 'users',
    keywords: 'kullanıcılar üye rol admin ban kick sustur cüzdan şifre sıfırla bağlantı',
  },
  {
    id: 'tab-servers',
    label: 'Sunucular & Kanallar',
    category: 'Topluluk',
    tab: 'servers',
    keywords: 'sunucular kanallar oda oluştur sil mesaj temizle purge',
  },
  {
    id: 'tab-logs',
    label: 'Denetim Günlükleri',
    category: 'Güvenlik',
    tab: 'logs',
    keywords: 'denetim audit log kayıt geçmiş temizle',
  },
  {
    id: 'tab-reports',
    label: 'Şikayetler (5651)',
    category: 'Güvenlik',
    tab: 'reports',
    keywords: 'şikayet 5651 ihbar rapor moderasyon içerik',
  },
  {
    id: 'tab-dedicated',
    label: 'Dedicated Sunucular',
    category: 'Altyapı',
    tab: 'dedicated',
    keywords: 'dedicated node düğüm port bağlan özel sunucu',
  },
  {
    id: 'tab-licenses',
    label: 'Lisans Yönetimi',
    category: 'Altyapı',
    tab: 'licenses',
    keywords: 'lisans anahtar key oluştur aktif iptal süre uzat',
  },
  {
    id: 'tab-store',
    label: 'Mağaza & Fiyatlandırma',
    category: 'Mağaza',
    tab: 'store',
    keywords: 'mağaza satış fiyat ürün ödeme açık kapalı',
  },
  {
    id: 'tab-broadcast',
    label: 'Sistem Duyurusu',
    category: 'İletişim',
    tab: 'broadcast',
    keywords: 'duyuru yayın banner sabit bildirim global mesaj',
  },
  {
    id: 'tab-tools',
    label: 'Raporlar & Disk',
    category: 'Araçlar',
    tab: 'tools',
    keywords: 'rapor disk depolama toplu ban csv export istatistik',
  },
];

function formatClockTime(): string {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatUptime(seconds?: number): string {
  if (!seconds) return '0 sn';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}s ${mins}d ${secs}sn`;
  if (mins > 0) return `${mins}d ${secs}sn`;
  return `${secs} sn`;
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
    adminCreateRegInvite,
    adminDeleteRegInvite,
    adminTestSmtp,
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
    serverMuteUser,
    connectToDedicatedServer,
    currentServerHost,
    resetToMainServer,
  } = useSocket();

  const typedAdminData = adminData as AdminDashboardData | null;

  const [activeTab, setActiveTab] = useState<AdminTabId>('overview');
  const [dialog, setDialog] = useState<AdminDialogState | null>(null);
  const [consoleSearch, setConsoleSearch] = useState('');
  const [systemFocusRequest, setSystemFocusRequest] = useState<SystemFocusRequest | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(() => formatClockTime());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localToast, setLocalToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('dsp_admin_auto_refresh');
      if (raw === null) return 15;
      const saved = Number(raw);
      return [0, 5, 15, 30].includes(saved) ? saved : 15;
    } catch {
      return 15;
    }
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setLocalToast({ type, message });
    window.setTimeout(() => {
      setLocalToast((curr) => (curr?.message === message ? null : curr));
    }, 3500);
  }, []);

  const systemForm = useAdminSystemForm(typedAdminData?.systemConfig);
  const storeForm = useAdminStoreForm(typedAdminData?.storeSettings || storeSettings);
  const hasUnsavedChanges = systemForm.isSystemDirty || storeForm.isStoreDirty;

  const triggerRefresh = useCallback(
    (silent = false) => {
      fetchAdminData();
      setLastUpdatedAt(formatClockTime());
      if (!silent) {
        setIsRefreshing(true);
        if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = window.setTimeout(() => {
          setIsRefreshing(false);
        }, 450);
      }
    },
    [fetchAdminData]
  );

  const handleRequestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setConfirmCloseOpen(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  useEffect(() => {
    fetchAdminData();
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, [fetchAdminData]);

  useEffect(() => {
    try {
      localStorage.setItem('dsp_admin_auto_refresh', String(autoRefreshSec));
    } catch {}
    if (autoRefreshSec <= 0) return;
    const id = window.setInterval(() => {
      triggerRefresh(true);
    }, autoRefreshSec * 1000);
    return () => window.clearInterval(id);
  }, [autoRefreshSec, triggerRefresh]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.key === 'Escape') {
        if (confirmCloseOpen) {
          e.preventDefault();
          setConfirmCloseOpen(false);
          return;
        }
        if (!dialog) {
          e.preventDefault();
          handleRequestClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmCloseOpen, dialog, handleRequestClose]);

  const activeBanner = localToast || adminFeedback;
  const normalizedConsoleQuery = consoleSearch.trim().toLowerCase();
  const quickSearchMatches = normalizedConsoleQuery
    ? CONSOLE_QUICK_SEARCH_ITEMS.filter(
        (item) =>
          item.label.toLowerCase().includes(normalizedConsoleQuery) ||
          item.category.toLowerCase().includes(normalizedConsoleQuery) ||
          item.keywords.includes(normalizedConsoleQuery)
      )
    : [];

  const securityScore = typedAdminData?.securityAudit?.score;
  const openReportsCount = (typedAdminData?.contentReports || []).filter(
    (r) => r.status === 'open'
  ).length;
  const securityBadgeClass =
    typeof securityScore === 'number'
      ? securityScore >= 80
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        : securityScore >= 55
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      : '';

  const maintenanceActive = Boolean(typedAdminData?.systemConfig?.maintenanceMode);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-6xl ios-glass rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-white/15 h-[92dvh] md:h-[82vh] md:max-h-[820px] relative">
        {/* Admin Header */}
        <header className="min-h-16 px-4 sm:px-6 py-2 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2 shrink-0 bg-gradient-to-r from-amber-500/10 via-teal-500/5 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  Sistem Yönetim Konsolu
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold border border-amber-400/30 shrink-0">
                  ROOT
                </span>
                {maintenanceActive && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-200 text-[10px] font-extrabold border border-amber-400/45 animate-pulse shrink-0">
                    BAKIM MODU
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold border border-emerald-400/30 shrink-0">
                  Çevrimiçi: {onlineUsers.length}
                </span>
              </div>
              <p className="text-[11px] text-white/45 truncate hidden sm:block">
                Sistem yapılandırması, güvenlik, altyapı ve topluluk yönetimi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentServerHost !== 'localhost:4000' && (
              <button
                type="button"
                onClick={resetToMainServer}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-semibold transition"
                title="Ana Yönetim Sunucusuna Geç"
              >
                Ana Sunucu (4000)
              </button>
            )}

            <select
              aria-label="Otomatik yenileme süresi"
              value={autoRefreshSec}
              onChange={(e) => setAutoRefreshSec(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/15 text-[11px] font-medium text-white/80 outline-none focus:border-amber-400"
              title="Konsol otomatik yenileme sıklığı"
            >
              <option value={0}>Oto: Kapalı</option>
              <option value={5}>Oto: 5 sn</option>
              <option value={15}>Oto: 15 sn</option>
              <option value={30}>Oto: 30 sn</option>
            </select>

            <span
              className="hidden lg:inline text-[11px] text-white/45 tabular-nums"
              title="Son veri güncelleme saati"
            >
              Son: {lastUpdatedAt}
            </span>

            <button
              type="button"
              onClick={() => triggerRefresh(false)}
              className="p-2 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition"
              title="Verileri şimdi yenile"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-300' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleRequestClose}
              className="p-2 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition"
              title="Kapat (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Unsaved Changes Exit Guard */}
        {confirmCloseOpen && (
          <div className="px-5 sm:px-6 py-2.5 bg-amber-500/15 border-b border-amber-400/35 flex flex-wrap items-center justify-between gap-2 shrink-0 animate-fade-in">
            <span className="text-xs font-semibold text-amber-100">
              Kaydedilmemiş sistem veya mağaza değişiklikleri var. Kaydetmeden çıkmak istediğinize
              emin misiniz?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmCloseOpen(false)}
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 rounded-lg bg-rose-500/80 hover:bg-rose-500 text-xs font-bold text-white transition"
              >
                Kaydetmeden Çık
              </button>
            </div>
          </div>
        )}

        {/* Live Admin Action Feedback Banner */}
        {activeBanner && (
          <div
            className={`px-6 py-2 text-xs font-semibold flex items-center justify-between border-b shrink-0 animate-fade-in ${
              activeBanner.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            <span>{activeBanner.message}</span>
          </div>
        )}

        {/* Body: Categorized Sidebar + Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          <aside className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-white/[0.07] bg-black/25 p-2.5 md:p-3 flex flex-col gap-2 overflow-hidden">
            {/* Console Quick Search */}
            <div className="relative shrink-0">
              <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={consoleSearch}
                onChange={(e) => setConsoleSearch(e.target.value)}
                placeholder="Sekme veya ayar ara..."
                className="w-full pl-8 pr-12 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-white/35 outline-none focus:border-amber-400"
              />
              {consoleSearch ? (
                <button
                  type="button"
                  onClick={() => setConsoleSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/45 hover:text-white"
                  title="Aramayı temizle"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className="hidden md:inline-block absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-white/40 font-mono">
                  Ctrl+K
                </span>
              )}

              {normalizedConsoleQuery && (
                <div className="mt-1.5 max-h-48 overflow-y-auto rounded-xl bg-[#10131d]/95 border border-white/15 p-1 space-y-0.5 shadow-xl z-20">
                  {quickSearchMatches.length === 0 ? (
                    <div className="px-2 py-2 text-[11px] text-white/45 text-center">
                      Eşleşme bulunamadı
                    </div>
                  ) : (
                    quickSearchMatches.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.tab);
                          if (item.tab === 'system' && item.systemSection) {
                            setSystemFocusRequest({
                              section: item.systemSection,
                              query: item.systemQuery || '',
                              nonce: Date.now(),
                            });
                          }
                          setConsoleSearch('');
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-amber-500/20 text-[11px] text-white/85 hover:text-white transition flex items-center justify-between gap-2"
                      >
                        <span className="truncate font-medium">{item.label}</span>
                        <span className="text-[9px] text-white/40 shrink-0">{item.category}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto no-scrollbar">
              {[
                {
                  group: 'Genel & Ayarlar',
                  items: [
                    { id: 'overview', label: 'Genel Bakış', icon: Activity, dirty: false },
                    {
                      id: 'system',
                      label: 'Sistem Ayarları',
                      icon: Sliders,
                      dirty: systemForm.isSystemDirty,
                      badge:
                        typeof securityScore === 'number' ? `${securityScore}/100` : undefined,
                      badgeClass: securityBadgeClass,
                    },
                  ],
                },
                {
                  group: 'Topluluk & Güvenlik',
                  items: [
                    {
                      id: 'users',
                      label: 'Kullanıcılar',
                      icon: Users,
                      dirty: false,
                      badge: `${onlineUsers.length}/${typedAdminData?.registeredUsers.length || 0}`,
                      badgeClass: 'bg-white/10 text-white/75 border-white/15',
                    },
                    { id: 'servers', label: 'Sunucular', icon: Server, dirty: false },
                    {
                      id: 'logs',
                      label: `Denetim (${typedAdminData?.auditLogs.length || 0})`,
                      icon: FileText,
                      dirty: false,
                    },
                    {
                      id: 'reports',
                      label: 'Şikayetler (5651)',
                      icon: Flag,
                      dirty: false,
                      badge: openReportsCount > 0 ? String(openReportsCount) : undefined,
                      badgeClass: 'bg-rose-500/20 text-rose-200 border-rose-400/35',
                    },
                  ],
                },
                {
                  group: 'Altyapı & Mağaza',
                  items: [
                    {
                      id: 'dedicated',
                      label: `Dedicated (${typedAdminData?.dedicatedServers?.length || 0})`,
                      icon: Cpu,
                      dirty: false,
                    },
                    {
                      id: 'licenses',
                      label: `Lisanslar (${typedAdminData?.issuedLicenses?.length || 0})`,
                      icon: Key,
                      dirty: false,
                    },
                    {
                      id: 'store',
                      label: `Mağaza ${storeForm.fields.storeIsOpen ? '●' : '○'}`,
                      icon: ShoppingBag,
                      dirty: storeForm.isStoreDirty,
                    },
                  ],
                },
                {
                  group: 'İletişim',
                  items: [
                    { id: 'broadcast', label: 'Sistem Duyurusu', icon: Megaphone, dirty: false },
                    { id: 'tools', label: 'Raporlar & Disk', icon: HardDrive, dirty: false },
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
                        onClick={() => setActiveTab(item.id as AdminTabId)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-between gap-2 whitespace-nowrap ${
                          isAct
                            ? 'bg-gradient-to-r from-amber-500/25 via-teal-500/15 to-transparent text-white border border-amber-400/35 shadow-sm'
                            : 'text-white/60 hover:bg-white/[0.06] hover:text-white border border-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isAct ? 'text-amber-300' : 'opacity-75'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {'badge' in item && item.badge && (
                            <span
                              className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold tabular-nums ${item.badgeClass}`}
                            >
                              {item.badge}
                            </span>
                          )}
                          {item.dirty && (
                            <span
                              className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                              title="Kaydedilmemiş değişiklikler var"
                            />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>

          {/* Admin Content Area */}
          <div className="flex-1 p-5 sm:p-6 overflow-y-auto">
            {activeTab === 'overview' && (
              <AdminOverviewTab
                adminData={typedAdminData}
                onlineUsers={onlineUsers}
                currentServerHost={currentServerHost}
                formatUptime={formatUptime}
                onGoToSystemTab={() => setActiveTab('system')}
                onServerMuteUser={serverMuteUser}
                onKickUser={adminKickUser}
                onRequestDialog={setDialog}
              />
            )}

            {activeTab === 'system' && (
              <AdminSystemTab
                adminData={typedAdminData}
                currentServerHost={currentServerHost}
                form={systemForm}
                autoRefreshSec={autoRefreshSec}
                setAutoRefreshSec={setAutoRefreshSec}
                fetchAdminData={() => triggerRefresh(false)}
                onSaveSystemConfig={adminUpdateSystemConfig}
                onCreateRegInvite={adminCreateRegInvite}
                onDeleteRegInvite={adminDeleteRegInvite}
                onBanIp={adminBanIp}
                onUnbanIp={adminUnbanIp}
                onExportFullBackup={adminExportFullBackup}
                onRestoreFullBackup={adminRestoreFullBackup}
                onTriggerBackupNow={adminTriggerBackupNow}
                onRestoreScheduledBackup={adminRestoreScheduledBackup}
                onDeleteScheduledBackup={adminDeleteScheduledBackup}
                onTestWebhook={adminTestWebhook}
                onTestSmtp={adminTestSmtp}
                onRequestDialog={setDialog}
                onNotify={notify}
                focusRequest={systemFocusRequest}
              />
            )}

            {activeTab === 'dedicated' && (
              <AdminDedicatedTab
                adminData={typedAdminData}
                formatUptime={formatUptime}
                onConnectDedicated={connectToDedicatedServer}
                onCloseModal={handleRequestClose}
              />
            )}

            {activeTab === 'users' && (
              <AdminUsersTab
                adminData={typedAdminData}
                onlineUsers={onlineUsers}
                currentServerHost={currentServerHost}
                fetchAdminData={() => triggerRefresh(false)}
                onChangeRole={adminChangeRole}
                onKickUser={adminKickUser}
                onUpdateWallet={adminUpdateWallet}
                onBanUser={adminBanUser}
                onUnbanUser={adminUnbanUser}
                onResetUser2fa={adminResetUser2fa}
                onResetUserPassword={adminResetUserPassword}
                onBanIp={adminBanIp}
                onClearConnectionLogs={adminClearConnectionLogs}
                onRequestDialog={setDialog}
                onNotify={notify}
              />
            )}

            {activeTab === 'licenses' && (
              <AdminLicensesTab
                adminData={typedAdminData}
                generatedLicense={generatedLicense}
                clearGeneratedLicense={clearGeneratedLicense}
                onGenerateLicense={generateDedicatedLicense}
                onActivateLicense={adminActivateLicense}
                onRevokeLicense={adminRevokeLicense}
                onExtendLicense={adminExtendLicense}
                onRequestDialog={setDialog}
                onNotify={notify}
              />
            )}

            {activeTab === 'store' && (
              <AdminStoreTab form={storeForm} onUpdateStoreSettings={adminUpdateStoreSettings} />
            )}

            {activeTab === 'servers' && (
              <AdminServersTab
                adminData={typedAdminData}
                onDeleteServer={adminDeleteServer}
                onDeleteChannel={adminDeleteChannel}
                onCreateChannel={adminCreateChannel}
                onPurgeMessages={adminPurgeMessages}
                onRequestDialog={setDialog}
              />
            )}

            {activeTab === 'logs' && (
              <AdminLogsTab
                adminData={typedAdminData}
                onClearAuditLogs={adminClearAuditLogs}
                onRequestDialog={setDialog}
              />
            )}

            {activeTab === 'reports' && (
              <AdminReportsTab
                currentServerHost={currentServerHost}
                initialReports={typedAdminData?.contentReports}
                onNotify={notify}
              />
            )}

            {activeTab === 'broadcast' && (
              <AdminBroadcastTab
                adminData={typedAdminData}
                onBroadcastAnnouncement={adminBroadcastAnnouncement}
                onClearPinnedBanner={adminClearPinnedBanner}
              />
            )}

            {activeTab === 'tools' && (
              <AdminToolsPanel
                currentServerHost={currentServerHost}
                users={(typedAdminData?.registeredUsers || []).map((a) => ({
                  username: a.username,
                  role: a.role,
                  isBanned: a.isBanned,
                  isOnline: onlineUsers.some(
                    (o) => o.username.toLowerCase() === a.username.toLowerCase()
                  ),
                }))}
                licenses={typedAdminData?.issuedLicenses || []}
                logs={typedAdminData?.auditLogs || []}
                servers={typedAdminData?.servers || []}
                defaultWebhookUrl={systemForm.fields.sysWebhookUrl}
                onBanUser={(uname) => adminBanUser(uname, 'Admin Paneli Toplu İşlem')}
                onUnbanUser={(uname) => adminUnbanUser(uname)}
              />
            )}
          </div>
        </div>
      </div>

      <AdminActionDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
};
