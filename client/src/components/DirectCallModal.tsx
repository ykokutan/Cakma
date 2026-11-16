import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useSocket } from '../context/SocketContext';
import { AvatarView } from './AvatarView';
import { playCallRingtone } from '../utils/tsSoundEffects';

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
} from 'lucide-react';

export const DirectCallModal: React.FC = () => {
  const {
    directCall,
    activeServer,
    activeDMUser,
    acceptDirectCall,
    declineDirectCall,
    endDirectCall,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    isDirectScreenSharing,
    partnerDirectScreenSharing,
    remoteScreenStreams,
    remoteAssist,
    startDirectScreenShare,
    stopDirectScreenShare,
    respondRemoteAssist,
    stopRemoteAssist,
  } = useSocket();

  const [isRemoteAssistOpen, setIsRemoteAssistOpen] = useState(false);

  const partnerId = directCall?.partner.id;
  const hasPartnerStream = Boolean(partnerId && (partnerDirectScreenSharing || remoteScreenStreams.has(partnerId)));

  useEffect(() => {
    if (remoteAssist.status === 'controlling') {
      setIsRemoteAssistOpen(true);
    }
  }, [remoteAssist.status]);

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

  if (!directCall) return null;

  const { partner, status, durationSeconds } = directCall;
  const isViewingPartnerDM =
    activeServer?.id === 'direct-messages' &&
    Boolean(activeDMUser) &&
    (activeDMUser?.id === partner.id ||
      activeDMUser?.username.toLowerCase() === partner.username.toLowerCase());

  if (isViewingPartnerDM && status === 'connected') {
    return (
      <Suspense fallback={null}>
        <RemoteAssistModal
          isOpen={isRemoteAssistOpen}
          onClose={() => setIsRemoteAssistOpen(false)}
        />
      </Suspense>
    );
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <div className="fixed top-4 right-6 z-[9990] animate-fade-in pointer-events-auto select-none space-y-2 max-w-[440px]">
        <div
          className={`ios-glass border bg-neutral-900/95 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl flex items-center gap-3.5 min-w-[330px] transition-all ${
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
              <AvatarView avatar={partner.avatar} alt={partner.username} fallback="👤" className="w-full h-full object-cover" />
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

            <div className="text-xs text-white/60 flex items-center gap-1.5">
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
                <span className="font-mono text-emerald-400 text-xs font-semibold">
                  🟢 {formatDuration(durationSeconds)}
                </span>
              )}
            </div>
          </div>

          {/* Control Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {status === 'incoming' && (
              <>
                <button
                  onClick={declineDirectCall}
                  className="w-10 h-10 rounded-2xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition shadow-lg shadow-red-500/30"
                  title="Reddet"
                >
                  <PhoneOff className="w-4 h-4" />
                </button>
                <button
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
                  onClick={toggleMute}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  title={isMuted ? 'Mikrofonu Aç' : 'Sustur'}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <button
                  onClick={toggleDeafen}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    isDeafened ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  title={isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Kulaklığı Kapat'}
                >
                  <Headphones className="w-4 h-4" />
                </button>

                <button
                  onClick={() => (isDirectScreenSharing ? stopDirectScreenShare() : startDirectScreenShare())}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    isDirectScreenSharing
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  title={isDirectScreenSharing ? 'Ekran Paylaşımını Durdur' : 'Ekranını Paylaş (Uzaktan Yardım Al)'}
                >
                  {isDirectScreenSharing ? <MonitorOff className="w-4 h-4" /> : <MonitorUp className="w-4 h-4" />}
                </button>

                {hasPartnerStream && (
                  <button
                    onClick={() => setIsRemoteAssistOpen(true)}
                    className="w-9 h-9 rounded-xl bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center transition shadow-lg shadow-sky-500/30 animate-pulse"
                    title="Ekranı Görüntüle & Uzaktan Yardım Et (TeamViewer)"
                  >
                    <MousePointerClick className="w-4 h-4" />
                  </button>
                )}

                <button
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

        {/* Incoming Remote Control Consent Banner */}
        {status === 'connected' && remoteAssist.status === 'incoming_request' && (
          <div className="rounded-2xl border border-amber-400/40 bg-[#141722]/95 p-3 shadow-2xl backdrop-blur-2xl space-y-2">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-white/90 leading-snug">
                <strong className="text-amber-300">{remoteAssist.requesterName || partner.username}</strong> bilgisayarınızı uzaktan kontrol etmek (TeamViewer) istiyor.
              </div>
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
                onClick={() => respondRemoteAssist(true)}
                className="px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white transition shadow-lg shadow-emerald-500/25"
              >
                İzin Ver
              </button>
            </div>
          </div>
        )}

        {/* Active Remote Control Revoke Pill */}
        {status === 'connected' && remoteAssist.status === 'being_controlled' && (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/85 px-3.5 py-2 shadow-2xl backdrop-blur-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-emerald-200 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{partner.username} şu anda bilgisayarınızı kontrol ediyor</span>
            </div>
            <button
              type="button"
              onClick={stopRemoteAssist}
              className="px-2.5 py-1 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold flex items-center gap-1 transition shrink-0"
            >
              <Hand className="w-3 h-3" />
              <span>Durdur</span>
            </button>
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
