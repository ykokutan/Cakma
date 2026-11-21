import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  Activity,
  Clock,
  Cpu,
  Database,
  Globe,
  Mic,
  MicOff,
  Radio,
  Server as ServerIcon,
  Sliders,
  UserX,
} from 'lucide-react';
import { AvatarView } from '../AvatarView';
import type { User } from '../../types';
import type { AdminDashboardData, RequestAdminDialogFn } from './adminTypes';
import { authFetch } from '../../utils/authFetch';
import { resolveVoiceChannelLabel } from '../../utils/adminHelpers';

interface MetricSnapshot {
  ts: number;
  memoryHeapUsedMb: number;
  memoryRssMb: number;
  onlineUsers: number;
  activeVoiceRooms: number;
  messagesPerMin?: number;
  eventLoopLagMs?: number;
  storageEngine?: string;
  pendingStorageWrites?: number;
}

interface AdminOverviewTabProps {
  adminData: AdminDashboardData | null;
  onlineUsers: User[];
  currentServerHost: string;
  formatUptime: (seconds?: number) => string;
  onGoToSystemTab: () => void;
  onServerMuteUser: (targetUserId: string, muted?: boolean, deafened?: boolean) => void;
  onKickUser: (targetSocketId: string, reason?: string) => void;
  onRequestDialog: RequestAdminDialogFn;
}

