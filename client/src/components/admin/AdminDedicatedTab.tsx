import React, { useState } from 'react';
import { Ban, Check, Copy, ExternalLink, Globe, HardDrive, Key, Users } from 'lucide-react';
import type { AdminDashboardData } from './adminTypes';

interface AdminDedicatedTabProps {
  adminData: AdminDashboardData | null;
  formatUptime: (seconds?: number) => string;
  onConnectDedicated: (host: string) => void;
  onCloseModal: () => void;
}

export const AdminDedicatedTab: React.FC<AdminDedicatedTabProps> = ({
  adminData,
  formatUptime,
  onConnectDedicated,
  onCloseModal,
}) => {
  const [copiedServerId, setCopiedServerId] = useState<string | null>(null);

  const handleCopyHost = (host: string, id: string) => {
    navigator.clipboard.writeText(host);
    setCopiedServerId(id);
    setTimeout(() => setCopiedServerId(null), 2000);
  };

  const dedicatedServers = adminData?.dedicatedServers || [];

  return (
    <div className="space-y-6">
      {/* Summary Header Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-xs">
            <span>Açılmış Dedicated Sunucular</span>
            <Globe className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{dedicatedServers.length}</div>
          <div className="text-[11px] text-emerald-400 font-medium">
            {dedicatedServers.filter((s) => s.status === 'online').length} Aktif Çevrimiçi
          </div>
        </div>

        <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-xs">
            <span>Toplam Dedicated Kullanıcı</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {dedicatedServers.reduce((acc, s) => acc + (s.status === 'online' ? s.onlineCount : 0), 0)}
          </div>
          <div className="text-[11px] text-white/40">Bağlı Canlı Katılımcı</div>
        </div>

        <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-xs">
            <span>Toplam Slot Lisansı</span>
            <HardDrive className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {dedicatedServers.reduce((acc, s) => acc + s.maxSlots, 0)} Slot
          </div>
          <div className="text-[11px] text-amber-400 font-medium">Kriptografik İmzalı</div>
        </div>

        <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-xs">
            <span>Lisans Doğrulama Motoru</span>
            <Key className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400">HMAC-SHA256</div>
          <div className="text-[11px] text-white/40">Resmi İstemci Korumalı</div>
        </div>
      </div>

      {/* Dedicated Server List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            Canlı Sinyal Veren Dedicated Sunucu Listesi ({dedicatedServers.length})
          </h3>
          <span className="text-[11px] text-white/40">Heartbeat sinyaliyle otomatik yenilenir</span>
        </div>

        {dedicatedServers.length === 0 ? (
          <div className="p-10 rounded-2xl ios-glass-card border border-white/10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/40">
              <Globe className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-white">Henüz Açılmış Dedicated Sunucu Bulunmuyor</div>
            <p className="text-xs text-white/50 max-w-md mx-auto">
              Kullanıcılar veya müşteriler{' '}
              <code className="text-amber-300 bg-white/10 px-1 py-0.5 rounded">
                dedicated-server\start-dedicated-server.bat
              </code>{' '}
              dosyasını kendi VPS veya bilgisayarlarında çalıştırdığında anında bu ekranda canlı olarak belirecektir.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {dedicatedServers.map((srv) => {
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
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
                          isRevoked
                            ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                            : isOnline
                            ? 'bg-gradient-to-tr from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25'
                            : 'bg-white/10 text-white/40'
                        }`}
                      >
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
                              ÇEVRİMDIŞI
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-semibold border border-purple-500/30">
                            {srv.tier} Paket
                          </span>
                        </div>

                        <div className="text-xs text-white/60 flex items-center gap-2 flex-wrap">
                          <span>
                            Lisans Sahibi: <b className="text-white/80">{srv.licensee}</b>
                          </span>
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
                            {copiedServerId === srv.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>

                        <div className="text-[11px] text-white/40 flex items-center gap-3 pt-0.5">
                          <span>
                            Kanallar: <b>{srv.channelsCount}</b>
                          </span>
                          <span>•</span>
                          <span>
                            Çalışma Süresi: <b>{formatUptime(srv.uptimeSeconds)}</b>
                          </span>
                          <span>•</span>
                          <span>
                            Son Sinyal: <b>{new Date(srv.lastHeartbeat).toLocaleTimeString('tr-TR')}</b>
                          </span>
                        </div>
                      </div>
                    </div>

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
                            onConnectDedicated(srv.host);
                            onCloseModal();
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
    </div>
  );
};
