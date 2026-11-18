import React, { useEffect, useRef, useState } from 'react';
import {
  Monitor,
  Volume2,
  VolumeX,
  Globe,
  Users,
  Lock,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  Server,
  Share2,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import {
  ScreenShareConnectionMode,
  ScreenSharePreset,
  ScreenSharePrivacy,
  ScreenShareSettings,
} from '../types';

interface GoLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoLive: (settings: ScreenShareSettings, previewStream?: MediaStream | null) => Promise<void>;
}

const STORAGE_KEY = 'cakma_screen_share_settings';

const DEFAULT_SETTINGS: ScreenShareSettings = {
  preset: 'source',
  audioEnabled: true,
  masterVolume: 100,
  privacy: 'public',
  resolution: 'source',
  fps: 30,
  bitrateKbps: 10000,
  audioBitrateKbps: 320,
  viewerLimit: 0,
  connectionMode: 'p2p',
  hdrEnabled: false,
};

const PRESET_MAP: Record<
  ScreenSharePreset,
  { resolution: ScreenShareSettings['resolution']; fps: 5 | 30 | 60; bitrateKbps: number }
> = {
  '360': { resolution: '360', fps: 30, bitrateKbps: 1500 },
  '480': { resolution: '480', fps: 30, bitrateKbps: 2500 },
  '720': { resolution: '720', fps: 30, bitrateKbps: 4500 },
  '1080': { resolution: '1080', fps: 60, bitrateKbps: 8000 },
  '1440': { resolution: '1440', fps: 60, bitrateKbps: 12000 },
  source: { resolution: 'source', fps: 30, bitrateKbps: 10000 },
  presentation: { resolution: 'source', fps: 5, bitrateKbps: 3000 },
};

const RESOLUTION_DIMS: Record<Exclude<ScreenShareSettings['resolution'], 'source'>, { width: number; height: number }> = {
  '360': { width: 640, height: 360 },
  '480': { width: 854, height: 480 },
  '720': { width: 1280, height: 720 },
  '1080': { width: 1920, height: 1080 },
  '1440': { width: 2560, height: 1440 },
};