const SparklineCard: React.FC<{
  title: string;
  valueLabel: string;
  subLabel: string;
  values: number[];
  secondaryValues?: number[];
  strokeColor: string;
  secondaryStrokeColor?: string;
  unit: string;
}> = ({
  title,
  valueLabel,
  subLabel,
  values,
  secondaryValues,
  strokeColor,
  secondaryStrokeColor,
  unit,
}) => {
  const gradId = useId();
  const width = 260;
  const height = 64;
  const pad = 4;

  const { linePath, areaPath, secondaryPath, minVal, maxVal } = useMemo(() => {
    const src = values.length > 0 ? values : [0];
    const combined = secondaryValues && secondaryValues.length > 0 ? [...src, ...secondaryValues] : src;
    const rawMin = Math.min(...combined);
    const rawMax = Math.max(...combined);
    const span = Math.max(1, rawMax - rawMin);

    const buildPts = (series: number[]) => {
      if (series.length === 1) {
        const y = height - pad - ((series[0] - rawMin) / span) * (height - pad * 2);
        return [
          { x: pad, y },
          { x: width - pad, y },
        ];
      }
      return series.map((v, idx) => {
        const x = pad + (idx / (series.length - 1)) * (width - pad * 2);
        const y = height - pad - ((v - rawMin) / span) * (height - pad * 2);
        return { x, y };
      });
    };

    const pts = buildPts(src);
    const dLine = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const dArea = `${dLine} L ${pts[pts.length - 1].x.toFixed(1)} ${height} L ${pts[0].x.toFixed(1)} ${height} Z`;

    let secD = '';
    if (secondaryValues && secondaryValues.length > 0) {
      const sPts = buildPts(secondaryValues);
      secD = sPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    }

    return {
      linePath: dLine,
      areaPath: dArea,
      secondaryPath: secD,
      minVal: rawMin,
      maxVal: rawMax,
    };
  }, [values, secondaryValues]);

  return (
    <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/55">{title}</div>
          <div className="text-lg font-extrabold text-white mt-0.5">{valueLabel}</div>
        </div>
        <div className="text-right text-[10px] font-mono text-white/45">
          <div>Max: {maxVal} {unit}</div>
          <div>Min: {minVal} {unit}</div>
        </div>
      </div>

      <div className="rounded-xl bg-black/30 border border-white/5 p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16 overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} />
          {secondaryPath && secondaryStrokeColor && (
            <path
              d={secondaryPath}
              fill="none"
              stroke={secondaryStrokeColor}
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.7"
            />
          )}
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex items-center justify-between text-[10px] text-white/45">
        <span>{subLabel}</span>
        <span>Son {values.length || 1} ölçüm (5sn)</span>
      </div>
    </div>
  );
};

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({
  adminData,
  onlineUsers,
  currentServerHost,
  formatUptime,
  onGoToSystemTab,
  onServerMuteUser,
  onKickUser,
  onRequestDialog,
}) => {
  const stats = adminData?.stats;
  const sysCfg = adminData?.systemConfig;
  const servers = adminData?.servers || [];
  const [metricHistory, setMetricHistory] = useState<MetricSnapshot[]>([]);

  useEffect(() => {
    let active = true;

    const seedHistory = async () => {
      try {
        const res = await authFetch(currentServerHost, '/api/admin/metrics-history?limit=60');
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!active || !Array.isArray(data?.points) || data.points.length === 0) return;
        setMetricHistory(
          data.points.slice(-60).map((p: Record<string, unknown>) => ({
            ts: Number(p.ts) || Date.now(),
            memoryHeapUsedMb: Number(p.memoryHeapUsedMb) || 0,
            memoryRssMb: Number(p.memoryRssMb) || 0,
            onlineUsers: Number(p.onlineUsers) || 0,
            activeVoiceRooms: Number(p.activeVoiceRooms) || 0,
            messagesPerMin: Number(p.messagesPerMin) || 0,
            eventLoopLagMs: Number(p.eventLoopLagMs) || 0,
          }))
        );
      } catch {}
    };

    const pollMetrics = async () => {
      try {
        const res = await authFetch(currentServerHost, '/api/metrics');
        if (!res.ok) return;
        const data = await res.json();
        if (!active || typeof data?.memoryHeapUsedMb !== 'number') return;
        setMetricHistory((prev) => [
          ...prev.slice(-59),
          {
            ts: Date.now(),
            memoryHeapUsedMb: Number(data.memoryHeapUsedMb) || 0,
            memoryRssMb: Number(data.memoryRssMb) || 0,
            onlineUsers: Number(data.onlineUsers) || 0,
            activeVoiceRooms: Number(data.activeVoiceRooms) || 0,
            messagesPerMin: typeof data.messagesPerMin === 'number' ? data.messagesPerMin : undefined,
            eventLoopLagMs: typeof data.eventLoopLagMs === 'number' ? data.eventLoopLagMs : undefined,
            storageEngine: typeof data.storageEngine === 'string' ? data.storageEngine : undefined,
            pendingStorageWrites: Number(data.pendingStorageWrites) || 0,
          },
        ]);
      } catch {}
    };

    void seedHistory().then(() => {
      if (active) void pollMetrics();
    });
    const timer = window.setInterval(() => {
      void pollMetrics();
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [currentServerHost]);

  const latestMetric = metricHistory[metricHistory.length - 1];
  const heapSeries =
    metricHistory.length > 0 ? metricHistory.map((m) => m.memoryHeapUsedMb) : [stats?.memoryMB || 0];
  const rssSeries =
    metricHistory.length > 0 ? metricHistory.map((m) => m.memoryRssMb) : undefined;
  const usersSeries =
    metricHistory.length > 0 ? metricHistory.map((m) => m.onlineUsers) : [stats?.activeSocketsCount || 0];
  const voiceSeries =
    metricHistory.length > 0 ? metricHistory.map((m) => m.activeVoiceRooms) : [stats?.activeVoiceRoomsCount || 0];
  const msgRateSeries =
    metricHistory.length > 0 ? metricHistory.map((m) => m.messagesPerMin ?? 0) : [0];
  const lagSeries =
    metricHistory.length > 0 ? metricHistory.map((m) => m.eventLoopLagMs ?? 0) : [0];

  const storageEngineLabel =
    latestMetric?.storageEngine || adminData?.storageEngine || 'json-sharded';
  const livekitStatus = adminData?.livekitStatus;
  const voiceUsers = onlineUsers.filter((u) => Boolean(u.currentVoiceChannelId));

  return (
    <div className="space-y-6">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-xs">
            <span>RAM Heap Kullanımı</span>
            <Cpu className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {latestMetric?.memoryHeapUsedMb ?? stats?.memoryMB ?? 0} MB
          </div>
          <div className="text-[11px] text-emerald-400 font-medium">
            {latestMetric ? `RSS: ${latestMetric.memoryRssMb} MB` : 'Node.js V8 Motoru'}
          </div>
        </div>

        <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-xs">
            <span>Sunucu Çalışma Süresi</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{formatUptime(stats?.uptime)}</div>
          <div className="text-[11px] text-white/40">Kesintisiz Uptime</div>
        </div>

        <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-xs">
            <span>Canlı Soketler / WebRTC</span>
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {latestMetric?.onlineUsers ?? stats?.activeSocketsCount ?? 0}
          </div>
          <div className="text-[11px] text-emerald-400 font-medium">
            {latestMetric?.activeVoiceRooms ?? stats?.activeVoiceRoomsCount ?? 0} Aktif Ses Odası
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
            {adminData?.dedicatedServers?.filter((s) => s.status === 'online').length || 0} Çevrimiçi Sunucu
          </div>
        </div>
      </div>

      {/* Infrastructure Health Strip */}
      <div className="p-3.5 rounded-2xl ios-glass-card border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold ${
              livekitStatus?.reachable
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : livekitStatus?.enabled === false
                ? 'bg-white/5 border-white/10 text-white/60'
                : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
            }`}
            title={livekitStatus?.reason || 'LiveKit SFU durumu'}
          >
            <Activity className="w-3.5 h-3.5" />
            LiveKit SFU:{' '}
            {livekitStatus
              ? livekitStatus.reachable
                ? 'Aktif'
                : livekitStatus.enabled === false
                ? 'Devre Dışı (P2P)'
                : livekitStatus.configured
                ? 'Erişilemiyor'
                : 'Yapılandırılmamış'
              : 'Bilinmiyor'}
          </span>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 font-mono text-[11px]">
            <Database className="w-3.5 h-3.5" />
            Motor: {storageEngineLabel}
          </span>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/75 text-[11px]">
            Bekleyen Yazım: <b className="font-mono text-white">{latestMetric?.pendingStorageWrites ?? 0}</b>
          </span>
        </div>

        <button
          type="button"
          onClick={onGoToSystemTab}
          className="text-[11px] font-semibold text-amber-300 hover:underline"
        >
          Altyapı Ayarları →
        </button>
      </div>

      {/* Live Rolling Metrics Sparklines */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SparklineCard
          title="Bellek Kullanımı Trendi (Heap & RSS)"
          valueLabel={`${heapSeries[heapSeries.length - 1]} MB Heap`}
          subLabel={rssSeries ? `Kesikli çizgi: RSS (${rssSeries[rssSeries.length - 1]} MB)` : 'Canlı V8 Heap'}
          values={heapSeries}
          secondaryValues={rssSeries}
          strokeColor="#38bdf8"
          secondaryStrokeColor="#fbbf24"
          unit="MB"
        />

        <SparklineCard
          title="Aktif Oturumlar & Ses Odaları"
          valueLabel={`${usersSeries[usersSeries.length - 1]} Çevrimiçi`}
          subLabel={`Kesikli çizgi: ${voiceSeries[voiceSeries.length - 1]} Aktif Ses Odası`}
          values={usersSeries}
          secondaryValues={voiceSeries}
          strokeColor="#34d399"
          secondaryStrokeColor="#a78bfa"
          unit=""
        />

        <SparklineCard
          title="Mesaj Hızı & Event Loop"
          valueLabel={`${msgRateSeries[msgRateSeries.length - 1]} msg/dk`}
          subLabel={`Kesikli çizgi: Event Loop ${lagSeries[lagSeries.length - 1]} ms`}
          values={msgRateSeries}
          secondaryValues={lagSeries}
          strokeColor="#a78bfa"
          secondaryStrokeColor="#fb7185"
          unit="msg/dk"
        />
      </div>

      {/* Quick Live Voice Monitor with Resolved Server/Channel & Quick Moderation */}
      <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            Canlı Ses &amp; Ekran Yayını İzleyicisi ({voiceUsers.length})
          </h3>
        </div>
        {voiceUsers.length === 0 ? (
          <p className="text-xs text-white/40 py-2">Şu an ses odalarında aktif kimse bulunmuyor.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {voiceUsers.map((u) => {
              const roomInfo = resolveVoiceChannelLabel(u.currentVoiceChannelId, servers);
              return (
                <div
                  key={u.id}
                  className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden shrink-0 text-sm">
                      <AvatarView avatar={u.avatar} alt={u.username} fallback="👤" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <span className="truncate">{u.username}</span>
                        {u.isScreenSharing && (
                          <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold animate-pulse shrink-0">
                            YAYIN
                          </span>
                        )}
                        {u.isServerMuted && (
                          <span className="text-[9px] bg-rose-500/25 text-rose-300 border border-rose-500/30 px-1 rounded shrink-0">
                            S.Susturulu
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-emerald-400 truncate" title={roomInfo.label}>
                        {roomInfo.label}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onServerMuteUser(u.id, !u.isServerMuted, u.isServerDeafened)}
                      className={`p-1.5 rounded-lg border text-[10px] transition ${
                        u.isServerMuted
                          ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                      }`}
                      title={u.isServerMuted ? 'Sunucu Susturmasını Aç' : 'Sunucuda Sustur'}
                    >
                      {u.isServerMuted ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRequestDialog({
                          type: 'kick_user',
                          username: u.username,
                          onSubmit: (reason) => onKickUser(u.id, reason),
                        })
                      }
                      className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 transition"
                      title="Bağlantıyı Kes"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
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
            Sistem Durumu &amp; Hızlı İşlemler
          </h3>
          <button
            type="button"
            onClick={onGoToSystemTab}
            className="text-[11px] font-semibold text-amber-300 hover:underline"
          >
            Ayarları Düzenle →
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="text-[10px] text-white/40 uppercase">Üye Kaydı</div>
            <div className={`font-bold mt-0.5 ${sysCfg?.registrationEnabled !== false ? 'text-emerald-400' : 'text-rose-400'}`}>
              {sysCfg?.registrationEnabled !== false ? 'Açık' : 'Kapalı'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="text-[10px] text-white/40 uppercase">Bakım Modu</div>
            <div className={`font-bold mt-0.5 ${sysCfg?.maintenanceMode ? 'text-amber-400' : 'text-white/70'}`}>
              {sysCfg?.maintenanceMode ? 'Aktif' : 'Normal'}
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
            <div className="font-bold text-white mt-0.5">{sysCfg?.maxMessageLength ?? 2000} krk</div>
          </div>
        </div>
      </div>

      {/* Storage & Data Observability */}
      {adminData?.storageStats && (
        <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ServerIcon className="w-4 h-4 text-teal-400" />
              Veri Depolama &amp; Disk Analizi
            </h3>
            <span className="text-xs font-mono font-bold text-teal-300">
              Toplam: {(adminData.storageStats.totalBytes / 1024).toFixed(1)} KB
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {adminData.storageStats.files.slice(0, 8).map((f) => (
              <div
                key={f.name}
                className="p-2.5 rounded-xl bg-black/25 border border-white/5 flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="font-mono text-white/75 truncate">{f.name}</span>
                <span className="font-mono text-amber-300 shrink-0">{(f.bytes / 1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
