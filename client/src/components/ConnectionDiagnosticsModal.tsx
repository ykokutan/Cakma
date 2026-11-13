import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import {
  X,
  Activity,
  Wifi,
  ShieldCheck,
  Zap,
  RefreshCw,
  Server,
  Layers,
  Radio,
  CheckCircle2,
  Mic,
} from 'lucide-react';

interface ConnectionDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionDiagnosticsModal: React.FC<ConnectionDiagnosticsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    ping,
    jitter,
    packetLoss,
    pingHistory,
    measurePing,
    currentServerHost,
    isDedicatedServer,
    micVolumeLevel,
    isSpeaking,
    isMuted,
    connectedVoiceChannelId,
    activeServer,
  } = useSocket();

  const connectedVoiceChannel = activeServer?.channels.find(
    (c) => c.id === connectedVoiceChannelId
  );

  const [isTesting, setIsTesting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setLastUpdated(new Date().toLocaleTimeString('tr-TR'));
  }, [isOpen, ping, pingHistory.length]);

  if (!isOpen) return null;

  const handleManualTest = async () => {
    setIsTesting(true);
    await measurePing();
    setTimeout(() => setIsTesting(false), 500);
  };

  // Calculate Min, Avg, Max ping
  const validPings = pingHistory.length > 0 ? pingHistory : [ping];
  const minPing = Math.min(...validPings);
  const maxPing = Math.max(...validPings);
  const avgPing = Math.round(
    validPings.reduce((acc, curr) => acc + curr, 0) / validPings.length
  );

  // SVG Chart Geometry
  const chartWidth = 540;
  const chartHeight = 140;
  const maxScale = Math.max(50, Math.ceil(maxPing * 1.25));

  const points = validPings.map((val, index) => {
    const x = (index / Math.max(1, validPings.length - 1)) * chartWidth;
    const y = chartHeight - (val / maxScale) * (chartHeight - 20) - 10;
    return { x, y, val };
  });

  const pathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`
    : '';

  const lastPoint = points[points.length - 1] || { x: 0, y: 0 };

  const getQualityStatus = (ms: number) => {
    if (ms <= 30) return { label: 'Mükemmel Bağlantı', color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' };
    if (ms <= 75) return { label: 'İyi Bağlantı', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' };
    return { label: 'Yüksek Gecikme', color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30' };
  };

  const quality = getQualityStatus(ping);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-2xl bg-[#121319]/95 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600/30 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Bağlantı ve Ağ Teşhisi (RTC Diagnostics)
                </h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${quality.bg} ${quality.color} ${quality.border}`}>
                  {quality.label}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  CANLI · 1s
                </span>
              </div>
              <p className="text-xs text-white/40 mt-0.5">
                {isDedicatedServer ? `Özel Sunucu: ${currentServerHost}` : 'Ana Sunucu: ses.yahyakemalokutan.com · Port 4000'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Top Primary Stats Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-white/50 text-[11px] font-medium">
                <span>Gecikme (Ping)</span>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white font-mono">{ping}</span>
                <span className="text-xs text-white/40">ms</span>
              </div>
              <div className="mt-1 text-[10px] text-emerald-400 font-medium">
                {ping <= 25 ? 'Ultra Düşük RTT' : ping <= 75 ? 'Stabil RTT' : 'Yüksek RTT'}
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-white/50 text-[11px] font-medium">
                <span>Jitter (Sapma)</span>
                <Zap className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white font-mono">{jitter}</span>
                <span className="text-xs text-white/40">ms</span>
              </div>
              <div className="mt-1 text-[10px] text-blue-400 font-medium">
                {jitter <= 5 ? 'Dalgalanma Yok' : jitter <= 20 ? 'Hafif Dalgalanma' : 'Yüksek Sapma'}
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-white/50 text-[11px] font-medium">
                <span>Paket Kaybı</span>
                <Layers className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white font-mono">{packetLoss.toFixed(1)}</span>
                <span className="text-xs text-white/40">%</span>
              </div>
              <div className={`mt-1 text-[10px] font-medium ${packetLoss === 0 ? 'text-emerald-400' : packetLoss < 2 ? 'text-amber-400' : 'text-red-400'}`}>
                {packetLoss === 0 ? 'Kayıpsız Akış' : packetLoss < 2 ? 'Düşük Paket Kaybı' : 'Yüksek Paket Kaybı'}
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-white/50 text-[11px] font-medium">
                <span>Ses Bitrate</span>
                <Radio className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white font-mono">{activeServer?.bitrateKbps || 128}</span>
                <span className="text-xs text-white/40">kbps</span>
              </div>
              <div className="mt-1 text-[10px] text-amber-300 font-medium">
                {(activeServer?.bitrateKbps || 128) >= 256 ? 'Ultra Studio Kalite' : (activeServer?.bitrateKbps || 128) >= 128 ? 'Standart HD' : 'Veri Tasarruf Modu'}
              </div>
            </div>
          </div>

          {/* Real-time Latency Chart */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/80">Canlı Gecikme Dalga Grafiği</span>
                <span className="text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded-full font-mono">
                  Son 30 Örnek
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono text-white/50">
                <span>Min: <b className="text-emerald-400">{minPing}ms</b></span>
                <span>Ort: <b className="text-blue-400">{avgPing}ms</b></span>
                <span>Maks: <b className="text-amber-400">{maxPing}ms</b></span>
              </div>
            </div>

            {/* SVG Visualizer */}
            <div className="relative w-full h-[140px] bg-black/40 rounded-xl overflow-hidden border border-white/5 p-1 flex items-center justify-center">
              {/* Background horizontal grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between p-3 pointer-events-none opacity-20 text-[9px] font-mono text-white/40">
                <div className="border-b border-white/20 pb-0.5">{maxScale}ms</div>
                <div className="border-b border-white/10 pb-0.5">{Math.round(maxScale / 2)}ms</div>
                <div>0ms</div>
              </div>

              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="pingAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {areaD && (
                  <path d={areaD} fill="url(#pingAreaGradient)" />
                )}

                {pathD && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Animated Current Point Dot */}
                {lastPoint && (
                  <g transform={`translate(${lastPoint.x}, ${lastPoint.y})`}>
                    <circle r="6" fill="#34d399" opacity="0.3" className="animate-ping" />
                    <circle r="3.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                  </g>
                )}
              </svg>
            </div>
          </div>

          {/* Detailed RTC & Audio Pipeline Info */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider px-1">
              Protokol & Ses İletim Mimarisi
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center justify-between">
                <span className="text-white/50">Ses Kodeği</span>
                <span className="font-semibold text-white font-mono">Opus 48.000 Hz HD</span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center justify-between">
                <span className="text-white/50">Şifreleme (Protokol)</span>
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  DTLS-SRTP 128-bit
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center justify-between">
                <span className="text-white/50">WebRTC Ağ Modu</span>
                <span className="font-semibold text-white">Full-Mesh Peer & STUN</span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center justify-between">
                <span className="text-white/50">Giriş Filtreleme</span>
                <span className="font-semibold text-blue-400">RNNoise + Yankı Önleme</span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center justify-between">
                <span className="text-white/50">Aktif Ses Kanalı</span>
                <span className="font-semibold text-white truncate max-w-[140px]">
                  {connectedVoiceChannel ? connectedVoiceChannel.name : 'Ses Odasında Değil'}
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center justify-between">
                <span className="text-white/50">Sunucu Bölgesi</span>
                <span className="font-semibold text-white flex items-center gap-1">
                  <Server className="w-3.5 h-3.5 text-amber-400" />
                  İstanbul / TR Edge Node
                </span>
              </div>
            </div>
          </div>

          {/* Real-time Microphone Input Bar */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Mic className={`w-3.5 h-3.5 ${isSpeaking ? 'text-emerald-400' : 'text-white/40'}`} />
                <span className="font-semibold text-white/80">Mikrofon Seviye Göstergesi</span>
                {isMuted && <span className="text-[10px] text-red-400 font-bold">(Susturuldu)</span>}
              </div>
              <span className="text-[11px] font-mono text-white/50">
                {isSpeaking ? 'Sinyal Algılandı' : 'Sessiz'}
              </span>
            </div>

            <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/5 p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-75 ${
                  micVolumeLevel > 65
                    ? 'bg-amber-400'
                    : micVolumeLevel > 15
                    ? 'bg-emerald-400'
                    : 'bg-white/20'
                }`}
                style={{ width: `${Math.min(100, Math.max(3, micVolumeLevel))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-white/40">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>
              Anlık 1 saniyelik RTT & paket kaybı telemetrisi aktif{lastUpdated ? ` · Son: ${lastUpdated}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualTest}
              disabled={isTesting}
              className="px-4 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-white border border-blue-400/30 text-xs font-semibold flex items-center gap-2 transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Ölçülüyor...' : 'Şimdi Test Et'}</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
