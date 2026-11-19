import React, { useEffect, useMemo, useState } from 'react';
import {
  HardDrive,
  Trash2,
  Volume2,
  Download,
  Send,
  Calendar,
  LogOut,
  ShieldAlert,
  CheckSquare,
  RefreshCw,
} from 'lucide-react';
import { IssuedLicense, AuditLog, Server } from '../../types';

interface AdminToolsPanelProps {
  currentServerHost: string;
  users: Array<{ username: string; role?: string; isBanned?: boolean; isOnline?: boolean }>;
  licenses: IssuedLicense[];
  logs: AuditLog[];
  servers: Server[];
  defaultWebhookUrl?: string;
  onBanUser?: (username: string) => void;
  onUnbanUser?: (username: string) => void;
}

export const AdminToolsPanel: React.FC<AdminToolsPanelProps> = ({
  currentServerHost,
  users,
  licenses,
  logs,
  servers,
  defaultWebhookUrl = '',
  onBanUser,
  onUnbanUser,
}) => {
  const [diskInfo, setDiskInfo] = useState<{
    dataBytes: number;
    dataFiles: number;
    soundsBytes: number;
    sounds: Array<{ name: string; sizeBytes: number; mtime: string; url: string }>;
    storageEngine?: { engine: string; sqliteAvailable: boolean };
    orphanStats?: { scannedFiles: number; orphanFiles: number; freedBytes: number } | null;
  } | null>(null);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [events, setEvents] = useState<
    Array<{ id: string; serverId: string; title: string; scheduledAt: string; createdBy: string; attendees: string[] }>
  >([]);
  const [webhookUrl, setWebhookUrl] = useState(defaultWebhookUrl);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [dRes, eRes] = await Promise.all([
        fetch(`${currentServerHost}/api/admin/disk-usage`).then((r) => r.json()).catch(() => null),
        fetch(`${currentServerHost}/api/admin/all-events`).then((r) => r.json()).catch(() => null),
      ]);
      if (dRes?.ok) setDiskInfo(dRes);
      if (eRes?.ok && Array.isArray(eRes.events)) setEvents(eRes.events);
    } catch {}
  };

  useEffect(() => {
    loadData();
  }, [currentServerHost]);

  const expiringSoonLicenses = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return licenses.filter((l) => {
      if (!l.expiresAt || l.status === 'revoked') return false;
      const exp = new Date(l.expiresAt).getTime();
      return exp > now && exp - now <= sevenDays;
    });
  }, [licenses]);

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = { Starter: 0, Pro: 0, Enterprise: 0 };
    for (const l of licenses) {
      if (l.status !== 'revoked') {
        counts[l.tier] = (counts[l.tier] || 0) + 1;
      }
    }
    return counts;
  }, [licenses]);

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = (type: 'users' | 'licenses' | 'logs') => {
    if (type === 'users') {
      const rows = ['username,role,isOnline,isBanned', ...users.map((u) => `"${u.username}","${u.role || 'member'}",${Boolean(u.isOnline)},${Boolean(u.isBanned)}`)];
      downloadFile('cakma-kullanicilar.csv', rows.join('\n'), 'text/csv;charset=utf-8');
    } else if (type === 'licenses') {
      const rows = ['licenseKey,tier,maxSlots,status,expiresAt', ...licenses.map((l) => `"${l.licenseKey}","${l.tier}",${l.maxSlots},"${l.status}","${l.expiresAt || 'lifetime'}"`)];
      downloadFile('cakma-lisanslar.csv', rows.join('\n'), 'text/csv;charset=utf-8');
    } else {
      const rows = ['timestamp,type,action,details', ...logs.map((g) => `"${g.timestamp}","${g.type}","${g.action}","${String(g.details || '').replace(/"/g, '""')}"`)];
      downloadFile('cakma-denetim-gunlugu.csv', rows.join('\n'), 'text/csv;charset=utf-8');
    }
  };

  const handleDeleteSound = async (name: string) => {
    try {
      const res = await fetch(`${currentServerHost}/api/admin/sounds/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (res.ok) loadData();
    } catch {}
  };

  const handleDeleteEvent = async (serverId: string, eventId: string) => {
    try {
      const res = await fetch(`${currentServerHost}/api/events/${encodeURIComponent(serverId)}/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
      });
      if (res.ok) loadData();
    } catch {}
  };

  const handleTestWebhook = async () => {
    setWebhookStatus('Gönderiliyor...');
    try {
      const res = await fetch(`${currentServerHost}/api/admin/webhook-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl }),
      });
      const data = await res.json();
      setWebhookStatus(data?.ok ? `✅ Test başarılı (HTTP ${data.status})` : `❌ Hata: ${data?.error || data?.status}`);
    } catch {
      setWebhookStatus('❌ İstek gönderilemedi.');
    }
  };

  const handleBulkForceLogout = async () => {
    if (selectedUsers.length === 0) return;
    let total = 0;
    for (const uname of selectedUsers) {
      try {
        const res = await fetch(`${currentServerHost}/api/admin/users/${encodeURIComponent(uname)}/force-logout`, {
          method: 'POST',
        });
        const data = await res.json();
        total += data?.disconnected || 0;
      } catch {}
    }
    setActionNotice(`${selectedUsers.length} kullanıcı için toplam ${total} oturum sonlandırıldı.`);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">Gelişmiş Yönetim, Raporlar &amp; Disk</h3>
          <p className="text-xs text-white/50 mt-0.5">
            Disk kullanımı, yüklenen sesler, CSV/JSON raporları, lisans uyarıları, etkinlikler ve toplu işlemler.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Yenile</span>
        </button>
      </div>

      {/* 1. Disk & License Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span>Sunucu Veri &amp; Medya Disk Kullanımı</span>
            </div>
            {diskInfo?.storageEngine && (
              <span className="px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-400/30 text-[10px] font-mono text-teal-300">
                {diskInfo.storageEngine.engine}
              </span>
            )}
          </div>
          {diskInfo ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-white/45">Toplam data/</div>
                  <div className="text-base font-bold text-white">{formatBytes(diskInfo.dataBytes)}</div>
                  <div className="text-[10px] text-white/40">{diskInfo.dataFiles} dosya</div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-white/45">Soundboard Sesleri</div>
                  <div className="text-base font-bold text-cyan-300">{formatBytes(diskInfo.soundsBytes)}</div>
                  <div className="text-[10px] text-white/40">{diskInfo.sounds.length} ses dosyası</div>
                </div>
              </div>
              {diskInfo.orphanStats && (
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-white/60">
                    Artık (referanssız) dosya:{' '}
                    <b className={diskInfo.orphanStats.orphanFiles > 0 ? 'text-amber-300' : 'text-emerald-300'}>
                      {diskInfo.orphanStats.orphanFiles} adet ({formatBytes(diskInfo.orphanStats.freedBytes)})
                    </b>
                  </span>
                  <button
                    type="button"
                    disabled={cleaningOrphans || diskInfo.orphanStats.orphanFiles === 0}
                    onClick={async () => {
                      setCleaningOrphans(true);
                      try {
                        const res = await fetch(`${currentServerHost}/api/admin/cleanup-orphans`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ minAgeMs: 0 }),
                        });
                        const data = await res.json();
                        if (data?.ok) {
                          setActionNotice(
                            `${data.result.deletedFiles} artık dosya temizlendi (${formatBytes(data.result.freedBytes)} açıldı).`
                          );
                          setTimeout(() => setActionNotice(null), 4000);
                          loadData();
                        }
                      } catch {}
                      setCleaningOrphans(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 border border-amber-400/30 text-amber-200 font-semibold transition shrink-0"
                  >
                    {cleaningOrphans ? 'Temizleniyor...' : 'Artık Dosyaları Temizle'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-white/40">Yükleniyor...</div>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Aktif Lisans Paket Dağılımı</span>
            {expiringSoonLicenses.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                {expiringSoonLicenses.length} lisans 7 gün içinde dolacak
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs pt-1">
            {Object.entries(tierCounts).map(([tier, cnt]) => (
              <div key={tier} className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-center">
                <div className="text-white/50">{tier}</div>
                <div className="text-base font-bold text-emerald-300">{cnt}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. CSV / JSON Export */}
      <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Download className="w-4 h-4 text-emerald-400" />
          <span>Rapor Dışa Aktarma (CSV &amp; JSON)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportCsv('users')}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition"
          >
            Kullanıcılar (.csv)
          </button>
          <button
            type="button"
            onClick={() => exportCsv('licenses')}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition"
          >
            Lisanslar (.csv)
          </button>
          <button
            type="button"
            onClick={() => exportCsv('logs')}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition"
          >
            Denetim Günlükleri (.csv)
          </button>
          <button
            type="button"
            onClick={() =>
              downloadFile(
                'cakma-sistem-raporu.json',
                JSON.stringify({ users, licenses, logs, serversCount: servers.length }, null, 2),
                'application/json'
              )
            }
            className="px-3 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-xs font-semibold text-blue-300 transition"
          >
            Tam Sistem Raporu (.json)
          </button>
        </div>
      </div>

      {/* 3. Webhook Test */}
      <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Send className="w-4 h-4 text-purple-400" />
          <span>Webhook Bildirim Testi</span>
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-purple-400"
          />
          <button
            type="button"
            onClick={handleTestWebhook}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white transition shrink-0"
          >
            Test Gönder
          </button>
        </div>
        {webhookStatus && <div className="text-xs text-white/80">{webhookStatus}</div>}
      </div>

      {/* 4. Bulk User Actions & Force Logout */}
      <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <CheckSquare className="w-4 h-4 text-amber-400" />
            <span>Toplu Kullanıcı İşlemleri &amp; Oturum Sonlandırma ({selectedUsers.length} seçili)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleBulkForceLogout}
              disabled={selectedUsers.length === 0}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
            >
              <LogOut className="w-3 h-3" />
              <span>Oturumu Kapat</span>
            </button>
            {onBanUser && (
              <button
                type="button"
                onClick={() => {
                  selectedUsers.forEach((u) => onBanUser(u));
                  setSelectedUsers([]);
                }}
                disabled={selectedUsers.length === 0}
                className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
              >
                <ShieldAlert className="w-3 h-3" />
                <span>Toplu Yasakla</span>
              </button>
            )}
            {onUnbanUser && (
              <button
                type="button"
                onClick={() => {
                  selectedUsers.forEach((u) => onUnbanUser(u));
                  setSelectedUsers([]);
                }}
                disabled={selectedUsers.length === 0}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold disabled:opacity-40"
              >
                Yasağı Kaldır
              </button>
            )}
          </div>
        </div>
        {actionNotice && <div className="text-xs text-emerald-300">{actionNotice}</div>}
        <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {users.slice(0, 60).map((u) => {
            const checked = selectedUsers.includes(u.username);
            return (
              <label
                key={u.username}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer transition ${
                  checked ? 'bg-amber-500/15 border-amber-500/40 text-white' : 'bg-black/30 border-white/10 text-white/75'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSelectedUsers((prev) =>
                      prev.includes(u.username) ? prev.filter((x) => x !== u.username) : [...prev, u.username]
                    )
                  }
                />
                <span className="truncate">{u.username}</span>
                {u.isBanned && <span className="text-[10px] text-red-400">(Ban)</span>}
              </label>
            );
          })}
        </div>
      </div>

      {/* 5. Uploaded Sounds & Events Management */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Volume2 className="w-4 h-4 text-blue-400" />
            <span>Yüklenen Soundboard Sesleri ({diskInfo?.sounds.length || 0})</span>
          </div>
          <div className="max-h-44 overflow-y-auto space-y-1.5">
            {!diskInfo || diskInfo.sounds.length === 0 ? (
              <div className="text-xs text-white/40">Sunucuda yüklü ses dosyası yok.</div>
            ) : (
              diskInfo.sounds.map((s) => (
                <div key={s.name} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-black/30 border border-white/10 text-xs">
                  <div className="min-w-0">
                    <div className="text-white truncate">{s.name}</div>
                    <div className="text-[10px] text-white/40">{formatBytes(s.sizeBytes)}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => new Audio(`${currentServerHost}${s.url}`).play().catch(() => {})}
                      className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                      title="Dinle"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSound(s.name)}
                      className="p-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>Tüm Sunucu Etkinlikleri ({events.length})</span>
          </div>
          <div className="max-h-44 overflow-y-auto space-y-1.5">
            {events.length === 0 ? (
              <div className="text-xs text-white/40">Planlanmış etkinlik bulunmuyor.</div>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-black/30 border border-white/10 text-xs">
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">{ev.title}</div>
                    <div className="text-[10px] text-white/40">
                      {ev.createdBy} • {ev.attendees.length} katılımcı
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(ev.serverId, ev.id)}
                    className="p-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 shrink-0"
                    title="Etkinliği Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
