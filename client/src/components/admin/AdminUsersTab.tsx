import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Key,
  LogOut,
  Radio,
  Search,
  ShieldAlert,
  Wallet,
  X,
} from 'lucide-react';
import { AvatarView } from '../AvatarView';
import type { User } from '../../types';
import type { AdminDashboardData, RequestAdminDialogFn } from './adminTypes';
import { authFetch } from '../../utils/authFetch';

interface AdminUsersTabProps {
  adminData: AdminDashboardData | null;
  onlineUsers: User[];
  currentServerHost: string;
  fetchAdminData: () => void;
  onChangeRole: (targetUsername: string, newRole: 'admin' | 'user') => void;
  onKickUser: (targetSocketId: string, reason?: string) => void;
  onUpdateWallet: (targetUsername: string, amount: number, mode?: 'set' | 'add') => void;
  onBanUser: (targetUsername: string, reason?: string, durationMinutes?: number) => void;
  onUnbanUser: (targetUsername: string) => void;
  onResetUser2fa: (targetUsername: string) => void;
  onResetUserPassword: (targetUsername: string, newPassword: string) => void;
  onBanIp: (ip: string, reason?: string, durationMinutes?: number) => void;
  onClearConnectionLogs: () => void;
  onRequestDialog: RequestAdminDialogFn;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const USERS_PER_PAGE = 15;

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  adminData,
  onlineUsers,
  currentServerHost,
  fetchAdminData,
  onChangeRole,
  onKickUser,
  onUpdateWallet,
  onBanUser,
  onUnbanUser,
  onResetUser2fa,
  onResetUserPassword,
  onBanIp,
  onClearConnectionLogs,
  onRequestDialog,
  onNotify,
}) => {
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'online' | 'banned' | 'admin'>('all');
  const [page, setPage] = useState(1);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [inspectedUsername, setInspectedUsername] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'summary' | 'sessions' | 'connections' | 'activity'>('summary');
  const [revokingSocketId, setRevokingSocketId] = useState<string | null>(null);

  const allUsers = adminData?.registeredUsers || [];
  const filteredUsers = useMemo(() => {
    return allUsers.filter((u) => {
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
  }, [allUsers, onlineUsers, userFilter, userSearchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedUsers = filteredUsers.slice((safePage - 1) * USERS_PER_PAGE, safePage * USERS_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [userSearchQuery, userFilter]);

  const toggleSelectUser = (username: string) => {
    setSelectedUsers((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]
    );
  };

  const pageUsernames = paginatedUsers.map((u) => u.username);
  const allPageSelected = pageUsernames.length > 0 && pageUsernames.every((u) => selectedUsers.includes(u));

  const toggleSelectPage = () => {
    if (allPageSelected) {
      setSelectedUsers((prev) => prev.filter((u) => !pageUsernames.includes(u)));
    } else {
      setSelectedUsers((prev) => Array.from(new Set([...prev, ...pageUsernames])));
    }
  };

  const handleRevokeSession = async (socketId: string) => {
    setRevokingSocketId(socketId);
    try {
      const res = await authFetch(currentServerHost, `/api/admin/sessions/${encodeURIComponent(socketId)}/revoke`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        onNotify('success', data.revoked ? 'Oturum başarıyla sonlandırıldı.' : 'Oturum zaten kapalıydı.');
        fetchAdminData();
      } else {
        onKickUser(socketId, 'Yönetici tarafından oturum sonlandırıldı.');
      }
    } catch {
      onKickUser(socketId, 'Yönetici tarafından oturum sonlandırıldı.');
    } finally {
      setRevokingSocketId(null);
    }
  };

  const handleBulkForceLogout = () => {
    if (selectedUsers.length === 0) return;
    onRequestDialog({
      type: 'confirm',
      title: `Toplu Oturum Kapatma (${selectedUsers.length} Kullanıcı)`,
      description: 'Seçili tüm kullanıcıların aktif bağlantıları kesilecek. Devam edilsin mi?',
      confirmLabel: 'Oturumları Kapat',
      tone: 'amber',
      onConfirm: async () => {
        let total = 0;
        for (const uname of selectedUsers) {
          try {
            const res = await authFetch(
              currentServerHost,
              `/api/admin/users/${encodeURIComponent(uname)}/force-logout`,
              { method: 'POST' }
            );
            const data = await res.json().catch(() => null);
            total += data?.disconnected || 0;
          } catch {}
        }
        onNotify('success', `${selectedUsers.length} kullanıcı için toplam ${total} oturum sonlandırıldı.`);
        setSelectedUsers([]);
        fetchAdminData();
      },
    });
  };

  const inspectedAccount = useMemo(
    () =>
      inspectedUsername
        ? allUsers.find((u) => u.username.toLowerCase() === inspectedUsername.toLowerCase()) || null
        : null,
    [allUsers, inspectedUsername]
  );

  const inspectedOnlineUser = useMemo(
    () =>
      inspectedUsername
        ? onlineUsers.find((o) => o.username.toLowerCase() === inspectedUsername.toLowerCase()) || null
        : null,
    [onlineUsers, inspectedUsername]
  );

  const inspectedSessions = useMemo(
    () =>
      inspectedUsername
        ? (adminData?.activeSessions || []).filter(
            (s) => s.username.toLowerCase() === inspectedUsername.toLowerCase()
          )
        : [],
    [adminData?.activeSessions, inspectedUsername]
  );

  const inspectedConnectionLogs = useMemo(
    () =>
      inspectedUsername
        ? (adminData?.connectionLogs || []).filter(
            (c) => c.username.toLowerCase() === inspectedUsername.toLowerCase()
          )
        : [],
    [adminData?.connectionLogs, inspectedUsername]
  );

  const inspectedLicenses = useMemo(
    () =>
      inspectedUsername
        ? (adminData?.issuedLicenses || []).filter(
            (l) => (l.assignedUsername || '').toLowerCase() === inspectedUsername.toLowerCase()
          )
        : [],
    [adminData?.issuedLicenses, inspectedUsername]
  );

  const inspectedAuditLogs = useMemo(
    () =>
      inspectedUsername
        ? (adminData?.auditLogs || []).filter((log) =>
            log.details.toLowerCase().includes(inspectedUsername.toLowerCase())
          )
        : [],
    [adminData?.auditLogs, inspectedUsername]
  );

  return (
    <div className="space-y-4">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Kayıtlı Kullanıcı Hesapları ({filteredUsers.length} / {allUsers.length})
          </h3>
          <span className="text-[11px] text-white/40">
            Yetki, bakiye, şifre sıfırlama, toplu işlem ve oturum yönetimi
          </span>
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

      {/* Contextual Bulk Action Bar */}
      {selectedUsers.length > 0 && (
        <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex flex-wrap items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
            <CheckSquare className="w-4 h-4 text-amber-400" />
            <span>{selectedUsers.length} kullanıcı seçili</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleBulkForceLogout}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200 text-xs font-semibold flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              Toplu Çıkış
            </button>
            <button
              type="button"
              onClick={() =>
                onRequestDialog({
                  type: 'edit_wallet',
                  targets: selectedUsers,
                  onSubmit: (amount, mode) => {
                    selectedUsers.forEach((u) => onUpdateWallet(u, amount, mode));
                    onNotify('success', `${selectedUsers.length} kullanıcının bakiyesi güncellendi.`);
                    setSelectedUsers([]);
                  },
                })
              }
              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-200 text-xs font-semibold flex items-center gap-1"
            >
              <Wallet className="w-3.5 h-3.5" />
              Toplu Bakiye
            </button>
            <button
              type="button"
              onClick={() =>
                onRequestDialog({
                  type: 'ban_user',
                  targets: selectedUsers,
                  onSubmit: (reason, mins) => {
                    selectedUsers.forEach((u) => onBanUser(u, reason, mins));
                    onNotify('success', `${selectedUsers.length} kullanıcı yasaklandı.`);
                    setSelectedUsers([]);
                  },
                })
              }
              className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 text-xs font-semibold flex items-center gap-1"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Toplu Yasakla
            </button>
            <button
              type="button"
              onClick={() => setSelectedUsers([])}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/75 text-xs font-semibold"
            >
              Temizle
            </button>
          </div>
        </div>
      )}

      {/* Unified User Detail Drawer */}
      {inspectedUsername && inspectedAccount && (
        <div className="p-4 rounded-2xl ios-glass-card border border-teal-400/35 space-y-4 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                <AvatarView
                  avatar={inspectedAccount.avatar}
                  alt={inspectedAccount.username}
                  fallback="👤"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-white truncate">@{inspectedAccount.username}</h4>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      inspectedAccount.role === 'admin'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-blue-500/15 text-blue-300'
                    }`}
                  >
                    {inspectedAccount.role === 'admin' ? 'YÖNETİCİ' : 'KULLANICI'}
                  </span>
                  {inspectedAccount.isBanned && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                      YASAKLI
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-medium ${
                      inspectedOnlineUser ? 'text-emerald-400' : 'text-white/40'
                    }`}
                  >
                    {inspectedOnlineUser ? '● Çevrimiçi' : '○ Çevrimdışı'}
                  </span>
                </div>
                <div className="text-[11px] text-white/50 truncate">
                  {inspectedAccount.email || 'E-posta yok'} • Kayıt: {inspectedAccount.createdAt || '-'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setInspectedUsername(null)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition"
              title="Çekmeceyi Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Sub-Tabs */}
          <div className="flex flex-wrap gap-1.5 bg-black/30 p-1 rounded-xl border border-white/10 text-[11px]">
            {[
              { id: 'summary', label: 'Özet & İşlemler' },
              { id: 'sessions', label: `Aktif Oturumlar (${inspectedSessions.length})` },
              { id: 'connections', label: `IP Geçmişi (${inspectedConnectionLogs.length})` },
              { id: 'activity', label: `Lisans (${inspectedLicenses.length}) & Log (${inspectedAuditLogs.length})` },
            ].map((dt) => (
              <button
                key={dt.id}
                type="button"
                onClick={() => setDrawerTab(dt.id as any)}
                className={`px-3 py-1 rounded-lg font-semibold transition ${
                  drawerTab === dt.id ? 'bg-teal-500 text-black' : 'text-white/65 hover:text-white'
                }`}
              >
                {dt.label}
              </button>
            ))}
          </div>

          {/* Drawer Body */}
          {drawerTab === 'summary' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[10px] text-white/40">Bakiye</div>
                  <div className="font-mono font-bold text-emerald-400 mt-0.5">
                    ₺{inspectedAccount.walletBalance ?? 0}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[10px] text-white/40">2FA Koruması</div>
                  <div className="font-semibold text-white mt-0.5">
                    {inspectedAccount.twoFactorEnabled ? 'Açık (TOTP)' : 'Kapalı'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[10px] text-white/40">Aktif Oturum</div>
                  <div className="font-semibold text-teal-300 mt-0.5">{inspectedSessions.length} soket</div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[10px] text-white/40">Lisanslar</div>
                  <div className="font-semibold text-amber-300 mt-0.5">{inspectedLicenses.length} adet</div>
                </div>
              </div>

              {inspectedAccount.isBanned && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
                  <b>Yasaklama Sebebi:</b> {inspectedAccount.bannedReason || 'Belirtilmemiş'}
                  {inspectedAccount.bannedUntil && (
                    <span className="ml-2 text-rose-300/80">
                      (Bitiş: {new Date(inspectedAccount.bannedUntil).toLocaleString('tr-TR')})
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onRequestDialog({
                      type: 'edit_wallet',
                      targets: [inspectedAccount.username],
                      currentBalance: inspectedAccount.walletBalance ?? 0,
                      onSubmit: (amt, mode) => onUpdateWallet(inspectedAccount.username, amt, mode),
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold"
                >
                  Bakiye Düzenle
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onRequestDialog({
                      type: 'reset_password',
                      username: inspectedAccount.username,
                      onSubmit: (pw) => onResetUserPassword(inspectedAccount.username, pw),
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold"
                >
                  Şifre Sıfırla
                </button>
                {inspectedAccount.twoFactorEnabled && (
                  <button
                    type="button"
                    onClick={() =>
                      onRequestDialog({
                        type: 'confirm',
                        title: '2FA Korumasını Sıfırla',
                        description: `${inspectedAccount.username} kullanıcısının 2FA korumasını sıfırlamak istediğinize emin misiniz?`,
                        confirmLabel: '2FA Sıfırla',
                        tone: 'amber',
                        onConfirm: () => onResetUser2fa(inspectedAccount.username),
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold"
                  >
                    2FA Sıfırla
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onChangeRole(
                      inspectedAccount.username,
                      inspectedAccount.role === 'admin' ? 'user' : 'admin'
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
                >
                  {inspectedAccount.role === 'admin' ? 'Standart Yap' : 'Yönetici Yap'}
                </button>
                {inspectedAccount.isBanned ? (
                  <button
                    type="button"
                    onClick={() => onUnbanUser(inspectedAccount.username)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold"
                  >
                    Yasağı Kaldır
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onRequestDialog({
                        type: 'ban_user',
                        targets: [inspectedAccount.username],
                        onSubmit: (reason, mins) => onBanUser(inspectedAccount.username, reason, mins),
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-bold"
                  >
                    Hesabı Yasakla
                  </button>
                )}
              </div>
            </div>
          )}

          {drawerTab === 'sessions' && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {inspectedSessions.length === 0 ? (
                <div className="text-xs text-white/40 py-2">Bu kullanıcıya ait aktif oturum yok.</div>
              ) : (
                inspectedSessions.map((sess) => (
                  <div
                    key={sess.socketId}
                    className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span className="font-mono text-amber-300 shrink-0">{sess.ip}</span>
                      <span className="text-white/55 truncate" title={sess.userAgent}>
                        {sess.userAgent}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-white/40">
                        {new Date(sess.connectedAt).toLocaleTimeString('tr-TR')}
                      </span>
                      <button
                        type="button"
                        disabled={revokingSocketId === sess.socketId}
                        onClick={() => handleRevokeSession(sess.socketId)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white text-[10px] font-semibold transition disabled:opacity-50"
                      >
                        {revokingSocketId === sess.socketId ? 'Kapatılıyor...' : 'Oturumu Sonlandır'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {drawerTab === 'connections' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-white/45">Son bağlantılar, cihaz bilgisi ve IP adresleri</span>
                {inspectedConnectionLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onRequestDialog({
                        type: 'confirm',
                        title: 'Bağlantı Geçmişini Temizle',
                        description: 'Tüm bağlantı ve IP geçmişini temizlemek istediğinize emin misiniz?',
                        confirmLabel: 'Tüm Logları Temizle',
                        tone: 'danger',
                        onConfirm: onClearConnectionLogs,
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30 text-[10px] font-semibold transition"
                  >
                    Tüm Logları Temizle
                  </button>
                )}
              </div>
              {inspectedConnectionLogs.length === 0 ? (
                <div className="text-xs text-white/40 py-2">
                  Bu kullanıcıya ait kayıtlı bağlantı geçmişi bulunamadı.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {inspectedConnectionLogs.slice(0, 25).map((log) => (
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
                          onClick={() =>
                            onRequestDialog({
                              type: 'ban_ip',
                              ip: log.ip,
                              defaultReason: `${inspectedUsername} üzerinden engellendi`,
                              onSubmit: (reason, mins) => onBanIp(log.ip, reason, mins),
                            })
                          }
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
          )}

          {drawerTab === 'activity' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  Atanan Lisanslar ({inspectedLicenses.length})
                </div>
                {inspectedLicenses.length === 0 ? (
                  <div className="text-xs text-white/40 py-2">Kullanıcıya atanmış lisans yok.</div>
                ) : (
                  inspectedLicenses.map((lic) => (
                    <div key={lic.id} className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-xs space-y-0.5">
                      <div className="font-semibold text-white flex items-center justify-between">
                        <span>{lic.licensee}</span>
                        <span className="text-[10px] font-mono text-amber-300">
                          {lic.maxSlots} Slot • {lic.tier}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/45 font-mono truncate">{lic.licenseKey}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                <div className="text-[11px] font-bold text-teal-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  İlgili Denetim Günlükleri ({inspectedAuditLogs.length})
                </div>
                {inspectedAuditLogs.length === 0 ? (
                  <div className="text-xs text-white/40 py-2">Kullanıcıyla ilgili son log yok.</div>
                ) : (
                  inspectedAuditLogs.slice(0, 20).map((log) => (
                    <div key={log.id} className="p-2 rounded-xl bg-black/30 border border-white/5 text-[11px] space-y-0.5">
                      <div className="flex items-center justify-between text-[10px] font-mono text-white/40">
                        <span className="text-teal-300 font-bold">{log.action}</span>
                        <span>{log.timestamp}</span>
                      </div>
                      <div className="text-white/75 break-words">{log.details}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-2xl border border-white/10 overflow-x-auto bg-white/[0.02]">
        <table className="w-full text-left text-xs text-white/80">
          <thead className="bg-white/5 text-[11px] font-semibold text-white/40 uppercase border-b border-white/10">
            <tr>
              <th className="px-3 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectPage}
                  className="rounded border-white/25 bg-black/40 text-amber-500"
                  title="Bu sayfadakileri seç"
                />
              </th>
              <th className="px-4 py-3">Kullanıcı</th>
              <th className="px-4 py-3">E-Posta</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Bakiye</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3 text-right">Kontroller</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {paginatedUsers.map((u) => {
              const onlineUser = onlineUsers.find((o) => o.username.toLowerCase() === u.username.toLowerCase());
              const isOnline = !!onlineUser;
              const isSelected = selectedUsers.includes(u.username);
              const isInspected = inspectedUsername?.toLowerCase() === u.username.toLowerCase();

              return (
                <tr
                  key={u.id}
                  className={`hover:bg-white/[0.03] transition ${
                    u.isBanned ? 'bg-rose-500/[0.04]' : isSelected ? 'bg-amber-500/[0.06]' : ''
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectUser(u.username)}
                      className="rounded border-white/25 bg-black/40 text-amber-500"
                    />
                  </td>
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
                          onRequestDialog({
                            type: 'edit_wallet',
                            targets: [u.username],
                            currentBalance: u.walletBalance ?? 0,
                            onSubmit: (amt, mode) => onUpdateWallet(u.username, amt, mode),
                          })
                        }
                        className="px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold transition"
                        title="Bakiyeyi Düzenle"
                      >
                        Düzenle
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] ${
                        isOnline ? 'text-emerald-400' : 'text-white/30'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-white/30'}`} />
                      {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setInspectedUsername(isInspected ? null : u.username)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition border flex items-center gap-1 ${
                          isInspected
                            ? 'bg-teal-500/25 border-teal-400/50 text-teal-200'
                            : 'bg-white/5 hover:bg-white/15 border-white/10 text-white/80'
                        }`}
                        title="Kullanıcı Detay Çekmecesini Aç (Oturumlar, IP, Lisans, Log)"
                      >
                        <Eye className="w-3 h-3" />
                        Detay
                      </button>

                      {u.role === 'admin' ? (
                        <button
                          type="button"
                          onClick={() => onChangeRole(u.username, 'user')}
                          className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-medium transition"
                        >
                          Standart Yap
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onChangeRole(u.username, 'admin')}
                          className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black text-[10px] font-bold transition border border-amber-500/30"
                        >
                          Yönetici Yap
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          onRequestDialog({
                            type: 'reset_password',
                            username: u.username,
                            onSubmit: (pw) => onResetUserPassword(u.username, pw),
                          })
                        }
                        className="px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-semibold transition border border-indigo-500/20"
                        title="Şifre Sıfırla"
                      >
                        Şifre
                      </button>

                      {u.twoFactorEnabled && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestDialog({
                              type: 'confirm',
                              title: '2FA Korumasını Sıfırla',
                              description: `${u.username} kullanıcısının 2FA korumasını sıfırlamak istediğinize emin misiniz?`,
                              confirmLabel: '2FA Sıfırla',
                              tone: 'amber',
                              onConfirm: () => onResetUser2fa(u.username),
                            })
                          }
                          className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold transition border border-amber-500/20"
                          title="2FA Sıfırla"
                        >
                          2FA Sıfırla
                        </button>
                      )}

                      {u.isBanned ? (
                        <button
                          type="button"
                          onClick={() => onUnbanUser(u.username)}
                          className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold transition border border-emerald-500/30"
                        >
                          Yasağı Kaldır
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestDialog({
                              type: 'ban_user',
                              targets: [u.username],
                              onSubmit: (reason, mins) => onBanUser(u.username, reason, mins),
                            })
                          }
                          className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white text-[10px] font-bold transition border border-rose-500/30"
                        >
                          Yasakla
                        </button>
                      )}

                      {isOnline && onlineUser && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestDialog({
                              type: 'kick_user',
                              username: u.username,
                              onSubmit: (reason) => onKickUser(onlineUser.id, reason),
                            })
                          }
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
            {paginatedUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-white/40">
                  Eşleşen kullanıcı bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>
            Sayfa <b className="text-white">{safePage}</b> / {totalPages} ({filteredUsers.length} kayıt)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 border border-white/10 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Önceki
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 border border-white/10 flex items-center gap-1"
            >
              Sonraki
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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
              <div
                key={sess.socketId}
                className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="font-bold text-white shrink-0">{sess.username}</span>
                  <span className="font-mono text-amber-300 shrink-0">{sess.ip}</span>
                  <span className="text-white/45 truncate" title={sess.userAgent}>
                    {sess.userAgent}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-white/40">
                    {new Date(sess.connectedAt).toLocaleTimeString('tr-TR')}
                  </span>
                  <button
                    type="button"
                    disabled={revokingSocketId === sess.socketId}
                    onClick={() => handleRevokeSession(sess.socketId)}
                    className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white text-[10px] font-semibold transition disabled:opacity-50"
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
};
