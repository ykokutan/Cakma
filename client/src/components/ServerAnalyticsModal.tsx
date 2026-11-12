import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import {
  X,
  BarChart2,
  Users,
  MessageSquare,
  Clock,
  Volume2,
  Trophy,
  RefreshCw,
  Award,
} from 'lucide-react';

interface ServerAnalyticsModalProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

export const ServerAnalyticsModal: React.FC<ServerAnalyticsModalProps> = ({
  serverId,
  serverName,
  onClose,
}) => {
  const { serverAnalyticsData, fetchServerAnalytics } = useSocket();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchServerAnalytics(serverId);
  }, [serverId, fetchServerAnalytics]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchServerAnalytics(serverId);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const data = serverAnalyticsData;

  const formatHours = (minutes: number) => {
    if (!minutes || minutes < 60) return `${minutes || 0} dk`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}s ${m > 0 ? `${m}d` : ''}`;
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'Efsane':
        return 'from-purple-500 to-pink-500 text-purple-300';
      case 'Elmas':
        return 'from-cyan-400 to-blue-500 text-cyan-300';
      case 'Altın':
        return 'from-yellow-400 to-amber-500 text-yellow-300';
      case 'Gümüş':
        return 'from-slate-300 to-slate-400 text-slate-200';
      default:
        return 'from-amber-700 to-amber-800 text-amber-300';
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in"
    >
      <div
        className="relative w-full max-w-2xl rounded-3xl overflow-hidden ios-glass shadow-2xl border border-white/15 text-white flex flex-col max-h-[85vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BarChart2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">Sunucu Analitiği</h3>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Canlı
                </span>
              </div>
              <p className="text-xs text-white/50">{serverName} • İstatistik ve Rütbe Analizleri</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className={`p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition ${
                isRefreshing ? 'animate-spin' : ''
              }`}
              title="Yenile"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 4 Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
              <div className="flex items-center justify-between text-white/50 text-xs">
                <span>Toplam Üye</span>
                <Users className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-xl font-extrabold text-white">{data?.totalMembers || 0}</div>
              <div className="text-[11px] text-emerald-400 font-medium">
                {data?.onlineMembers || 0} çevrimiçi
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
              <div className="flex items-center justify-between text-white/50 text-xs">
                <span>Toplam Mesaj</span>
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-xl font-extrabold text-white">{data?.totalMessages || 0}</div>
              <div className="text-[11px] text-white/40">kanallarda paylaşılan</div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
              <div className="flex items-center justify-between text-white/50 text-xs">
                <span>Toplam Ses</span>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl font-extrabold text-white">
                {formatHours(data?.totalVoiceMinutes || 0)}
              </div>
              <div className="text-[11px] text-amber-400/80">sesli sohbet süresi</div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
              <div className="flex items-center justify-between text-white/50 text-xs">
                <span>Ses Odaları</span>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-extrabold text-white">
                {data?.popularVoiceChannels?.length || 0}
              </div>
              <div className="text-[11px] text-white/40">aktif ses kanalı</div>
            </div>
          </div>

          {/* Section: En Aktif Metin Kanalları */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-white/80">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span>En Aktif Metin Kanalları</span>
              </div>
              <span className="text-[11px] text-white/40">Mesaj Hacmi</span>
            </div>

            <div className="space-y-2.5 pt-1">
              {data && data.channelMessageCounts && data.channelMessageCounts.length > 0 ? (
                data.channelMessageCounts.map((ch, idx) => {
                  const maxCount = Math.max(...data.channelMessageCounts.map((c) => c.count), 1);
                  const pct = Math.round((ch.count / maxCount) * 100);

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-white/80">{ch.channelName}</span>
                        <span className="text-white/50 font-mono">{ch.count} mesaj</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden border border-white/5">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(6, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-4 text-xs text-white/40">
                  Henüz mesaj verisi toplanmadı.
                </div>
              )}
            </div>
          </div>

          {/* Section: En Popüler Ses Odaları & Rütbe Dağılımı */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Popüler Ses Odaları */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <span>Popüler Ses Odaları</span>
              </div>

              <div className="space-y-2 pt-1">
                {data && data.popularVoiceChannels && data.popularVoiceChannels.length > 0 ? (
                  data.popularVoiceChannels.map((vCh, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-xs font-mono text-white/30">#{idx + 1}</span>
                        <span className="font-medium text-white/90 truncate">{vCh.channelName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold">
                        <Users className="w-3 h-3" />
                        <span>{vCh.userCount}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-3 text-xs text-white/40">
                    Aktif ses odası bulunmuyor.
                  </div>
                )}
              </div>
            </div>

            {/* Rütbe & Seviye Dağılımı */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Rütbe & Kademe Dağılımı</span>
              </div>

              <div className="space-y-2 pt-1">
                {data && data.tierDistribution && data.tierDistribution.length > 0 ? (
                  data.tierDistribution.map((t, idx) => {
                    const totalRanked = Math.max(
                      data.tierDistribution.reduce((acc, curr) => acc + curr.count, 0),
                      1
                    );
                    const pct = Math.round((t.count / totalRanked) * 100);

                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-white/80">
                            <Award className="w-3.5 h-3.5 text-amber-400" />
                            {t.tier}
                          </span>
                          <span className="text-white/50 text-[11px] font-mono">
                            {t.count} üye (%{pct})
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/5">
                          <div
                            className={`h-full bg-gradient-to-r ${getTierColor(t.tier)} rounded-full`}
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-3 text-xs text-white/40">
                    Henüz rütbe verisi bulunmuyor.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
