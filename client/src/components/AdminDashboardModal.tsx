import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  FileText,
  HardDrive,
  Key,
  Megaphone,
  RefreshCw,
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
import { AdminServersTab } from './admin/AdminServersTab';
import { AdminStoreTab } from './admin/AdminStoreTab';
import { AdminSystemTab } from './admin/AdminSystemTab';
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
  | 'broadcast'
  | 'tools';

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

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setLocalToast({ type, message });
    window.setTimeout(() => {
      setLocalToast((curr) => (curr?.message === message ? null : curr));
    }, 3500);
  }, []);

  const systemForm = useAdminSystemForm(typedAdminData?.systemConfig);
  const storeForm = useAdminStoreForm(typedAdminData?.storeSettings || storeSettings);

  useEffect(() => {
    fetchAdminData();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('dsp_admin_auto_refresh', String(autoRefreshSec));
    } catch {}
    if (autoRefreshSec <= 0) return;
    const id = window.setInterval(() => {
      fetchAdminData();
    }, autoRefreshSec * 1000);
    return () => window.clearInterval(id);
  }, [autoRefreshSec]);

  const activeBanner = localToast || adminFeedback;

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
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  Sistem Yönetim Konsolu
                </h2>
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
                type="button"
                onClick={resetToMainServer}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-semibold transition"
                title="Ana Yönetim Sunucusuna Geç"
              >
                Ana Sunucuya Geç (Port 4000)
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchAdminData()}
              className="p-2 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition"
              title="Yenile"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

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
          <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-white/[0.07] bg-black/25 p-2.5 md:p-3 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto no-scrollbar">
            {[
              {
                group: 'Genel & Ayarlar',
                items: [
                  { id: 'overview', label: 'Genel Bakış', icon: Activity, dirty: false },
                  { id: 'system', label: 'Sistem Ayarları', icon: Sliders, dirty: systemForm.isSystemDirty },
                ],
              },
              {
                group: 'Topluluk & Güvenlik',
                items: [
                  {
                    id: 'users',
                    label: `Kullanıcılar (${typedAdminData?.registeredUsers.length || 0})`,
                    icon: Users,
                    dirty: false,
                  },
                  { id: 'servers', label: 'Sunucular', icon: Server, dirty: false },
                  {
                    id: 'logs',
                    label: `Denetim (${typedAdminData?.auditLogs.length || 0})`,
                    icon: FileText,
                    dirty: false,
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
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isAct ? 'text-amber-300' : 'opacity-75'}`} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.dirty && (
                        <span
                          className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                          title="Kaydedilmemiş değişiklikler var"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
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
                fetchAdminData={fetchAdminData}
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
              />
            )}

            {activeTab === 'dedicated' && (
              <AdminDedicatedTab
                adminData={typedAdminData}
                formatUptime={formatUptime}
                onConnectDedicated={connectToDedicatedServer}
                onCloseModal={onClose}
              />
            )}

            {activeTab === 'users' && (
              <AdminUsersTab
                adminData={typedAdminData}
                onlineUsers={onlineUsers}
                currentServerHost={currentServerHost}
                fetchAdminData={fetchAdminData}
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
                  isOnline: onlineUsers.some((o) => o.username.toLowerCase() === a.username.toLowerCase()),
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