export const GoLiveModal: React.FC<GoLiveModalProps> = ({ isOpen, onClose, onGoLive }) => {
  const [settings, setSettings] = useState<ScreenShareSettings>(() => {
    const defaultHdr = typeof window !== 'undefined' && localStorage.getItem('cakma_default_stream_hdr') === 'true';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, hdrEnabled: defaultHdr, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return { ...DEFAULT_SETTINGS, hdrEnabled: defaultHdr };
  });

  const [showAdvanced, setShowAdvanced] = useState(true);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  useEffect(() => {
    if (!isOpen && previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
      setPreviewStream(null);
    }
    if (!isOpen) {
      setErrorMsg(null);
      setIsStarting(false);
    }
  }, [isOpen]);

  // Apply resolution/fps changes live to preview track if already captured
  useEffect(() => {
    if (!previewStream) return;
    const videoTrack = previewStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const constraints: MediaTrackConstraints = {
      frameRate: { ideal: settings.fps, max: settings.fps },
    };
    if (settings.resolution !== 'source') {
      const dims = RESOLUTION_DIMS[settings.resolution];
      constraints.width = { ideal: dims.width, max: dims.width };
      constraints.height = { ideal: dims.height, max: dims.height };
    }
    videoTrack.applyConstraints(constraints).catch(() => {});
  }, [settings.resolution, settings.fps, previewStream]);

  if (!isOpen) return null;

  const updateSettings = (patch: Partial<ScreenShareSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handlePresetChange = (preset: ScreenSharePreset) => {
    const mapped = PRESET_MAP[preset];
    updateSettings({
      preset,
      resolution: mapped.resolution,
      fps: mapped.fps,
      bitrateKbps: mapped.bitrateKbps,
    });
  };

  const handlePickSource = async () => {
    setErrorMsg(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setErrorMsg('Ekran paylaşımı için güvenli bağlantı (HTTPS veya masaüstü uygulaması) gereklidir.');
      return;
    }
    try {
      const videoConstraint: MediaTrackConstraints & { cursor?: string } = {
        cursor: 'always',
        frameRate: { ideal: settings.fps, max: settings.fps },
      };
      if (settings.resolution !== 'source') {
        const dims = RESOLUTION_DIMS[settings.resolution];
        videoConstraint.width = { ideal: dims.width, max: dims.width };
        videoConstraint.height = { ideal: dims.height, max: dims.height };
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraint,
        audio: settings.audioEnabled,
      });

      if (previewStream) {
        previewStream.getTracks().forEach((t) => t.stop());
      }

      const vt = stream.getVideoTracks()[0];
      if (vt) {
        vt.onended = () => {
          setPreviewStream(null);
        };
      }
      setPreviewStream(stream);
    } catch {
      setErrorMsg('Ekran seçimi iptal edildi veya izin verilmedi.');
    }
  };

  const handleCancel = () => {
    if (previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
      setPreviewStream(null);
    }
    onClose();
  };

  const handleStartBroadcast = async () => {
    setIsStarting(true);
    setErrorMsg(null);
    try {
      await onGoLive(settings, previewStream);
      setPreviewStream(null);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Yayın başlatılamadı.');
    } finally {
      setIsStarting(false);
    }
  };

  const presets: { id: ScreenSharePreset; label: string }[] = [
    { id: '360', label: '360p' },
    { id: '480', label: '480p' },
    { id: '720', label: '720p' },
    { id: '1080', label: '1080p' },
    { id: '1440', label: '1440p' },
    { id: 'source', label: 'Kaynak' },
    { id: 'presentation', label: 'Sunum' },
  ];

  const resolutions: { id: ScreenShareSettings['resolution']; label: string }[] = [
    { id: '360', label: '360p' },
    { id: '480', label: '480p' },
    { id: '720', label: '720p' },
    { id: '1080', label: '1080p' },
    { id: '1440', label: '1440p' },
    { id: 'source', label: 'Kaynak' },
  ];

  const audioBitrates: (64 | 96 | 128 | 192 | 256 | 320)[] = [64, 96, 128, 192, 256, 320];
  const estimatedMbps = ((settings.bitrateKbps + (settings.audioEnabled ? settings.audioBitrateKbps : 0)) / 1000).toFixed(1);
  const displaySupportsHdr =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(dynamic-range: high)').matches;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-[560px] max-h-[92vh] flex flex-col rounded-2xl border border-white/10 bg-[#0d1424] text-slate-100 shadow-2xl overflow-hidden">
        {/* Top Preview Area */}
        <div className="p-4 pb-2 space-y-2">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-[#070b14] flex items-center justify-center group">
            {previewStream ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold backdrop-blur-md">
                  ● Canlı Önizleme
                </div>
                <button
                  type="button"
                  onClick={handlePickSource}
                  className="absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-lg bg-black/70 hover:bg-blue-600/90 px-2.5 py-1.5 text-xs font-medium text-white border border-white/15 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Kaynağı Değiştir
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center px-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Monitor className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">Yayın Önizlemesi</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Önizleme için kaynak seçebilir veya ayarları yapıp doğrudan &quot;Yayını Başlat&quot; diyebilirsiniz.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePickSource}
                  className="rounded-lg bg-white/10 hover:bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white border border-white/10 transition"
                >
                  Ekran / Pencere Seç
                </button>
              </div>
            )}
          </div>

          {/* Live Stream Quality Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] text-slate-300">
            <span className="font-medium">
              🎬 {settings.resolution === 'source' ? 'Kaynak Çözünürlük' : `${settings.resolution}p`} · {settings.fps} FPS · {settings.bitrateKbps.toLocaleString('tr-TR')} Kbps
            </span>
            <span className="text-cyan-300 font-mono">
              ~{estimatedMbps} Mbps yükleme • {settings.audioEnabled ? `Ses %${settings.masterVolume}` : 'Ses Kapalı'}
            </span>
          </div>
        </div>

        {/* Scrollable Settings Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {errorMsg && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Temel Ayarlar */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Temel Ayarlar
            </h3>

            {/* Hazır Profil */}
            <div className="flex items-center justify-between gap-2">
              <div
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300 shrink-0"
                title="Çözünürlük, FPS ve bit hızını tek tıkla kullanım senaryonuza göre ayarlar."
              >
                <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                <span>Hazır Profil</span>
              </div>
              <div className="flex flex-wrap items-center rounded-lg bg-[#161f33] p-0.5 border border-white/5">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetChange(p.id)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md transition ${
                      settings.preset === p.id
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Uygulama / Sistem Sesi */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
                  title="Paylaşılan pencere veya sistem sesinin izleyicilere iletilmesini sağlar."
                >
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                  <span>Uygulama / Sistem Sesi</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateSettings({ audioEnabled: !settings.audioEnabled })}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                    settings.audioEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                  title={settings.audioEnabled ? 'Yayın Sesi Açık' : 'Yayın Sesi Kapalı'}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.audioEnabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div
                className={`rounded-xl border border-white/10 bg-[#121a2d] p-3 space-y-2 transition-opacity ${
                  settings.audioEnabled ? 'opacity-100' : 'opacity-45 pointer-events-none'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    {settings.masterVolume > 0 && settings.audioEnabled ? (
                      <Volume2 className="w-4 h-4 text-blue-400" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Ana Ses Seviyesi</span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-1 max-w-[230px]">
                    <span className="text-[11px] font-mono text-slate-300 w-9 text-right">
                      {settings.masterVolume}%
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.masterVolume}
                      onChange={(e) => updateSettings({ masterVolume: Number(e.target.value) })}
                      className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Tarayıcı/WebView2 güvenlik politikası gereği sistem veya sekme sesi tek akış olarak yakalanır ve Ana Ses Seviyesi ile dengelenir.
                </p>
              </div>
            </div>

            {/* Gizlilik */}
            <div className="flex items-center justify-between gap-2">
              <div
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
                title="Yayını kimlerin izleyebileceğini belirler."
              >
                <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                <span>Gizlilik</span>
              </div>
              <div className="flex items-center rounded-lg bg-[#161f33] p-0.5 border border-white/5">
                {(
                  [
                    { id: 'public', label: 'Herkese Açık', icon: Globe },
                    { id: 'contacts', label: 'Arkadaşlar', icon: Users },
                    { id: 'private', label: 'Özel', icon: Lock },
                  ] as { id: ScreenSharePrivacy; label: string; icon: any }[]
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => updateSettings({ privacy: id })}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition ${
                      settings.privacy === id
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Gelişmiş Ayarlar */}
          <div className="pt-1 border-t border-white/10">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between py-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition"
            >
              <span>Gelişmiş Ayarlar</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-2.5">
                {/* Çözünürlük */}
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex items-center gap-1.5 text-xs text-slate-300"
                    title="Yayının video çözünürlüğünü belirler. Kaynak seçeneği monitörünüzün doğal çözünürlüğünü kullanır."
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                    <span>Çözünürlük</span>
                  </div>
                  <div className="flex items-center rounded-lg bg-[#161f33] p-0.5 border border-white/5">
                    {resolutions.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => updateSettings({ resolution: r.id })}
                        className={`px-2 py-1 text-[11px] font-medium rounded-md transition ${
                          settings.resolution === r.id
                            ? 'bg-blue-600 text-white shadow'
                            : 'text-slate-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Kare Hızı (FPS) */}
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex items-center gap-1.5 text-xs text-slate-300"
                    title="Oyunlar için 60 FPS, masaüstü ve sunumlar için 30 FPS veya 5 FPS önerilir."
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                    <span>Kare Hızı (FPS)</span>
                  </div>
                  <div className="flex items-center rounded-lg bg-[#161f33] p-0.5 border border-white/5">
                    {([5, 30, 60] as const).map((fps) => (
                      <button
                        key={fps}
                        type="button"
                        onClick={() => updateSettings({ fps })}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${
                          settings.fps === fps
                            ? 'bg-blue-600 text-white shadow'
                            : 'text-slate-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {fps}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video Bit Hızı */}
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex items-center gap-1.5 text-xs text-slate-300"
                    title="Yüksek bit hızı görüntüyü netleştirir ancak daha fazla yükleme (upload) hızı gerektirir."
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                    <span>Video Bit Hızı</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({ bitrateKbps: Math.max(500, settings.bitrateKbps - 500) })
                      }
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-red-500/30 text-red-400 flex items-center justify-center transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={500}
                      max={25000}
                      step={500}
                      value={settings.bitrateKbps}
                      onChange={(e) =>
                        updateSettings({
                          bitrateKbps: Math.min(25000, Math.max(500, Number(e.target.value) || 500)),
                        })
                      }
                      className="w-20 rounded-full bg-[#161f33] border border-white/10 px-2.5 py-1 text-center text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-xs text-slate-400">Kbps</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({ bitrateKbps: Math.min(25000, settings.bitrateKbps + 500) })
                      }
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-emerald-500/30 text-emerald-400 flex items-center justify-center transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Ses Bit Hızı */}
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex items-center gap-1.5 text-xs text-slate-300"
                    title="Yayın sesinin kalitesini belirler. Müzik ve oyunlar için 192-320 Kbps önerilir."
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                    <span>Ses Bit Hızı (Kbps)</span>
                  </div>
                  <div className="flex items-center rounded-lg bg-[#161f33] p-0.5 border border-white/5">
                    {audioBitrates.map((ab) => (
                      <button
                        key={ab}
                        type="button"
                        onClick={() => updateSettings({ audioBitrateKbps: ab })}
                        className={`px-2 py-1 text-[11px] font-medium rounded-md transition ${
                          settings.audioBitrateKbps === ab
                            ? 'bg-blue-600 text-white shadow'
                            : 'text-slate-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {ab}
                      </button>
                    ))}
                  </div>
                </div>

                {/* HDR Yayın Modu (10-bit AV1 / VP9) */}
                <div className="p-2.5 rounded-xl bg-[#161f33]/80 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-rose-500 text-[10px] font-black text-white tracking-wider">
                        HDR
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <span>HDR Yayın Modu (10-bit AV1 / VP9)</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                              displaySupportsHdr
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-white/10 text-slate-400'
                            }`}
                          >
                            {displaySupportsHdr ? 'HDR Ekran Algılandı' : 'SDR Ekran'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          10-bit destekli AV1/VP9 codec önceliği ve yüksek bitrate (≥18 Mbps) kullanır.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextHdr = !settings.hdrEnabled;
                        updateSettings({
                          hdrEnabled: nextHdr,
                          bitrateKbps: nextHdr ? Math.max(settings.bitrateKbps, 18000) : settings.bitrateKbps,
                        });
                      }}
                      className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                        settings.hdrEnabled ? 'bg-amber-500' : 'bg-white/15'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          settings.hdrEnabled ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  {settings.hdrEnabled && (
                    <p className="text-[10px] text-amber-300/85 leading-relaxed">
                      Not: WebRTC codec tercihi AV1/VP9 10-bit olarak ayarlanır; Windows/WebView2 ekran yakalamanın donanımsal HDR metadata geçişi ekran sürücüsü ve tarayıcı motoruna bağlıdır.
                    </p>
                  )}
                </div>

                {/* İzleyici Sınırı */}
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex items-center gap-1.5 text-xs text-slate-300"
                    title="Aynı anda yayını izleyebilecek maksimum kişi sayısı (0 = Sınırsız)."
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                    <span>İzleyici Sınırı <span className="text-[10px] text-slate-500">(0 = Sınırsız)</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({ viewerLimit: Math.max(0, settings.viewerLimit - 1) })
                      }
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-red-500/30 text-red-400 flex items-center justify-center transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settings.viewerLimit}
                      onChange={(e) =>
                        updateSettings({
                          viewerLimit: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-16 rounded-full bg-[#161f33] border border-white/10 px-2.5 py-1 text-center text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({ viewerLimit: Math.min(100, settings.viewerLimit + 1) })
                      }
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-emerald-500/30 text-emerald-400 flex items-center justify-center transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Bağlantı Modu */}
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex items-center gap-1.5 text-xs text-slate-300"
                    title="Doğrudan (P2P) en düşük gecikmeyi sunar; Sunucu modu kalabalık odalarda daha kararlıdır."
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                    <span>Bağlantı Modu</span>
                  </div>
                  <div className="flex items-center rounded-lg bg-[#161f33] p-0.5 border border-white/5">
                    {(
                      [
                        { id: 'p2p', label: 'Doğrudan (P2P)', icon: Share2 },
                        { id: 'server', label: 'Sunucu', icon: Server },
                      ] as { id: ScreenShareConnectionMode; label: string; icon: any }[]
                    ).map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => updateSettings({ connectionMode: id })}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition ${
                          settings.connectionMode === id
                            ? 'bg-blue-600 text-white shadow'
                            : 'text-slate-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-[#0a101d]">
          <button
            type="button"
            onClick={handleCancel}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg hover:bg-white/5 transition"
          >
            Geri
          </button>
          <button
            type="button"
            onClick={handleStartBroadcast}
            disabled={isStarting}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/25 transition"
          >
            {isStarting ? 'Başlatılıyor...' : 'Yayını Başlat'}
          </button>
        </div>
      </div>
    </div>
  );
};
