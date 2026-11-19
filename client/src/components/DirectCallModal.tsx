import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useSocket } from '../context/SocketContext';
import { useDirectCallQuality } from '../context/PresenceStore';
import { AvatarView } from './AvatarView';
import { playCallRingtone } from '../utils/tsSoundEffects';
import type {
  DirectScreenShareOptions,
  RemoteAssistPermissions,
} from '../types';
import {
  classifyConnectionQuality,
  formatCallDuration,
} from '../utils/remoteAssistHelpers';

const RemoteAssistModal = lazy(() =>
  import('./RemoteAssistModal').then((m) => ({ default: m.RemoteAssistModal }))
);
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Headphones,
  Volume2,
  MonitorUp,
  MonitorOff,
  MousePointerClick,
  ShieldAlert,
  ShieldCheck,
  Hand,
  Video,
  VideoOff,
  MessageSquare,
  ChevronDown,
  Pause,
  Play,
  Send,
  X,
  Wifi,
} from 'lucide-react';

const QUICK_DECLINE_REPLIES = [
  'Şu an müsait değilim, birazdan arayacağım.',
  'Şu an görüşme yapamıyorum, buradan yazabilirsin.',
  '10 dakika sonra tekrar dener misin?',
];

export const DirectCallModal: React.FC = () => {
  const {
    directCall,
    directCallToasts,
    dismissDirectCallToast,
    activeServer,
    activeDMUser,
    openDirectMessage,
    acceptDirectCall,
    declineDirectCall,
    endDirectCall,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    isDirectScreenSharing,
    partnerDirectScreenSharing,
    isDirectCameraOn,
    toggleDirectCamera,
    remoteScreenStreams,
    remoteAssist,
    remoteAssistSafeMode,
    setRemoteAssistSafeMode,
    userVolumes,
    setUserVolume,
    startDirectScreenShare,
    stopDirectScreenShare,
    respondRemoteAssist,
    pauseRemoteAssist,
    updateRemoteAssistPermissions,
    stopRemoteAssist,
  } = useSocket();
  const directCallQuality = useDirectCallQuality();

  const [isRemoteAssistOpen, setIsRemoteAssistOpen] = useState(false);
  const [showDeclineReplies, setShowDeclineReplies] = useState(false);
  const [customDeclineText, setCustomDeclineText] = useState('');
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [shareOptions, setShareOptions] = useState<DirectScreenShareOptions>({
    preset: 'balanced',
    shareAudio: false,
  });
  const [consentPerms, setConsentPerms] = useState<RemoteAssistPermissions>({
    control: true,
    clipboard: true,
    annotate: true,
  });

  const partnerId = directCall?.partner.id;
  const hasPartnerStream = Boolean(
    partnerId && (partnerDirectScreenSharing || remoteScreenStreams.has(partnerId))
  );

  useEffect(() => {
    if (remoteAssist.status === 'controlling') {
      setIsRemoteAssistOpen(true);
    }
  }, [remoteAssist.status]);

  useEffect(() => {
    if (remoteAssist.status === 'incoming_request' && remoteAssist.requestedPermissions) {
      setConsentPerms(remoteAssist.requestedPermissions);
    }
  }, [remoteAssist.status, remoteAssist.requestedPermissions]);

  useEffect(() => {
    setShowDeclineReplies(false);
    setCustomDeclineText('');
    setShowVolumeSlider(false);
    setShowShareOptions(false);
  }, [directCall?.status, directCall?.partner.id]);

  useEffect(() => {
    const callStatus = directCall?.status;
    if (callStatus !== 'incoming' && callStatus !== 'calling') return;

    const mode = callStatus === 'incoming' ? 'incoming' : 'outgoing';
    playCallRingtone(mode);
    const timer = window.setInterval(() => {
      playCallRingtone(mode);
    }, 2200);

    return () => {
      window.clearInterval(timer);
    };
  }, [directCall?.status]);

  const toastStack = directCallToasts.length > 0 && (
    <div className="fixed bottom-4 right-5 z-[9998] space-y-2 max-w-sm pointer-events-auto">
      {directCallToasts.map((toast) => {
        const tone =
          toast.variant === 'error'
            ? 'border-rose-400/50 bg-rose-950/90 text-rose-100'
            : toast.variant === 'warning'
            ? 'border-amber-400/50 bg-amber-950/90 text-amber-100'
            : toast.variant === 'success'
            ? 'border-emerald-400/50 bg-emerald-950/90 text-emerald-100'
            : 'border-sky-400/50 bg-slate-900/95 text-slate-100';
        return (
          <div
            key={toast.id}
            className={`px-3.5 py-2.5 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3 text-xs animate-fade-in ${tone}`}
          >
            <span className="leading-snug font-medium">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissDirectCallToast(toast.id)}
              className="p-0.5 rounded-lg hover:bg-white/10 opacity-70 hover:opacity-100 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );

  if (!directCall) return <>{toastStack}</>;

  const { partner, status, durationSeconds } = directCall;
  const isViewingPartnerDM =
    activeServer?.id === 'direct-messages' &&
    Boolean(activeDMUser) &&
    (activeDMUser?.id === partner.id ||
      activeDMUser?.username.toLowerCase() === partner.username.toLowerCase());

  if (isViewingPartnerDM && status === 'connected') {
    return (
      <>
        {toastStack}
        <Suspense fallback={null}>
          <RemoteAssistModal
            isOpen={isRemoteAssistOpen}
            onClose={() => setIsRemoteAssistOpen(false)}
          />
        </Suspense>
      </>
    );
  }

  const partnerVolume = userVolumes[partner.id] ?? 100;
  const qualityBadge = directCallQuality
    ? classifyConnectionQuality(directCallQuality.rttMs, directCallQuality.packetLossPct)
    : null;

  return (
    <>
      {toastStack}
      <div className="fixed top-4 right-6 z-[9990] animate-fade-in pointer-events-auto select-none space-y-2 max-w-[520px]">
        <div
          className={`ios-glass border bg-neutral-900/95 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl flex items-center gap-3.5 min-w-[350px] transition-all ${
            status === 'incoming'
              ? 'border-emerald-400/80 ring-4 ring-emerald-500/25 shadow-emerald-500/20'
              : 'border-white/20'
          }`}
        >
          {/* Partner Avatar with animation */}
          <div className="relative shrink-0">
            <div
              className={`w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl transition-all overflow-hidden ${
                status === 'incoming' || status === 'calling'
                  ? 'animate-bounce'
                  : partner.isSpeaking
                  ? 'ios-halo'
                  : ''
              }`}
            >
              <AvatarView
                avatar={partner.avatar}
                alt={partner.username}
                fallback="👤"
                className="w-full h-full object-cover"
              />
            </div>
            {status === 'connected' && (
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-black" />
            )}
          </div>

          {/* Call Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-sm text-white truncate">{partner.username}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 font-mono shrink-0">
                1-e-1
              </span>
            </div>

            <div className="text-xs text-white/60 flex items-center gap-2 mt-0.5">
              {status === 'incoming' && (
                <span className="text-emerald-400 font-medium animate-pulse flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  Gelen Sesli Arama...
                </span>
              )}
              {status === 'calling' && (
                <span className="text-blue-400 font-medium animate-pulse flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  Çalıyor...
                </span>
              )}
              {status === 'connected' && (
                <>
                  <span className="font-mono text-emerald-400 text-xs font-semibold">
                    🟢 {formatCallDuration(durationSeconds)}
                  </span>
                  {directCallQuality && qualityBadge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
                        qualityBadge.level === 'poor'
                          ? 'bg-rose-500/20 text-rose-300'
                          : qualityBadge.level === 'fair'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                      title={`Yol: ${directCallQuality.pathType.toUpperCase()} • Kayıp: %${directCallQuality.packetLossPct}`}
                    >
                      <Wifi className="w-2.5 h-2.5" />
                      {directCallQuality.rttMs}ms
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Control Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {status === 'incoming' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowDeclineReplies((v) => !v)}
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center transition ${
                    showDeclineReplies
                      ? 'bg-amber-500 text-black'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title="Mesajla Reddet"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => declineDirectCall()}
                  className="w-10 h-10 rounded-2xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition shadow-lg shadow-red-500/30"
                  title="Reddet"
                >
                  <PhoneOff className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={acceptDirectCall}
                  className="w-10 h-10 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition shadow-lg shadow-emerald-500/30 animate-pulse"
                  title="Kabul Et"
                >
                  <Phone className="w-4 h-4" />
                </button>
              </>
            )}

            {status === 'calling' && (
              <button
                type="button"
                onClick={endDirectCall}
                className="w-10 h-10 rounded-2xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition shadow-lg shadow-red-500/30"
                title="Aramayı İptal Et"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            )}

            {status === 'connected' && (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  title={isMuted ? 'Mikrofonu Aç' : 'Sustur'}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={toggleDeafen}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    isDeafened ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  title={isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Kulaklığı Kapat'}
                >
                  <Headphones className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleDirectCamera}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    isDirectCameraOn
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  title={isDirectCameraOn ? 'Kamerayı Kapat' : 'Kamerayı Aç'}
                >
                  {isDirectCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>

                <div className="relative flex items-center">
                  <button
                    type="button"
                    onClick={() =>
                      isDirectScreenSharing
                        ? stopDirectScreenShare()
                        : startDirectScreenShare(shareOptions)
                    }
                    className={`w-9 h-9 rounded-l-xl flex items-center justify-center transition ${
                      isDirectScreenSharing
                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                    title={
                      isDirectScreenSharing
                        ? 'Ekran Paylaşımını Durdur'
                        : 'Ekranını Paylaş (Uzaktan Yardım Al)'
                    }
                  >
                    {isDirectScreenSharing ? (
                      <MonitorOff className="w-4 h-4" />
                    ) : (
                      <MonitorUp className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowShareOptions((v) => !v)}
                    className="w-5 h-9 rounded-r-xl bg-white/[0.07] hover:bg-white/20 text-white/75 flex items-center justify-center border-l border-black/30 transition"
                    title="Ekran Paylaşım Kalitesi"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                {hasPartnerStream && (
                  <button
                    type="button"
                    onClick={() => setIsRemoteAssistOpen(true)}
                    className="w-9 h-9 rounded-xl bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center transition shadow-lg shadow-sky-500/30 animate-pulse"
                    title="Ekranı Görüntüle & Uzaktan Yardım Et"
                  >
                    <MousePointerClick className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowVolumeSlider((v) => !v)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    showVolumeSlider
                      ? 'bg-sky-500/25 text-sky-300'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  title={`Karşı Taraf Sesi: %${partnerVolume}`}
                >
                  <Volume2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => openDirectMessage(partner)}
                  className="w-9 h-9 rounded-xl bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition"
                  title="DM Sohbetine Git"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={endDirectCall}
                  className="w-9 h-9 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition shadow-lg shadow-red-500/30"
                  title="Aramayı Sonlandır"
                >
                  <PhoneOff className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Decline with Quick Reply Popover */}
        {status === 'incoming' && showDeclineReplies && (
          <div className="rounded-2xl border border-amber-400/35 bg-[#121622]/95 p-3 shadow-2xl backdrop-blur-2xl space-y-2">
            <div className="text-[11px] font-bold text-amber-300">
              Mesajla Reddet ({partner.username})
            </div>
            <div className="flex flex-col gap-1">
              {QUICK_DECLINE_REPLIES.map((txt) => (
                <button
                  key={txt}
                  type="button"
                  onClick={() => declineDirectCall(txt)}
                  className="text-left px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/15 text-xs text-white/90 transition"
                >
                  {txt}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!customDeclineText.trim()) return;
                declineDirectCall(customDeclineText.trim());
              }}
              className="flex items-center gap-1.5 pt-1"
            >
              <input
                type="text"
                value={customDeclineText}
                onChange={(e) => setCustomDeclineText(e.target.value)}
                placeholder="Özel yanıt yaz..."
                className="flex-1 bg-white/5 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-white/35 outline-none focus:border-amber-400/50"
              />
              <button
                type="submit"
                disabled={!customDeclineText.trim()}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-bold flex items-center gap-1 transition"
              >
                <Send className="w-3 h-3" />
                <span>Gönder</span>
              </button>
            </form>
          </div>
        )}

        {/* Screen Share Quality Presets Popover */}
        {status === 'connected' && showShareOptions && (
          <div className="rounded-2xl border border-white/15 bg-[#121622]/95 p-3 shadow-2xl backdrop-blur-2xl space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-white/90">
              <span>Ekran Paylaşımı Ayarları</span>
              <button
                type="button"
                onClick={() => setShowShareOptions(false)}
                className="text-white/50 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'sharp-text', label: 'Keskin Metin (15 FPS)', desc: 'Uzaktan yardım ideal' },
                  { id: 'balanced', label: 'Dengeli (1080p/30)', desc: 'Genel kullanım' },
                  { id: 'smooth-60', label: 'Akıcı (1080p/60)', desc: 'Video & hareketli içerik' },
                  { id: 'source', label: 'Kaynak Kalitesi', desc: 'Doğal çözünürlük' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setShareOptions((prev) => ({ ...prev, preset: item.id }))}
                  className={`p-2 rounded-xl border text-left transition ${
                    shareOptions.preset === item.id
                      ? 'border-sky-400/60 bg-sky-500/20 text-white'
                      : 'border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/10'
                  }`}
                >
                  <div className="text-[11px] font-bold">{item.label}</div>
                  <div className="text-[10px] text-white/50">{item.desc}</div>
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between gap-2 text-xs text-white/80 cursor-pointer pt-1">
              <span>Sistem sesini de paylaş</span>
              <input
                type="checkbox"
                checked={shareOptions.shareAudio}
                onChange={(e) =>
                  setShareOptions((prev) => ({ ...prev, shareAudio: e.target.checked }))
                }
                className="accent-emerald-500 w-4 h-4"
              />
            </label>
            {!isDirectScreenSharing && (
              <button
                type="button"
                onClick={() => {
                  setShowShareOptions(false);
                  void startDirectScreenShare(shareOptions);
                }}
                className="w-full py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition"
              >
                Bu Ayarlarla Paylaş
              </button>
            )}
          </div>
        )}

        {/* Per-User Volume Slider Popover */}
        {status === 'connected' && showVolumeSlider && (
          <div className="rounded-2xl border border-white/15 bg-[#121622]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-2xl space-y-1.5">
            <div className="flex items-center justify-between text-xs text-white/85">
              <span className="font-semibold">{partner.username} Ses Seviyesi</span>
              <span className="font-mono text-sky-300">%{partnerVolume}</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={partnerVolume}
              onChange={(e) => setUserVolume(partner.id, Number(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>
        )}

        {/* Incoming Remote Control Granular Consent Banner */}
        {status === 'connected' && remoteAssist.status === 'incoming_request' && (
          <div className="rounded-2xl border border-amber-400/40 bg-[#141722]/95 p-3 shadow-2xl backdrop-blur-2xl space-y-2.5">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-white/90 leading-snug">
                <strong className="text-amber-300">{remoteAssist.requesterName || partner.username}</strong> bilgisayarınızı uzaktan kontrol etmek istiyor. İzinleri seçin:
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-white/85 pl-6">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentPerms.control}
                  onChange={(e) =>
                    setConsentPerms((p) => ({ ...p, control: e.target.checked }))
                  }
                  className="accent-emerald-500"
                />
                <span>Fare & Klavye</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentPerms.clipboard}
                  onChange={(e) =>
                    setConsentPerms((p) => ({ ...p, clipboard: e.target.checked }))
                  }
                  className="accent-emerald-500"
                />
                <span>Pano Paylaşımı</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentPerms.annotate}
                  onChange={(e) =>
                    setConsentPerms((p) => ({ ...p, annotate: e.target.checked }))
                  }
                  className="accent-emerald-500"
                />
                <span>Lazer & Çizim</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => respondRemoteAssist(false)}
                className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition"
              >
                Reddet
              </button>
              <button
                type="button"
                onClick={() => respondRemoteAssist(true, consentPerms)}
                className="px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white transition shadow-lg shadow-emerald-500/25"
              >
                İzin Ver
              </button>
            </div>
          </div>
        )}

        {/* Active Remote Control Revoke & Live Permission Pill */}
        {status === 'connected' && remoteAssist.status === 'being_controlled' && (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/90 px-3.5 py-2.5 shadow-2xl backdrop-blur-2xl space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-emerald-200 font-semibold min-w-0">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">
                  {remoteAssist.paused
                    ? `${partner.username} — Kontrol Duraklatıldı`
                    : `${partner.username} bilgisayarınızı kontrol ediyor`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => pauseRemoteAssist(!remoteAssist.paused)}
                  className="px-2.5 py-1 rounded-xl bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 text-[11px] font-bold flex items-center gap-1 transition"
                >
                  {remoteAssist.paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  <span>{remoteAssist.paused ? 'Devam' : 'Duraklat'}</span>
                </button>
                <button
                  type="button"
                  onClick={stopRemoteAssist}
                  className="px-2.5 py-1 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold flex items-center gap-1 transition"
                >
                  <Hand className="w-3 h-3" />
                  <span>Durdur</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/70">
              <div className="flex items-center gap-1">
                {(
                  [
                    { key: 'control', label: 'Fare/Klavye' },
                    { key: 'clipboard', label: 'Pano' },
                    { key: 'annotate', label: 'Çizim' },
                  ] as const
                ).map((item) => {
                  const active = remoteAssist.permissions[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        updateRemoteAssistPermissions({ [item.key]: !active })
                      }
                      className={`px-1.5 py-0.5 rounded-md border transition ${
                        active
                          ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                          : 'border-white/10 bg-white/5 text-white/40 line-through'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRemoteAssistSafeMode(!remoteAssistSafeMode)}
                  className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold flex items-center gap-1 transition ${
                    remoteAssistSafeMode
                      ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                      : 'border-amber-400/40 bg-amber-500/20 text-amber-200'
                  }`}
                  title="Alt+F4, Win+R/X/L/E ve Ctrl+Shift+Esc gibi sistem kısayollarını engelle"
                >
                  {remoteAssistSafeMode ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                  <span>{remoteAssistSafeMode ? 'Kısayol Koruması' : 'Kısayol Açık'}</span>
                </button>
                <span className="text-amber-200/80 font-mono">
                  Acil Kes: Ctrl+Alt+Esc / Pause
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        <RemoteAssistModal
          isOpen={isRemoteAssistOpen}
          onClose={() => setIsRemoteAssistOpen(false)}
        />
      </Suspense>
    </>
  );
};
